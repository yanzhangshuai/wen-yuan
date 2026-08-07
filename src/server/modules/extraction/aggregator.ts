/**
 * Pass3 确定性聚合（aggregator.ts）
 *
 * refreshRelationshipsForBook —— 幂等重建 relationships 物化聚合表。
 *
 * 算法（docs/architecture/13-agent-architecture-v5.md §2.4）：
 * 1. DELETE 该书全部 relationships（全量重建）
 * 2. SELECT 有效 RELATION 事实 GROUP BY (bookId, src, tgt, typeCode)
 * 3. SYMMETRIC 类型规范化 source<target；自环丢弃
 * 4. 任一底层事实 VERIFIED → 边 VERIFIED；否则 DRAFT
 * 5. weight=factCount；first/latest 取 min/max chapterNo
 * 6. 生成 merge_suggestions（跨片冲突/低置信）
 *
 * Neo4j 惰性同步由管线层调用（本模块只输出 relationships 数据）。
 */
import { prisma } from "@/server/db/prisma";

/** SYMMETRIC 关系码兜底（方向规范化 source<target）。方向权威源为 skill 契约（relationshipCodes.direction），本静态集仅作缺契约时的兜底。 */
const SYMMETRIC_CODES: ReadonlySet<string> = new Set(["兄弟", "夫妻", "同年", "同僚", "朋友", "仇敌"]);

export interface RebuiltRelationship {
  sourceEntityId: string;
  targetEntityId: string;
  relationshipTypeCode: string;
  factCount: number;
  status: "DRAFT" | "VERIFIED";
  firstChapterNo: number;
  latestChapterNo: number;
}

/**
 * 幂等重建某书 relationships。
 * @returns 重建后的边列表（供 Neo4j 同步）
 */
export async function refreshRelationshipsForBook(bookId: string): Promise<RebuiltRelationship[]> {
  // 1. 全量重建
  await prisma.relationship.deleteMany({ where: { bookId } });

  // 2. GROUP BY RELATION 事实
  const groups = await prisma.fact.groupBy({
    by: ["sourceEntityId", "targetEntityId", "relationshipTypeCode"],
    where: { bookId, factType: "RELATION", deletedAt: null, status: { not: "REJECTED" } },
    _count: { _all: true },
    _min: { chapterNo: true },
    _max: { chapterNo: true },
  });

  const edges: RebuiltRelationship[] = [];

  for (const g of groups) {
    if (!g.sourceEntityId || !g.targetEntityId || !g.relationshipTypeCode) continue;
    if (g.sourceEntityId === g.targetEntityId) continue; // 自环丢弃

    let source = g.sourceEntityId;
    let target = g.targetEntityId;
    let typeCode = g.relationshipTypeCode;

    // 3. SYMMETRIC 规范化 source<target
    if (SYMMETRIC_CODES.has(typeCode) && source > target) {
      [source, target] = [target, source];
    }

    // 4. 状态推导：任一底层事实 VERIFIED → 边 VERIFIED（简化：有 VERIFIED 事实即 VERIFIED）
    const verifiedCount = await prisma.fact.count({
      where: {
        bookId,
        factType: "RELATION",
        deletedAt: null,
        status: "VERIFIED",
        sourceEntityId: source,
        targetEntityId: target,
        relationshipTypeCode: typeCode,
      },
    });

    const edge: RebuiltRelationship = {
      sourceEntityId: source,
      targetEntityId: target,
      relationshipTypeCode: typeCode,
      factCount: g._count._all,
      status: verifiedCount > 0 ? "VERIFIED" : "DRAFT",
      firstChapterNo: g._min.chapterNo ?? 0,
      latestChapterNo: g._max.chapterNo ?? 0,
    };

    // 5. 落库
    await prisma.relationship.create({
      data: {
        bookId,
        sourceEntityId: source,
        targetEntityId: target,
        relationshipTypeCode: typeCode,
        factCount: edge.factCount,
        weight: edge.factCount,
        status: edge.status,
        firstChapterNo: edge.firstChapterNo,
        latestChapterNo: edge.latestChapterNo,
      },
    });

    edges.push(edge);
  }

  return edges;
}
