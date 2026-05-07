import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/**
 * 批量加载 RelationshipTypeDefinition，返回 code → name 映射。
 * 用于取代 Prisma relation 的 include，实现软参考层 fallback：
 * displayName = nameByCode.get(code) ?? code
 */
export async function lookupRelationshipTypeNames(
  codes: string[],
  client: PrismaClient = prisma
): Promise<Map<string, string>> {
  const uniqueCodes = [...new Set(codes)].filter(Boolean);
  if (uniqueCodes.length === 0) {
    return new Map();
  }

  const types = await client.relationshipTypeDefinition.findMany({
    where : { code: { in: uniqueCodes } },
    select: { code: true, name: true }
  });

  return new Map(types.map((t) => [t.code, t.name]));
}

/**
 * 批量加载 RelationshipTypeDefinition，返回完整 info map（code → { name, directionMode, group, etc. }）。
 * 用于需要方向判断等更多字段的场景。
 */
export async function lookupRelationshipTypeInfos(
  codes: string[],
  client: PrismaClient = prisma
): Promise<Map<string, {
  name           : string;
  group          : string;
  directionMode  : string;
  sourceRoleLabel: string | null;
  targetRoleLabel: string | null;
}>> {
  const uniqueCodes = [...new Set(codes)].filter(Boolean);
  if (uniqueCodes.length === 0) {
    return new Map();
  }

  const types = await client.relationshipTypeDefinition.findMany({
    where : { code: { in: uniqueCodes } },
    select: {
      code           : true,
      name           : true,
      group          : true,
      directionMode  : true,
      sourceRoleLabel: true,
      targetRoleLabel: true
    }
  });

  return new Map(types.map((t) => {
    const { code, ...info } = t;
    return [code, info];
  }));
}
