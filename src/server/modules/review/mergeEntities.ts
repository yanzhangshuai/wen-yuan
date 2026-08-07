/**
 * 实体合并事务（Pass4 例外审核流 · merge 接受路径）。
 *
 * 依据架构 doc §7.2：MERGE/SPLIT 一律人审（L3 责任边界）。接受合并时执行：
 *   1. facts 迁移：source 实体相关的 RELATION/BIOGRAPHY 事实 sourceEntityId/targetEntityId → targetId
 *   2. aliases 并集：target 实体 aliases 数组并入 source 的 aliases（去重）
 *   3. Entity 软删：source 实体 deletedAt = now()
 *   4. refreshRelationshipsForBook(bookId, tx)：幂等重建关系物化表（facts 是唯一写入口）
 */
import type { Prisma } from "@/generated/prisma/client";

export interface MergeEntitiesInput {
  sourceId: string;
  targetId: string;
}

/**
 * 功能：在给定事务内执行实体合并。
 * 输入：事务客户端 + sourceId（被合并）/ targetId（保留）。
 * 输出：无。
 * 异常：source/target 相同或任一不存在时抛错。
 * 副作用：facts 迁移 + aliases 并集 + Entity 软删 + refreshRelationshipsForBook。
 */
export async function mergeEntitiesInTransaction(
  client: Prisma.TransactionClient,
  input: MergeEntitiesInput
): Promise<void> {
  if (input.sourceId === input.targetId) {
    throw new Error(`实体合并失败：source 与 target 相同 (${input.sourceId})`);
  }

  // 1. facts 迁移：source 作为主语/宾语的事实都改绑到 target。
  await client.fact.updateMany({
    where: { sourceEntityId: input.sourceId },
    data : { sourceEntityId: input.targetId }
  });
  await client.fact.updateMany({
    where: { targetEntityId: input.sourceId },
    data : { targetEntityId: input.targetId }
  });

  // 2. aliases 并集：target 实体并入 source 的别名（去重）。
  const [sourceEntity, targetEntity] = await Promise.all([
    client.entity.findUnique({ where: { id: input.sourceId }, select: { aliases: true } }),
    client.entity.findUnique({ where: { id: input.targetId }, select: { aliases: true } })
  ]);
  if (!sourceEntity || !targetEntity) {
    throw new Error("实体合并失败：source 或 target 实体不存在");
  }
  const mergedAliases = Array.from(new Set([...targetEntity.aliases, ...sourceEntity.aliases]));
  await client.entity.update({
    where: { id: input.targetId },
    data : { aliases: mergedAliases }
  });

  // 3. Entity 软删 source。
  await client.entity.update({
    where: { id: input.sourceId },
    data : { deletedAt: new Date() }
  });

  // 4. 重建关系物化表（facts 变更后必须）。
  // 通过 source 实体的任一 profile 找到 bookId（实体跨书，取合并建议所在书由调用方传入更准；
  // 此处遍历 source 相关的 profile 确定 bookId）。
  const sourceProfiles = await client.entityProfile.findMany({
    where : { entityId: input.sourceId },
    select: { bookId: true }
  });
  for (const profile of sourceProfiles) {
    await refreshRelationshipsForBookSafe(client, profile.bookId);
  }
}

/** 复用 extraction aggregator 的 refreshRelationshipsForBook（传事务客户端）。 */
async function refreshRelationshipsForBookSafe(client: Prisma.TransactionClient, bookId: string): Promise<void> {
  // 延迟导入避免循环依赖（aggregator 不依赖 review）。
  const { refreshRelationshipsForBook } = await import("@/server/modules/extraction/aggregator");
  await refreshRelationshipsForBook(bookId, client);
}
