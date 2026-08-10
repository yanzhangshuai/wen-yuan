import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { SkillStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import {
  parseEditableSkillMetadata,
  parseSkillMetadata,
  type RelationshipCode
} from "@/server/modules/skills/content-schema";

/**
 * =============================================================================
 * 文件定位（Skill 域：技能包 CRUD）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/skills/skillService.ts`
 *
 * 模块职责：
 * - Skill 的领域服务：创建/列表/详情/启停/内容保存；
 * - skill = MD 文档（frontmatter 装载元数据 + 正文知识），content 直存当前生效内容，
 *   保存即覆盖，无版本历史。
 *
 * 业务边界：
 * - 只负责技能包的"数据管理"，不负责装载合并（见 loader.ts）。
 * - content 写入必须通过 parseSkillMetadata 校验，防止漂移。
 * =============================================================================
 */

export interface CreateSkillInput {
  slug        : string;
  name        : string;
  description?: string;
  scope       : "GLOBAL" | "BOOK_TYPE";
  /** skill 的 MD 文档内容（YAML frontmatter + 正文）。 */
  content     : string;
  status?     : SkillStatus;
}

export interface SkillListItem {
  id         : string;
  slug       : string;
  name       : string;
  description: string | null;
  scope      : string;
  status     : SkillStatus;
  createdAt  : string;
  updatedAt  : string;
}

export interface SkillDetail {
  id         : string;
  slug       : string;
  name       : string;
  description: string | null;
  scope      : string;
  status     : SkillStatus;
  /** 完整 MD 文档（frontmatter + 正文）。 */
  content    : string;
  createdAt  : string;
  updatedAt  : string;
}

export function createSkillService(prismaClient: PrismaClient = prisma) {
  /**
   * 功能：校验 skill 的 MD 内容（frontmatter 元数据合法即可，正文由 AI 阅读）。
   * 输入：MD 字符串。
   * 异常：frontmatter 非法时抛错。
   */
  function validateContent(md: string): void {
    parseSkillMetadata(md);
  }

  /**
   * 功能：创建技能包。
   * 输入：技能基础信息 + content。
   * 输出：创建后的 Skill 记录。
   * 异常：slug 冲突、content 非法时抛错。
   * 副作用：写入 skills 表。
   */
  async function createSkill(input: CreateSkillInput): Promise<{ id: string; slug: string }> {
    // 先解析校验 MD，确保 frontmatter 合法后才落库
    validateContent(input.content);

    const created = await prismaClient.skill.create({
      data: {
        slug       : input.slug,
        name       : input.name,
        description: input.description,
        scope      : input.scope,
        status     : input.status ?? SkillStatus.ENABLED,
        content    : input.content
      },
      select: { id: true, slug: true, name: true }
    });

    return { id: created.id, slug: created.slug };
  }

  /**
   * 功能：技能包列表。
   * 输入：可选状态过滤。
   * 输出：技能包列表。
   */
  async function listSkills(filter?: {
    status?: SkillStatus;
  }): Promise<SkillListItem[]> {
    const rows = await prismaClient.skill.findMany({
      where: {
        ...(filter?.status ? { status: filter.status } : {}),
        deletedAt: null
      },
      orderBy: [{ createdAt: "asc" }]
    });

    return rows.map((row) => ({
      id         : row.id,
      slug       : row.slug,
      name       : row.name,
      description: row.description,
      scope      : row.scope,
      status     : row.status,
      createdAt  : row.createdAt.toISOString(),
      updatedAt  : row.updatedAt.toISOString()
    }));
  }

  /**
   * 功能：技能包详情（含完整 MD 内容）。
   * 输入：skillId。
   * 输出：详情或 null。
   */
  async function getSkill(skillId: string): Promise<SkillDetail | null> {
    const row = await prismaClient.skill.findUnique({
      where: { id: skillId }
    });
    if (!row) {
      return null;
    }

    return {
      id         : row.id,
      slug       : row.slug,
      name       : row.name,
      description: row.description,
      scope      : row.scope,
      status     : row.status,
      content    : row.content,
      createdAt  : row.createdAt.toISOString(),
      updatedAt  : row.updatedAt.toISOString()
    };
  }

  /**
   * 功能：读取 skill 当前内容的 frontmatter 契约（关系码闭集）。
   * 输入：skillId。
   * 输出：`{ relationshipCodes }`；skill 不存在返回 null，
   *       frontmatter 解析失败时契约为空数组（管理端只读展示，不阻断）。
   * 异常：无。
   */
  async function getSkillContract(skillId: string): Promise<{
    relationshipCodes: RelationshipCode[];
  } | null> {
    const skill = await prismaClient.skill.findUnique({
      where : { id: skillId },
      select: { content: true }
    });
    if (!skill) {
      return null;
    }

    try {
      const metadata = parseSkillMetadata(skill.content);
      return {
        relationshipCodes: metadata.relationshipCodes ?? []
      };
    } catch (error) {
      console.warn("[skillService] frontmatter 解析失败，契约按空展示:", error instanceof Error ? error.message : String(error));
      return { relationshipCodes: [] };
    }
  }

  /**
   * 功能：设置技能包状态（ENABLED/DISABLED）。
   * 输入：skillId、status。
   * 副作用：写 skills 表。
   */
  async function setStatus(skillId: string, status: SkillStatus): Promise<void> {
    await prismaClient.skill.update({
      where: { id: skillId },
      data : { status }
    });
  }

  /**
   * 功能：更新技能基本信息（name/description/scope/status）。
   * 输入：skillId 与待更新字段（仅更新出现的字段）。
   * 副作用：写 skills 表。
   */
  async function updateSkillInfo(input: {
    skillId     : string;
    name?       : string;
    description?: string | null;
    scope?      : "GLOBAL" | "BOOK_TYPE";
    status?     : SkillStatus;
  }): Promise<void> {
    await prismaClient.skill.update({
      where: { id: input.skillId },
      data : {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.scope !== undefined ? { scope: input.scope } : {}),
        ...(input.status !== undefined ? { status: input.status } : {})
      }
    });
  }

  /**
   * 功能：保存 skill 内容（MD 文档 = frontmatter + 正文），直接覆盖当前内容。
   * 输入：skillId、新 content。
   * 异常：frontmatter 非法或 skill 不存在时抛错。
   * 副作用：写 skills 表；frontmatter 出现的 name/description/scope 同步 DB 列。
   */
  async function updateSkillContent(input: {
    skillId: string;
    content: string;
  }): Promise<{ updatedAt: string }> {
    validateContent(input.content);

    const existing = await prismaClient.skill.findUnique({
      where : { id: input.skillId },
      select: { id: true }
    });
    if (!existing) {
      throw new Error(`技能包不存在: ${input.skillId}`);
    }

    // frontmatter 是内容源，同步 DB 展示列（name/description/scope 出现才覆盖）。
    const meta = parseEditableSkillMetadata(input.content);
    const patch: Prisma.SkillUpdateInput = { content: input.content };
    if (meta.name !== undefined) {
      patch.name = meta.name;
    }
    if (meta.description !== undefined) {
      patch.description = meta.description;
    }
    if (meta.scope !== undefined) {
      patch.scope = meta.scope;
    }

    const updated = await prismaClient.skill.update({
      where : { id: input.skillId },
      data  : patch,
      select: { updatedAt: true }
    });

    return { updatedAt: updated.updatedAt.toISOString() };
  }

  /**
   * 功能：软删除技能包。
   * 输入：skillId。
   * 副作用：标记 deletedAt。
   */
  async function deleteSkill(skillId: string): Promise<void> {
    await prismaClient.skill.update({
      where: { id: skillId },
      data : { deletedAt: new Date() }
    });
  }

  return {
    validateContent,
    createSkill,
    listSkills,
    getSkill,
    getSkillContract,
    setStatus,
    updateSkillInfo,
    updateSkillContent,
    deleteSkill
  };
}

export type SkillService = ReturnType<typeof createSkillService>;

export const skillService = createSkillService(prisma);
