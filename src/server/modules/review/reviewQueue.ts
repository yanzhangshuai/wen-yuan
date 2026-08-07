/**
 * 人审队列（Pass4 例外审核流）。
 *
 * 依据架构 doc §7.2：人工只看异常——跨片冲突 / 低置信新实体 /
 * TITLE_ONLY 泛称 / merge-split 建议 / 关系级幻觉定向抽样 / 棘轮回查抽样。
 * MERGE/SPLIT 一律人审（L3 责任边界），无自动路径。
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/** 人审队列项类型（对应架构 doc §7.2 的异常分类）。 */
export type ReviewQueueItemType =
  | "cross_slice_conflict"   // 跨片冲突
  | "low_confidence_new"     // 低置信新实体
  | "title_only_generic"     // TITLE_ONLY 泛称
  | "merge_split"            // merge/split 建议（一律人审）
  | "hallucination_sample"   // 关系级幻觉定向抽样
  | "ratchet_recheck";       // 棘轮回查抽样

export interface ReviewQueueItem {
  factId    : string;
  type      : ReviewQueueItemType;
  reason    : string;
  confidence: number;
  evidence  : string;
}

export interface ReviewQueueFilters {
  bookId   : string;
  type?    : ReviewQueueItemType;
  page?    : number;
  pageSize?: number;
}

/**
 * 功能：列出某本书的 DRAFT 事实中进入人审队列的异常项。
 * 输入：bookId + 可选类型/分页。
 * 输出：人审队列项列表（异常类型 + 原因 + 置信度）。
 * 异常：数据库异常向上抛出。
 * 副作用：只读查询。
 */
export async function listReviewQueue(
  filters: ReviewQueueFilters,
  prismaClient: PrismaClient = prisma
): Promise<ReviewQueueItem[]> {
  const page = filters.page ?? 1;
  const pageSize = Math.min(filters.pageSize ?? 50, 100);

  const facts = await prismaClient.fact.findMany({
    where: {
      bookId: filters.bookId,
      status: "DRAFT",
      ...(filters.type ? { /* 类型过滤由派生分类处理，此处全量后归类 */ } : {})
    },
    select: {
      id          : true,
      confidence  : true,
      evidence    : true,
      sourceEntity: { select: { name: true, nameType: true } },
      targetEntity: { select: { name: true, nameType: true } },
      recordSource: true
    },
    orderBy: [{ confidence: "asc" }, { id: "asc" }],
    skip   : (page - 1) * pageSize,
    take   : pageSize
  });

  const items: ReviewQueueItem[] = [];

  for (const fact of facts) {
    const type = classifyItem(fact);
    if (!type) {
      continue;
    }
    items.push({
      factId    : fact.id,
      type,
      reason    : classifyReason(type),
      confidence: fact.confidence,
      evidence  : fact.evidence
    });
  }

  return filters.type ? items.filter((item) => item.type === filters.type) : items;
}

interface QueueFactRow {
  id          : string;
  confidence  : number;
  evidence    : string;
  sourceEntity: { name: string; nameType: string } | null;
  targetEntity: { name: string; nameType: string } | null;
  recordSource: string;
}

/** 派生分类：把一条 DRAFT 事实归类到人审队列异常类型。 */
function classifyItem(fact: QueueFactRow): ReviewQueueItemType | null {
  // TITLE_ONLY 泛称（涉及任一实体是 TITLE_ONLY）→ 人审
  if (
    fact.sourceEntity?.nameType === "TITLE_ONLY" ||
    fact.targetEntity?.nameType === "TITLE_ONLY"
  ) {
    return "title_only_generic";
  }
  // 低置信新实体（recordSource=DRAFT_AI 且低置信）→ 人审
  if (fact.recordSource === "DRAFT_AI" && fact.confidence < 0.6) {
    return "low_confidence_new";
  }
  return null;
}

/** 分类原因描述（供人审界面展示）。 */
function classifyReason(type: ReviewQueueItemType): string {
  switch (type) {
    case "cross_slice_conflict" : return "同一关系跨片提取不一致，需人工判断";
    case "low_confidence_new"   : return "新实体且置信度低，身份不确定";
    case "title_only_generic"   : return "TITLE_ONLY 泛称无法溯源";
    case "merge_split"          : return "实体合并/拆分建议，高危操作一律人审";
    case "hallucination_sample" : return "关系级幻觉定向抽样（真实实体+假关系）";
    case "ratchet_recheck"      : return "自动接受棘轮回查抽样";
  }
}
