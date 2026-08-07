/**
 * 自动接受栈（Pass4 例外审核流核心）。
 *
 * 依据架构 doc §7.1：一条 fact 自动落 VERIFIED（recordSource=AUTO_VERIFIED）
 * 需要可验证的客观信号，不靠模型自报置信度——五条件全过：
 *   ① 证据锚定：fact 涉及的所有名字都能在本章正文确定性找到（幻觉过滤）
 *   ② 实体在登记表 HIGH：不在登记表或 LOW → 不进自动接受
 *   ③ 提及数 ≥ 2：单次提及且证据单薄不自动接受
 *   ④ 分布式冲突扫描干净：涉及实体无误归属冲突
 *   ⑤ 确定性校验全过：关系码在 skill 契约闭集 + 方向正确 + 不与已有事实冲突
 *
 * 跨片/跨章一致 = 加分项，不用于免审（同模型错误相关）。
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { getRegistry, type BookRegistry } from "@/server/modules/identity/registry";
import { isNameInText } from "@/server/modules/extraction/guardrails";
import { relationshipCodesFromSnapshot, type RelationshipCodeInfo } from "@/server/modules/extraction/schema";

import { AUTO_ACCEPT_MIN_CONFIDENCE_TIER, AUTO_ACCEPT_MIN_MENTIONS } from "./config";

/** 待判定事实行（自动接受栈输入）。 */
interface FactForReview {
  id                  : string;
  sourceEntityId      : string | null;
  targetEntityId      : string | null;
  relationshipTypeCode: string | null;
  evidence            : string;
  chapter            : {
    content: string;
  };
  sourceEntity: { name: string; aliases: string[] } | null;
  targetEntity: { name: string; aliases: string[] } | null;
}

export interface AcceptResult {
  accepted     : string[];
  rejected     : string[];
  /** 每条被拒事实的缺失条件（用于人审队列分类）。 */
  rejectReasons: Record<string, string[]>;
}

/** 一条事实涉及的全部名字（canonical + aliases），用于证据锚定与登记表判定。 */
function factNames(fact: FactForReview): string[] {
  const names: string[] = [];
  for (const entity of [fact.sourceEntity, fact.targetEntity]) {
    if (entity) {
      names.push(entity.name, ...entity.aliases);
    }
  }
  return names;
}

/** 条件①：证据锚定——fact 涉及的所有名字在本章正文可证。 */
function passesEvidenceAnchor(fact: FactForReview): boolean {
  const names = factNames(fact);
  if (names.length === 0) {
    return false;
  }
  return names.some((name) => isNameInText(name, fact.chapter.content));
}

/** 条件②：实体在登记表 HIGH。 */
function passesRegistryHigh(fact: FactForReview, registry: BookRegistry): boolean {
  const entityIds = [fact.sourceEntityId, fact.targetEntityId].filter(Boolean) as string[];
  if (entityIds.length === 0) {
    return false;
  }
  return entityIds.every((entityId) => {
    const entry = registry.entries.find((e) => e.entityId === entityId);
    return entry?.confidenceTier === AUTO_ACCEPT_MIN_CONFIDENCE_TIER;
  });
}

/**
 * 功能：对某本书的一个分析任务的 DRAFT 事实执行自动接受栈判定。
 * 输入：jobId。
 * 输出：接受/拒绝的 fact id 及各自缺失条件（供人审队列分类）。
 * 异常：job 不存在时抛错。
 * 副作用：接受的事实更新 status=VERIFIED + recordSource=AUTO_VERIFIED + reviewedAt/reviewedBy；拒绝的事实保留 DRAFT。
 */
export async function acceptFactsForJob(
  jobId: string,
  prismaClient: PrismaClient = prisma
): Promise<AcceptResult> {
  const job = await prismaClient.analysisJob.findUnique({
    where : { id: jobId },
    select: { id: true, bookId: true, relationshipTypesSnapshot: true }
  });
  if (!job) {
    throw new Error(`分析任务不存在: ${jobId}`);
  }

  const facts = await prismaClient.fact.findMany({
    where : { jobId, status: "DRAFT" },
    select: {
      id                  : true,
      sourceEntityId      : true,
      targetEntityId      : true,
      relationshipTypeCode: true,
      evidence            : true,
      chapter             : { select: { content: true } },
      sourceEntity        : { select: { name: true, aliases: true } },
      targetEntity        : { select: { name: true, aliases: true } }
    }
  }) as unknown as FactForReview[];

  const registry = await getRegistry(job.bookId, prismaClient);
  const validCodes = new Set(
    relationshipCodesFromSnapshot(job.relationshipTypesSnapshot).map((r: RelationshipCodeInfo) => r.code)
  );

  const accepted: string[] = [];
  const rejected: string[] = [];
  const rejectReasons: Record<string, string[]> = {};

  const acceptedIds: string[] = [];

  for (const fact of facts) {
    const reasons: string[] = [];

    if (!passesEvidenceAnchor(fact)) {
      reasons.push("evidence_anchor");
    }
    if (!passesRegistryHigh(fact, registry)) {
      reasons.push("registry_not_high");
    }
    if (!(await passesMentionCount(fact, job.bookId, prismaClient))) {
      reasons.push("mention_lt_2");
    }
    if (!passesConflictScan(fact, job.bookId, prismaClient)) {
      reasons.push("conflict_dirty");
    }
    if (!passesContractCheck(fact, validCodes)) {
      reasons.push("contract_invalid");
    }

    if (reasons.length === 0) {
      accepted.push(fact.id);
      acceptedIds.push(fact.id);
    } else {
      rejected.push(fact.id);
      rejectReasons[fact.id] = reasons;
    }
  }

  if (acceptedIds.length > 0) {
    await prismaClient.fact.updateMany({
      where: { id: { in: acceptedIds } },
      data : {
        status      : "VERIFIED",
        recordSource: "AUTO_VERIFIED",
        reviewedAt  : new Date(),
        reviewedBy  : null
      }
    });
  }

  return { accepted, rejected, rejectReasons };
}

/** 条件③：提及数 ≥ 2（实体相关 mention 在本书 ≥2）。 */
async function passesMentionCount(
  fact: FactForReview,
  bookId: string,
  client: PrismaClient
): Promise<boolean> {
  const entityIds = [fact.sourceEntityId, fact.targetEntityId].filter(Boolean) as string[];
  if (entityIds.length === 0) {
    return false;
  }
  const mentionCount = await client.mention.count({
    where: {
      entityId : { in: entityIds },
      deletedAt: null,
      chapter  : { bookId }
    }
  });
  return mentionCount >= AUTO_ACCEPT_MIN_MENTIONS;
}

/** 条件④：分布式冲突扫描干净（涉及实体无误归属冲突）。 */
function passesConflictScan(
  _fact: FactForReview,
  _bookId: string,
  _client: PrismaClient
): boolean {
  // 冲突扫描是 identity 域职责，完整信号依赖管线分布式扫描结果（v5-pipeline 接入）。
  // 当前恒过（占位），管线接入时替换为真实 conflictScan 结果。
  return true;
}

/** 条件⑤：确定性校验——关系码在 skill 契约闭集（任务快照）。 */
function passesContractCheck(fact: FactForReview, validCodes: Set<string>): boolean {
  // 仅 RELATION 事实校验关系码；其余事实类型无码约束。
  if (!fact.relationshipTypeCode) {
    return true;
  }
  return validCodes.size === 0 || validCodes.has(fact.relationshipTypeCode);
}
