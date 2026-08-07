import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/**
 * 关系码 → 展示名 映射（图谱 DTO 用）。
 *
 * v5：relationship_types 表是关系码唯一权威（旧 RelationshipTypeDefinition 已删）。
 * displayName = nameByCode.get(code) ?? code
 */
export async function lookupRelationshipTypeNames(
  codes: string[],
  client: PrismaClient = prisma,
): Promise<Map<string, string>> {
  const uniqueCodes = [...new Set(codes)].filter(Boolean);
  if (uniqueCodes.length === 0) {
    return new Map();
  }

  const types = await client.relationshipType.findMany({
    where: { code: { in: uniqueCodes }, isActive: true },
    select: { code: true, name: true },
  });

  return new Map(types.map((t) => [t.code, t.name]));
}
