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
 * 单实体写事务：entities + aliases + entity_profiles + agent_write_audits。
 * - canonical 匹配现有全局实体（name 精确）→ 合并 aliases[]
 * - 不存在 → 创建新实体 + 本书 profile
 * - 每条写 agent_write_audits（before/after）
 *
 * 每个 entry 独立事务：全书身份 Pass 一次 ~200 实体，若共用一个大交互事务会
 * 在 5 秒超时窗口内做数千次往返而超时（"query cannot be executed on an expired
 * transaction"）。entry 之间无依赖，拆分后各事务仅数次往返，安全。
 *
 * @returns "created" | "updated"（用于主循环计数）
 */
async function writeRegistryEntry(
  tx: Prisma.TransactionClient,
  entry: RegistryWriteEntry,
  bookId: string,
  agentRunId: string,
  source: WriteSource
): Promise<"created" | "updated"> {
  let entity = await tx.entity.findFirst({
    where : { name: entry.canonical, deletedAt: null },
    select: { id: true, aliases: true, confidence: true }
  });
  const before = entity ? { id: entity.id, aliases: entity.aliases, confidence: entity.confidence } : null;

  if (entity) {
    const merged = Array.from(new Set([...entity.aliases, ...entry.aliases]));
    entity = await tx.entity.update({
      where : { id: entity.id },
      data  : { aliases: merged, confidence: entry.confidence ?? entity.confidence },
      select: { id: true, aliases: true, confidence: true }
    });
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
  }

  const current = entity; // 分支后必非空

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

  return before ? "updated" : "created";
}

/**
 * 多实体写入：按 entry 拆分为独立事务，避免大事务超时。
 * 每个 entry 返回 created/updated，主循环累计。
 */
export async function writeRegistry(input: RegistryWriteRequest): Promise<{ created: number; updated: number }> {
  const { bookId, source, agentRunId, entries } = input;
  let created = 0;
  let updated = 0;

  for (const entry of entries) {
    const kind = await prisma.$transaction((tx) => writeRegistryEntry(tx, entry, bookId, agentRunId, source));
    if (kind === "created") created += 1;
    else updated += 1;
  }

  invalidateRegistryCache(bookId);
  return { created, updated };
}
