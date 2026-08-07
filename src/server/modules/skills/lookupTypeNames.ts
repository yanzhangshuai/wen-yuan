import type { PrismaClient } from "@/generated/prisma/client";
import { SkillStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { parseSkillMetadata, type RelationshipCode } from "@/server/modules/skills/content-schema";

/**
 * 关系码 → 展示名 映射（图谱 DTO 用）。
 *
 * code→name 从所有 active+enabled skill 的 relationshipCodes 契约并集取（`name ?? code`），
 * 缺名回退 code；skill 停用后历史码名回退 code 可接受（契约即全局码表权威）。
 */
export async function lookupRelationshipTypeNames(
  codes: string[],
  client: PrismaClient = prisma
): Promise<Map<string, string>> {
  if (codes.length === 0) {
    return new Map<string, string>();
  }

  const skills = await client.skill.findMany({
    where : { status: SkillStatus.ACTIVE, isEnabled: true, deletedAt: null },
    select: {
      versions: {
        where  : { isActive: true },
        select : { content: true },
        orderBy: { versionNo: "desc" }
      }
    }
  });

  const nameByCode = new Map<string, string>();
  const seen = new Set<string>();

  for (const skill of skills) {
    const version = skill.versions[0];
    if (!version) {
      continue;
    }

    let relationshipCodes: RelationshipCode[] | null;
    try {
      relationshipCodes = parseSkillMetadata(version.content).relationshipCodes;
    } catch (error) {
      console.warn("[lookupTypeNames] skill frontmatter 解析失败，跳过:", error instanceof Error ? error.message : String(error));
      continue;
    }

    for (const rc of relationshipCodes ?? []) {
      if (seen.has(rc.code)) {
        continue;
      }
      seen.add(rc.code);
      // 契约条目可携带可选展示名（name ?? code）；当前契约未定义 name，恒回退 code
      const displayName = (rc as RelationshipCode & { name?: string }).name?.trim() || rc.code;
      nameByCode.set(rc.code, displayName);
    }
  }

  return nameByCode;
}
