/**
 * 确定性归并（v6 Pass1.75，零 LLM）
 *
 * 职责：把身份 Pass 输出的 { canonical → aliases } 映射落库为实体归并。
 *
 * 步骤（单事务）：
 *  1) canonical 实体 + 别名注册：走 identityService.writeRegistry（单一写路径）
 *     - canonical 命中的临时实体（name 精确）即保留实体；
 *     - 不存在则创建新实体；
 *     - 全部 aliases 注册 alias 表（CONFIRMED，身份 Pass 已判定）。
 *  2) 吸收实体归并（v6 相比 v5 mergeEntities 的修复）：
 *     - facts 重指向：sourceEntityId / targetEntityId → 保留实体；
 *     - mentions 重指向：mention.entityId → 保留实体（v5 漏了这步，导致合并后提及统计丢失）；
 *     - aliases 重指向：被吸收实体的 alias 记录 → 保留实体；
 *     - 软删被吸收实体。
 *  关系物化表由紧随其后的 Pass3 refreshRelationshipsForBook 重建（facts 为唯一写入口），
 *  本 Pass 不重复刷新，避免归并后瞬时 DB 负载。
 *
 * 架构依据：docs/architecture/14-agent-architecture-v6.md §5
 */
import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import type { CanonicalGroup } from "./identityPass.ts";
import { type RegistryWriteEntry, writeRegistry } from "./identityService.ts";

export interface ProjectionInput {
  bookId    : string;
  jobId     : string;
  /** Pass 的 agent_run id（审计外键必须真实存在）。 */
  agentRunId: string;
  groups    : CanonicalGroup[];
  /** 身份 Pass 判定的一次性称呼/泛称名单：软删实体 + 相关 mentions/facts。 */
  dropped?  : string[];
}

export interface ProjectionResult {
  retained : number;
  absorbed : number;
  repointed: number;
  /** 软删的 dropped 实体数。 */
  dropped  : number;
}

/**
 * 功能：执行身份归并（canonical 实体 + 吸收临时实体 + dropped 清理）。
 * 输入：bookId/jobId/agentRunId/身份 Pass 输出的 groups + dropped。
 * 副作用：创建/更新 entities、aliases、facts(source/target)、mentions；软删被吸收/dropped 实体。
 */
export async function runProjection(input: ProjectionInput): Promise<ProjectionResult> {
  const result: ProjectionResult = { retained: 0, absorbed: 0, repointed: 0, dropped: 0 };

  if (input.groups.length === 0 && !input.dropped?.length) {
    return result;
  }

  // 1) canonical 实体 + 别名注册（单一写路径，事务内）。
  const entries: RegistryWriteEntry[] = input.groups.map((g) => ({
    canonical : g.canonical,
    aliases   : g.aliases,
    type      : g.type,
    confidence: 0.85
  }));
  if (entries.length > 0) {
    await writeRegistry({
      bookId    : input.bookId,
      source    : "identity",
      agentRunId: input.agentRunId,
      entries
    });
  }

  // 2) 吸收实体归并（facts/mentions/aliases 重指向 + 软删）。
  await prisma.$transaction(async (tx) => {
    for (const group of input.groups) {
      const retained = await findRetained(tx, input.bookId, group.canonical);
      if (!retained) {
        continue;
      }
      result.retained += 1;

      for (const alias of group.aliases) {
        if (alias.trim() === group.canonical.trim()) {
          continue;
        }
        const prov = await tx.entity.findFirst({
          where: {
            name     : alias.trim(),
            id       : { not: retained.id },
            profiles : { some: { bookId: input.bookId, deletedAt: null } },
            deletedAt: null
          },
          select: { id: true }
        });
        if (!prov) {
          continue;
        }

        const facts = await tx.fact.updateMany({
          where: { sourceEntityId: prov.id },
          data : { sourceEntityId: retained.id }
        });
        const facts2 = await tx.fact.updateMany({
          where: { targetEntityId: prov.id },
          data : { targetEntityId: retained.id }
        });
        const mentions = await tx.mention.updateMany({
          where: { entityId: prov.id },
          data : { entityId: retained.id }
        });
        await tx.alias.updateMany({
          where: { entityId: prov.id, bookId: input.bookId },
          data : { entityId: retained.id }
        });
        await tx.entity.update({
          where: { id: prov.id },
          data : { deletedAt: new Date() }
        });

        result.absorbed += 1;
        result.repointed += facts.count + facts2.count + mentions.count;
      }
    }

    // 3) dropped 清理：身份 Pass 判定的一次性称呼/泛称实体 → 软删实体 +
    //    软删其 mentions 与以其为主体的 facts（无持续身份，入图谱即噪声）。
    //    被吸收实体已在步骤 2 软删（含于 dropped 时 findFirst 已排除），此处只处理残留。
    for (const name of input.dropped ?? []) {
      const prov = await tx.entity.findFirst({
        where: {
          name     : name.trim(),
          profiles : { some: { bookId: input.bookId, deletedAt: null } },
          deletedAt: null
        },
        select: { id: true }
      });
      if (!prov) {
        continue;
      }
      const mentions = await tx.mention.updateMany({
        where: { entityId: prov.id },
        data : { deletedAt: new Date() }
      });
      const facts = await tx.fact.updateMany({
        where: { sourceEntityId: prov.id },
        data : { deletedAt: new Date() }
      });
      await tx.entity.update({
        where: { id: prov.id },
        data : { deletedAt: new Date() }
      });
      result.dropped += 1;
      result.repointed += mentions.count + facts.count;
    }
  });

  return result;
}

/** 在事务内按 canonical 名查找本书保留实体（写回 register 后必存在）。 */
async function findRetained(
  tx: Prisma.TransactionClient,
  bookId: string,
  canonical: string
): Promise<{ id: string } | null> {
  return tx.entity.findFirst({
    where: {
      name     : canonical.trim(),
      profiles : { some: { bookId, deletedAt: null } },
      deletedAt: null
    },
    select: { id: true }
  });
}
