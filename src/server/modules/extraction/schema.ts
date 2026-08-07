/**
 * 提取 schema 动态生成（schema.ts）
 *
 * - 关系码契约从 skill frontmatter relationshipCodes 并集（getRelationshipCodesFromSkills）；
 * - getRelationshipCodes(bookId) 从该书最近任务快照（analysis_jobs.relationshipTypesSnapshot）取码；
 * - factType 枚举 + payload 结构
 * - 任务启动时快照（analysis_jobs.relationshipTypesSnapshot）防片间漂移
 *
 * 架构依据：docs/architecture/13-agent-architecture-v5.md §4（schema 运行时动态生成）
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

export const FACT_TYPES = ["BIOGRAPHY", "RELATION", "ITEM_TRANSFER", "ORGANIZATION_EVENT", "GENERIC"] as const;
export const EVENT_CATEGORIES = ["BIRTH", "EXAM", "CAREER", "TRAVEL", "SOCIAL", "DEATH", "EVENT"] as const;

export interface RelationshipCodeInfo {
  code     : string;
  direction: "INVERSE" | "SYMMETRIC";
  category : string;
}

/** 关系码契约来源（skill frontmatter relationshipCodes 并集；relationshipCodes 可为 null/缺失）。 */
export interface RelationshipCodeSource {
  metadata: { relationshipCodes?: RelationshipCodeInfo[] | null };
}

/**
 * 并集各 skill frontmatter 的 relationshipCodes 契约（skillSelector/装载链路共用，权威实现）。
 * 去重按 code，先到先得；aliases 不进入运行契约。
 */
export function getRelationshipCodesFromSkills(skills: RelationshipCodeSource[]): RelationshipCodeInfo[] {
  const result: RelationshipCodeInfo[] = [];
  const seen = new Set<string>();

  for (const skill of skills) {
    for (const rc of skill.metadata.relationshipCodes ?? []) {
      if (seen.has(rc.code)) {
        continue;
      }
      seen.add(rc.code);
      result.push({ code: rc.code, direction: rc.direction, category: rc.category });
    }
  }

  return result;
}

export interface ExtractionSchema {
  factTypes            : string[];
  relationshipTypeCodes: string[];
  eventCategories      : string[];
  /** 各 factType 的 payload 结构（供 prompt 描述，非运行时校验） */
  payloadShapes        : Record<string, string[]>;
}

/** 各 factType 的 payload 字段（对应 schema Fact.payload 注释）。 */
const PAYLOAD_SHAPES: Record<string, string[]> = {
  BIOGRAPHY         : ["summary", "ironyNote", "tags"],
  RELATION          : ["summary"],
  ITEM_TRANSFER     : ["itemName", "quantity", "reason"],
  ORGANIZATION_EVENT: ["summary", "orgRole"],
  GENERIC           : ["summary", "key", "value"]
};

/**
 * 读取某书的有效关系码。
 *
 * 来源：该书最近一次 AnalysisJob 的关系码契约快照（analysis_jobs.relationshipTypesSnapshot，
 * 任务启动时由 selectSkillsForJob 写入）。无任务或快照为空 → 返回 [] 并告警（提取阶段读快照，
 * 若管线未先执行 skill 选择，说明编排缺失，这里仅兜底不抛错）。
 */
export async function getRelationshipCodes(bookId: string, txClient?: PrismaClient): Promise<RelationshipCodeInfo[]> {
  const client = txClient ?? prisma;

  const latestJob = await client.analysisJob.findFirst({
    where  : { bookId },
    orderBy: { createdAt: "desc" },
    select : { relationshipTypesSnapshot: true }
  });
  if (!latestJob) {
    console.warn(`[schema.getRelationshipCodes] 书籍 ${bookId} 无分析任务，关系码契约缺失，返回空`);
    return [];
  }

  const codes = relationshipCodesFromSnapshot(latestJob.relationshipTypesSnapshot);
  if (codes.length === 0) {
    console.warn(`[schema.getRelationshipCodes] 书籍 ${bookId} 最近任务关系码快照为空`);
  }
  return codes;
}

/**
 * 生成提取 schema（供 prompt 注入 + 结构化输出约束）。
 * @param relationshipCodes 关系码（快照或实时）
 */
export function buildExtractionSchema(relationshipCodes: RelationshipCodeInfo[]): ExtractionSchema {
  return {
    factTypes            : [...FACT_TYPES],
    relationshipTypeCodes: relationshipCodes.map((r) => r.code),
    eventCategories      : [...EVENT_CATEGORIES],
    payloadShapes        : PAYLOAD_SHAPES
  };
}

/** 从快照 JSON 恢复关系码列表。 */
export function relationshipCodesFromSnapshot(snapshot: unknown): RelationshipCodeInfo[] {
  if (!Array.isArray(snapshot)) return [];
  return (snapshot as RelationshipCodeInfo[]).filter(
    (r) => r && typeof r.code === "string" && (r.direction === "INVERSE" || r.direction === "SYMMETRIC")
  );
}
