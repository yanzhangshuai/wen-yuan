/**
 * identityService（单一写路径）
 *
 * 四路回写（Tier1 / Tier2 / reconcile / cross-validation）统一入口。
 * 事务内 writes entities + aliases + entity_profiles + agent_write_audits。
 * 写后失效 registryCache。
 *
 * 架构依据：docs/architecture/13-agent-architecture-v5.md §6（登记表派生视图）
 */
import { type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { invalidateRegistryCache } from "./registry.ts";

export type WriteSource = "identity" | "tier1" | "tier2" | "reconcile" | "cross_validation";

export interface RegistryWriteEntry {
  canonical  : string;
  aliases    : string[];
  type       : "PERSON" | "LOCATION" | "ORGANIZATION" | "CONCEPT";
  nameType?  : "NAMED" | "TITLE_ONLY";
  confidence?: number;
}

export interface RegistryWriteRequest {
  bookId    : string;
  source    : WriteSource;
  agentRunId: string;
  entries   : RegistryWriteEntry[];
}

/**
 * 单事务写入：entities + aliases + entity_profiles + agent_write_audits。
 * - canonical 匹配现有全局实体（name 精确）→ 合并 aliases[]
 * - 不存在 → 创建新实体 + 本书 profile
 * - 每条写 agent_write_audits（before/after）
 */
export async function writeRegistry(input: RegistryWriteRequest): Promise<{ created: number; updated: number }> {
  const { bookId, source, agentRunId, entries } = input;
  let created = 0;
  let updated = 0;

  await prisma.$transaction(async (tx) => {
    for (const entry of entries) {
      let entity = await tx.entity.findFirst({
        where : { name: entry.canonical, deletedAt: null },
        select: { id: true, aliases: true, confidence: true }
      });
      const before = entity ? { id: entity.id, aliases: entity.aliases, confidence: entity.confidence } : null;

      if (entity) {
        const merged = Array.from(new Set([...entity.aliases, ...entry.aliases]));
        await tx.entity.update({
          where: { id: entity.id },
          data : { aliases: merged, confidence: entry.confidence ?? entity.confidence }
        });
        updated++;
      } else {
        entity = await tx.entity.create({
          data: {
            name        : entry.canonical,
            entityType  : entry.type,
            nameType    : entry.nameType ?? "NAMED",
            recordSource: "AI",
            confidence  : entry.confidence ?? 0.7,
            aliases     : entry.aliases
          },
          select: { id: true, aliases: true, confidence: true }
        });
        created++;
      }

      const current = entity; // if/else 两分支均已赋值非空

      // 本书 profile（唯一键 entityId+bookId）
      const existingProfile = await tx.entityProfile.findFirst({
        where: { entityId: current.id, bookId, deletedAt: null }
      });
      if (!existingProfile) {
        await tx.entityProfile.create({
          data: { entityId: current.id, bookId, localName: entry.canonical, recordSource: "AI" }
        });
      }

      // aliases 表注册（幂等）
      for (const alias of entry.aliases) {
        const existingAlias = await tx.alias.findFirst({
          where: { bookId, alias, deletedAt: null, entityId: entity.id }
        });
        if (!existingAlias) {
          await tx.alias.create({
            data: {
              entityId    : current.id,
              bookId,
              alias,
              aliasType   : "NICKNAME",
              status      : "CONFIRMED",
              recordSource: "DRAFT_AI",
              confidence  : entry.confidence ?? 0.7
            }
          });
        }
      }

      // 审计（Json 字段需显式转 InputJsonValue）
      await tx.agentWriteAudit.create({
        data: {
          agentRunId,
          stepIndex : 0,
          action    : before ? "UPDATE" : "CREATE",
          objectType: "entity",
          objectId  : current.id,
          before    : before as Prisma.InputJsonValue,
          after     : { id: current.id, aliases: current.aliases } as Prisma.InputJsonValue,
          allowed   : true,
          reason    : `source=${source}`
        }
      });
    }
  });

  invalidateRegistryCache(bookId);
  return { created, updated };
}
