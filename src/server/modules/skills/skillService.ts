import type { PrismaClient } from "@/generated/prisma/client";
import { type SkillCategory, SkillStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { auditLog } from "@/server/modules/knowledge/audit";
import {
  parseSkillMetadata,
  type RelationshipCode
} from "@/server/modules/skills/content-schema";

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
  slug        : string;
  name        : string;
  description?: string;
  category    : SkillCategory;
  scope       : "GLOBAL" | "BOOK_TYPE";
  /** skill 的 MD 文档内容（YAML frontmatter + 正文）。 */
  content     : string;
  isBuiltin  ?: boolean;
  sortOrder  ?: number;
}

/** 技能独立启停开关（is_enabled，false=全局不可用）。 */
export interface SetSkillEnabledInput {
  skillId  : string;
  isEnabled: boolean;
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
  /** 独立启停开关（false=全局不可用，管理端列表展示/切换）。 */
  isEnabled  : boolean;
  versionNo  : number | null;
  createdAt  : string;
  updatedAt  : string;
}

export interface SkillDetail {
  id                 : string;
  slug               : string;
  name               : string;
  description        : string | null;
  category           : SkillCategory;
  scope              : string;
  status             : SkillStatus;
  source             : string;
  sortOrder          : number;
  isBuiltin          : boolean;
  isEnabled          : boolean;
  generatedFromBookId: string | null;
  versions   : Array<{
    id        : string;
    versionNo : number;
    content   : string;
    isActive  : boolean;
    isBaseline: boolean;
    changeNote: string | null;
    createdAt : string;
  }>;
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
        objectType: "SKILL",
        objectId  : created.id,
        objectName: created.name,
        action    : "CREATE",
        after     : { slug: created.slug }
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
    category?: SkillCategory;
    status?  : SkillStatus;
  }): Promise<SkillListItem[]> {
    const rows = await prismaClient.skill.findMany({
      where: {
        ...(filter?.category ? { category: filter.category } : {}),
        ...(filter?.status ? { status: filter.status } : {}),
        deletedAt: null
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      include: {
        versions: {
          where  : { isActive: true },
          select : { versionNo: true },
          orderBy: { versionNo: "desc" },
          take   : 1
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
      isEnabled  : row.isEnabled,
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
      where  : { id: skillId },
      include: {
        versions: { orderBy: { versionNo: "desc" } }
      }
    });
    if (!row) {
      return null;
    }

    return {
      id                 : row.id,
      slug               : row.slug,
      name               : row.name,
      description        : row.description,
      category           : row.category,
      scope              : row.scope,
      status             : row.status,
      source             : row.source,
      sortOrder          : row.sortOrder,
      isBuiltin          : row.isBuiltin,
      isEnabled          : row.isEnabled,
      generatedFromBookId: row.generatedFromBookId,
      versions           : row.versions.map((version) => ({
        id        : version.id,
        versionNo : version.versionNo,
        content   : version.content,
        isActive  : version.isActive,
        isBaseline: version.isBaseline,
        changeNote: version.changeNote,
        createdAt : version.createdAt.toISOString()
      }))
    };
  }

  /**
   * 功能：读取 skill 当前激活版本的 frontmatter 契约（关系码 / 虚指名单）。
   * 输入：skillId。
   * 输出：`{ versionNo, relationshipCodes, deicticJunk }`；skill 不存在返回 null，
   *       无激活版或 frontmatter 解析失败时契约为空数组（管理端只读展示，不阻断）。
   * 异常：无。
   */
  async function getSkillContract(skillId: string): Promise<{
    versionNo        : number | null;
    relationshipCodes: RelationshipCode[];
    deicticJunk      : string[];
  } | null> {
    const skill = await prismaClient.skill.findUnique({
      where  : { id: skillId },
      include: {
        versions: {
          where  : { isActive: true },
          orderBy: { versionNo: "desc" },
          take   : 1
        }
      }
    });
    if (!skill) {
      return null;
    }

    const active = skill.versions[0];
    if (!active) {
      return { versionNo: null, relationshipCodes: [], deicticJunk: [] };
    }

    try {
      const metadata = parseSkillMetadata(active.content);
      return {
        versionNo        : active.versionNo,
        relationshipCodes: metadata.relationshipCodes ?? [],
        deicticJunk      : metadata.deicticJunk ?? []
      };
    } catch (error) {
      console.warn("[skillService] 激活版 frontmatter 解析失败，契约按空展示:", error instanceof Error ? error.message : String(error));
      return { versionNo: active.versionNo, relationshipCodes: [], deicticJunk: [] };
    }
  }

  /**
   * 功能：新增内容版本（版本号自增）。
   * 输入：skillId、新 content、变更说明。
   * 输出：新建的版本记录。
   * 异常：skill 不存在或 content 非法时抛错。
   */
  async function createNewVersion(input: {
    skillId    : string;
    content    : string;
    changeNote?: string;
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
      where  : { skillId: input.skillId },
      orderBy: { versionNo: "desc" },
      select : { versionNo: true }
    });

    const version = await prismaClient.skillVersion.create({
      data: {
        skillId   : input.skillId,
        versionNo : (latest?.versionNo ?? 0) + 1,
        content   : input.content,
        isActive  : false,
        changeNote: input.changeNote,
        createdBy : input.createdBy
      },
      select: { id: true, versionNo: true }
    });

    await auditLog({
      objectType: "SKILL",
      objectId  : input.skillId,
      objectName: skill.name,
      action    : "UPDATE",
      after     : { versionNo: version.versionNo }
    });

    return version;
  }

  /**
   * 功能：激活指定版本（激活即全局激活，无书型专属激活版）。
   * 输入：skillId、versionId。
   * 副作用：写审计日志。
   */
  async function activateVersion(input: {
    skillId  : string;
    versionId: string;
  }): Promise<void> {
    const version = await prismaClient.skillVersion.findFirst({
      where : { id: input.versionId, skillId: input.skillId },
      select: { id: true, skillId: true }
    });
    if (!version) {
      throw new Error(`版本不存在: ${input.versionId}`);
    }

    await prismaClient.$transaction(async (tx) => {
      // 停用同 skill 其他激活版
      await tx.skillVersion.updateMany({
        where: {
          skillId : input.skillId,
          isActive: true
        },
        data: { isActive: false }
      });
      // 激活目标版
      await tx.skillVersion.update({
        where: { id: input.versionId },
        data : { isActive: true }
      });
    });

    const skill = await prismaClient.skill.findUnique({
      where : { id: input.skillId },
      select: { name: true }
    });
    await auditLog({
      objectType: "SKILL",
      objectId  : input.skillId,
      objectName: skill?.name ?? input.skillId,
      action    : "ACTIVATE",
      after     : { versionId: input.versionId }
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
      objectType: "SKILL",
      objectId  : skillId,
      objectName: skill?.name ?? skillId,
      action    : status === SkillStatus.ACTIVE ? "ACTIVATE" : "UPDATE",
      after     : { status }
    });
  }

  /**
   * 功能：切换技能独立启停开关（is_enabled，false=该 skill 全局不可用）。
   * 输入：skillId、isEnabled。
   * 副作用：写审计日志。
   */
  async function setSkillEnabled(skillId: string, isEnabled: boolean): Promise<void> {
    await prismaClient.skill.update({
      where: { id: skillId },
      data : { isEnabled }
    });

    const skill = await prismaClient.skill.findUnique({
      where : { id: skillId },
      select: { name: true }
    });
    await auditLog({
      objectType: "SKILL",
      objectId  : skillId,
      objectName: skill?.name ?? skillId,
      action    : isEnabled ? "ENABLE" : "DISABLE",
      after     : { isEnabled }
    });
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
    createNewVersion,
    activateVersion,
    setStatus,
    setSkillEnabled,
    deleteSkill
  };
}

export type SkillService = ReturnType<typeof createSkillService>;

export const skillService = createSkillService(prisma);
