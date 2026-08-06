import type { PrismaClient } from "@/generated/prisma/client";
import { SkillCategory, SkillStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { auditLog } from "@/server/modules/knowledge/audit";
import { parseSkillMetadata } from "@/server/modules/skills/content-schema";

/**
 * =============================================================================
 * 文件定位（Skill 域：技能包 CRUD 与版本管理）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/skills/skillService.ts`
 *
 * 模块职责：
 * - Skill / SkillVersion / BookTypeSkill 三个模型的领域服务；
 * - 版本激活（全局激活 vs 书型激活，书型优先于全局）；
 * - 挂书型、启停、审计留痕（KnowledgeAuditLog）。
 *
 * 业务边界：
 * - 只负责技能包的"数据管理"，不负责装载合并（见 loader.ts）。
 * - content 写入必须通过 skillContentSchema 校验，防止漂移。
 * =============================================================================
 */

export interface CreateSkillInput {
  slug       : string;
  name       : string;
  description?: string;
  category   : SkillCategory;
  scope      : "GLOBAL" | "BOOK_TYPE";
  /** skill 的 MD 文档内容（YAML frontmatter + 正文）。 */
  content    : string;
  isBuiltin  ?: boolean;
  sortOrder  ?: number;
}

export interface SkillListItem {
  id         : string;
  slug       : string;
  name       : string;
  description: string | null;
  category   : SkillCategory;
  scope      : string;
  status     : SkillStatus;
  source     : string;
  sortOrder  : number;
  isBuiltin  : boolean;
  versionNo  : number | null;
  createdAt  : string;
  updatedAt  : string;
}

export interface SkillDetail {
  id         : string;
  slug       : string;
  name       : string;
  description: string | null;
  category   : SkillCategory;
  scope      : string;
  status     : SkillStatus;
  source     : string;
  sortOrder  : number;
  isBuiltin  : boolean;
  generatedFromBookId: string | null;
  versions   : Array<{
    id        : string;
    versionNo : number;
    content   : string;
    bookTypeId: string | null;
    isActive  : boolean;
    isBaseline: boolean;
    changeNote: string | null;
    createdAt : string;
  }>;
  bookTypeLinks: Array<{ bookTypeId: string; priority: number; isEnabled: boolean }>;
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
   * 功能：创建技能包（含首个版本）。
   * 输入：技能基础信息 + 初始 content。
   * 输出：创建后的 Skill 记录。
   * 异常：slug 冲突、content 非法时抛错。
   * 副作用：写入 skills + skill_versions + 审计日志。
   */
  async function createSkill(input: CreateSkillInput): Promise<{ id: string; slug: string }> {
    // 先解析校验 MD，确保 frontmatter 合法后才落库
    validateContent(input.content);

    const skill = await prismaClient.$transaction(async (tx) => {
      const created = await tx.skill.create({
        data: {
          slug       : input.slug,
          name       : input.name,
          description: input.description,
          category   : input.category,
          scope      : input.scope,
          status     : SkillStatus.DRAFT,
          source     : "MANUAL",
          isBuiltin  : input.isBuiltin ?? false,
          sortOrder  : input.sortOrder ?? 0,
          versions   : {
            create: {
              versionNo : 1,
              content   : input.content,
              isActive  : false,
              isBaseline: input.isBuiltin ?? false
            }
          }
        },
        select: { id: true, slug: true, name: true }
      });

      await auditLog({
        objectType : "SKILL",
        objectId   : created.id,
        objectName : created.name,
        action     : "CREATE",
        after      : { slug: created.slug }
      });

      return created;
    });

    return { id: skill.id, slug: skill.slug };
  }

  /**
   * 功能：技能包列表。
   * 输入：可选过滤条件（分类/状态/书型关联）。
   * 输出：技能包列表（含当前激活版本号）。
   */
  async function listSkills(filter?: {
    category? : SkillCategory;
    status?   : SkillStatus;
    bookTypeId?: string;
  }): Promise<SkillListItem[]> {
    const rows = await prismaClient.skill.findMany({
      where: {
        ...(filter?.category ? { category: filter.category } : {}),
        ...(filter?.status ? { status: filter.status } : {}),
        ...(filter?.bookTypeId
          ? { bookTypeLinks: { some: { bookTypeId: filter.bookTypeId } } }
          : {}),
        deletedAt: null
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        versions: {
          where : { isActive: true },
          select: { versionNo: true, bookTypeId: true },
          orderBy: { versionNo: "desc" },
          take  : 1
        }
      }
    });

    return rows.map((row) => ({
      id         : row.id,
      slug       : row.slug,
      name       : row.name,
      description: row.description,
      category   : row.category,
      scope      : row.scope,
      status     : row.status,
      source     : row.source,
      sortOrder  : row.sortOrder,
      isBuiltin  : row.isBuiltin,
      versionNo  : row.versions[0]?.versionNo ?? null,
      createdAt  : row.createdAt.toISOString(),
      updatedAt  : row.updatedAt.toISOString()
    }));
  }

  /**
   * 功能：技能包详情（含全部版本与书型关联）。
   * 输入：skillId。
   * 输出：详情或 null。
   */
  async function getSkill(skillId: string): Promise<SkillDetail | null> {
    const row = await prismaClient.skill.findUnique({
      where : { id: skillId },
      include: {
        versions    : { orderBy: { versionNo: "desc" } },
        bookTypeLinks: true
      }
    });
    if (!row) {
      return null;
    }

    return {
      id         : row.id,
      slug       : row.slug,
      name       : row.name,
      description: row.description,
      category   : row.category,
      scope      : row.scope,
      status     : row.status,
      source     : row.source,
      sortOrder  : row.sortOrder,
      isBuiltin  : row.isBuiltin,
      generatedFromBookId: row.generatedFromBookId,
      versions   : row.versions.map((version) => ({
        id        : version.id,
        versionNo : version.versionNo,
        content   : version.content,
        bookTypeId: version.bookTypeId,
        isActive  : version.isActive,
        isBaseline: version.isBaseline,
        changeNote: version.changeNote,
        createdAt : version.createdAt.toISOString()
      })),
      bookTypeLinks: row.bookTypeLinks.map((link) => ({
        bookTypeId: link.bookTypeId,
        priority  : link.priority,
        isEnabled : link.isEnabled
      }))
    };
  }

  /**
   * 功能：新增内容版本（版本号自增）。
   * 输入：skillId、新 content、变更说明。
   * 输出：新建的版本记录。
   * 异常：skill 不存在或 content 非法时抛错。
   */
  async function createNewVersion(input: {
    skillId   : string;
    content   : string;
    changeNote?: string;
    bookTypeId?: string;
    createdBy ?: string;
  }): Promise<{ id: string; versionNo: number }> {
    validateContent(input.content);

    const skill = await prismaClient.skill.findUnique({
      where : { id: input.skillId },
      select: { id: true, name: true }
    });
    if (!skill) {
      throw new Error(`技能包不存在: ${input.skillId}`);
    }

    const latest = await prismaClient.skillVersion.findFirst({
      where   : { skillId: input.skillId },
      orderBy : { versionNo: "desc" },
      select  : { versionNo: true }
    });

    const version = await prismaClient.skillVersion.create({
      data: {
        skillId   : input.skillId,
        versionNo : (latest?.versionNo ?? 0) + 1,
        content   : input.content,
        bookTypeId: input.bookTypeId ?? null,
        isActive  : false,
        changeNote: input.changeNote,
        createdBy : input.createdBy
      },
      select: { id: true, versionNo: true }
    });

    await auditLog({
      objectType : "SKILL",
      objectId   : input.skillId,
      objectName : skill.name,
      action     : "UPDATE",
      after      : { versionNo: version.versionNo }
    });

    return version;
  }

  /**
   * 功能：激活指定版本。
   * - bookTypeId=null：停用该 skill 全部全局激活版，激活目标版（全局）。
   * - bookTypeId 非空：仅停用该书型的激活版，激活目标版（书型覆盖全局）。
   * 输入：skillId、versionId、可选 bookTypeId。
   * 副作用：写审计日志。
   */
  async function activateVersion(input: {
    skillId   : string;
    versionId : string;
    bookTypeId?: string;
  }): Promise<void> {
    const version = await prismaClient.skillVersion.findFirst({
      where : { id: input.versionId, skillId: input.skillId },
      select: { id: true, skillId: true }
    });
    if (!version) {
      throw new Error(`版本不存在: ${input.versionId}`);
    }

    await prismaClient.$transaction(async (tx) => {
      // 停用同作用域其他激活版
      await tx.skillVersion.updateMany({
        where: {
          skillId  : input.skillId,
          bookTypeId: input.bookTypeId ?? null,
          isActive : true
        },
        data: { isActive: false }
      });
      // 激活目标版
      await tx.skillVersion.update({
        where : { id: input.versionId },
        data  : { isActive: true, bookTypeId: input.bookTypeId ?? null }
      });
    });

    const skill = await prismaClient.skill.findUnique({
      where : { id: input.skillId },
      select: { name: true }
    });
    await auditLog({
      objectType : "SKILL",
      objectId   : input.skillId,
      objectName : skill?.name ?? input.skillId,
      action     : "ACTIVATE",
      after      : { versionId: input.versionId, bookTypeId: input.bookTypeId ?? null }
    });
  }

  /**
   * 功能：设置技能包状态（DRAFT/ACTIVE/DISABLED/ARCHIVED）。
   * 输入：skillId、status。
   * 副作用：写审计日志。
   */
  async function setStatus(skillId: string, status: SkillStatus): Promise<void> {
    await prismaClient.skill.update({
      where: { id: skillId },
      data : { status }
    });

    const skill = await prismaClient.skill.findUnique({
      where : { id: skillId },
      select: { name: true }
    });
    await auditLog({
      objectType : "SKILL",
      objectId   : skillId,
      objectName : skill?.name ?? skillId,
      action     : status === SkillStatus.ACTIVE ? "ACTIVATE" : "UPDATE",
      after      : { status }
    });
  }

  /**
   * 功能：挂载书型关联。
   * 输入：skillId、bookTypeId、可选 priority。
   * 副作用：upsert book_type_skills。
   */
  async function linkBookType(skillId: string, bookTypeId: string, priority = 0): Promise<void> {
    await prismaClient.bookTypeSkill.upsert({
      where : { bookTypeId_skillId: { bookTypeId, skillId } },
      update: { priority, isEnabled: true },
      create: { bookTypeId, skillId, priority, isEnabled: true }
    });
  }

  /**
   * 功能：卸载书型关联。
   * 输入：skillId、bookTypeId。
   * 副作用：删除 book_type_skills 记录。
   */
  async function unlinkBookType(skillId: string, bookTypeId: string): Promise<void> {
    await prismaClient.bookTypeSkill.deleteMany({
      where: { bookTypeId, skillId }
    });
  }

  /**
   * 功能：启用/停用书型关联。
   * 输入：skillId、bookTypeId、isEnabled。
   */
  async function setBookTypeEnabled(skillId: string, bookTypeId: string, isEnabled: boolean): Promise<void> {
    await prismaClient.bookTypeSkill.updateMany({
      where: { bookTypeId, skillId },
      data : { isEnabled }
    });
  }

  /**
   * 功能：软删除技能包。
   * 输入：skillId。
   * 副作用：标记 deletedAt。
   */
  async function deleteSkill(skillId: string): Promise<void> {
    await prismaClient.skill.update({
      where : { id: skillId },
      data  : { deletedAt: new Date() }
    });
  }

  return {
    validateContent,
    createSkill,
    listSkills,
    getSkill,
    createNewVersion,
    activateVersion,
    setStatus,
    linkBookType,
    unlinkBookType,
    setBookTypeEnabled,
    deleteSkill
  };
}

export type SkillService = ReturnType<typeof createSkillService>;

export const skillService = createSkillService(prisma);
