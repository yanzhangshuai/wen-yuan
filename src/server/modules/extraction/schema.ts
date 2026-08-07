/**
 * 提取 schema 动态生成（schema.ts）
 *
 * - 按书型从 relationship_types 读关系码（全局 + 本书型）
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
  code: string;
  direction: "INVERSE" | "SYMMETRIC";
  category: string;
}

export interface ExtractionSchema {
  factTypes: string[];
  relationshipTypeCodes: string[];
  eventCategories: string[];
  /** 各 factType 的 payload 结构（供 prompt 描述，非运行时校验） */
  payloadShapes: Record<string, string[]>;
}

/** 各 factType 的 payload 字段（对应 schema Fact.payload 注释）。 */
const PAYLOAD_SHAPES: Record<string, string[]> = {
  BIOGRAPHY: ["summary", "ironyNote", "tags"],
  RELATION: ["summary"],
  ITEM_TRANSFER: ["itemName", "quantity", "reason"],
  ORGANIZATION_EVENT: ["summary", "orgRole"],
  GENERIC: ["summary", "key", "value"],
};

/**
 * 读取某书的有效关系码（全局 + 本书型）。
 * bookTypeId 来自书的 bookType。
 */
export async function getRelationshipCodes(bookId: string, txClient?: PrismaClient): Promise<RelationshipCodeInfo[]> {
  const client = txClient ?? prisma;
  const book = await client.book.findUnique({
    where: { id: bookId },
    select: { bookTypeId: true },
  });
  const bookTypeId = book?.bookTypeId ?? null;

  const rows = await client.relationshipType.findMany({
    where: {
      isActive: true,
      OR: [{ bookTypeId: null }, { bookTypeId }],
    },
    select: { code: true, direction: true, category: true },
  });
  return rows;
}

/**
 * 生成提取 schema（供 prompt 注入 + 结构化输出约束）。
 * @param relationshipCodes 关系码（快照或实时）
 */
export function buildExtractionSchema(relationshipCodes: RelationshipCodeInfo[]): ExtractionSchema {
  return {
    factTypes: [...FACT_TYPES],
    relationshipTypeCodes: relationshipCodes.map((r) => r.code),
    eventCategories: [...EVENT_CATEGORIES],
    payloadShapes: PAYLOAD_SHAPES,
  };
}

/** 从快照 JSON 恢复关系码列表。 */
export function relationshipCodesFromSnapshot(snapshot: unknown): RelationshipCodeInfo[] {
  if (!Array.isArray(snapshot)) return [];
  return (snapshot as RelationshipCodeInfo[]).filter(
    (r) => r && typeof r.code === "string" && (r.direction === "INVERSE" || r.direction === "SYMMETRIC"),
  );
}
