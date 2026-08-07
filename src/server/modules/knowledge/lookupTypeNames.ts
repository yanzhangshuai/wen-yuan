import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/**
 * 关系码 → 展示名 映射（图谱 DTO 用）。
 *
 * v5 阶段 1（08-07-v5-skill-loading）：relationship_types 表已删，关系码契约入 skill frontmatter。
 * TODO（阶段 3）：code→name 从技能契约快照取（`name ?? code`），缺名回退 code。
 * 此处先返回空映射，避免 getBookGraph 等下游在关系码表删除后编译/运行报错。
 */
export function lookupRelationshipTypeNames(
  _codes: string[],
  _client: PrismaClient = prisma
): Promise<Map<string, string>> {
  return Promise.resolve(new Map<string, string>());
}
