import type { PrismaClient } from "@/generated/prisma/client";
import { SkillStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import {
  parseSkillMetadata,
  type SkillDocument
} from "@/server/modules/skills/content-schema";

/**
 * =============================================================================
 * 文件定位（Skill 域：技能装载器）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/skills/loader.ts`
 *
 * 模块职责：
 * - 装载 status=ACTIVE 且 isEnabled=true 的候选技能，返回**完整 MD 文档列表**（AI 自主阅读与应用）；
 * - `loadSkill(skillId)` 按需加载单个技能的激活版全文（供 agent 的 load_skill 工具）；
 * - 不做知识字典抽取/合并——知识作为 MD 上下文交给 AI。
 *
 * 装载规则：
 * 1. 仅 status=ACTIVE 且 isEnabled=true（deletedAt=null）；
 * 2. 每个 skill 取全局激活版（v5：skill 版本激活即全局激活，无书型专属激活版）；
 * 3. 按 triggers.priority 降序 + skill.sortOrder 排序；
 * 4. triggers.taskTypes 为空表示全部阶段，否则需包含当前 taskType。
 *
 * v5 阶段 1（08-07-v5-skill-loading）：book_type_skills / book_type 关联已删，
 * 暂不过滤 bookType；阶段 2 改由 AI 动态 skill 选择（job.skillsSnapshot）决定装载集合。
 * =============================================================================
 */

/** 解析后的技能装载上下文（agent system prompt 的"可用技能"段）。 */
export interface ResolvedSkillContext {
  /** 候选技能（只含元数据 + 全文 MD，供 AI 选择加载）。 */
  skills  : SkillDocument[];
  /** 按 priority 降序排序后的技能元数据摘要（注入上下文的轻量列表）。 */
  summary : Array<{ slug: string; name: string; description: string | null; versionNo: number }>;
  loadedAt: string;
}

export function createSkillLoader(prismaClient: PrismaClient = prisma) {
  /**
   * 功能：装载全局启用技能（返回完整 MD 文档）。
   * 输入：可选 taskType。
   * 输出：ResolvedSkillContext。
   * 异常：单技能 frontmatter 非法时跳过并告警。
   *
   * v5 阶段 1 临时实现：不做 bookType 过滤（表已删）；阶段 2 改由 AI 动态选择。
   */
  async function resolveSkillsForBook(
    _bookId: string,
    taskType?: string
  ): Promise<ResolvedSkillContext> {
    const skills = await prismaClient.skill.findMany({
      where: {
        status   : SkillStatus.ACTIVE,
        isEnabled: true,
        deletedAt: null
      },
      include: {
        versions: {
          where  : { isActive: true },
          select : { id: true, versionNo: true, content: true, isActive: true },
          orderBy: { versionNo: "desc" }
        }
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });

    const candidates: SkillDocument[] = [];

    for (const skill of skills) {
      // v5：版本激活即全局激活（无书型专属激活版）
      const version = skill.versions[0];
      if (!version) {
        continue;
      }

      // 解析 frontmatter 元数据（单技能非法仅告警，不阻断整体装载）
      let metadata;
      try {
        metadata = parseSkillMetadata(version.content);
      } catch (error) {
        console.warn(`[SkillLoader] frontmatter 解析失败，跳过 ${skill.slug}:`, error instanceof Error ? error.message : String(error));
        continue;
      }

      // taskType 过滤
      const triggers = metadata.triggers;
      if (taskType && triggers.taskTypes && triggers.taskTypes.length > 0 && !triggers.taskTypes.includes(taskType)) {
        continue;
      }

      candidates.push({
        slug       : skill.slug,
        name       : metadata.name ?? skill.name,
        description: metadata.description ?? skill.description,
        versionNo  : version.versionNo,
        metadata   : { ...metadata, triggers },
        markdown   : version.content
      });
    }

    // 按 priority 降序排序
    candidates.sort((left, right) => (right.metadata.triggers.priority ?? 0) - (left.metadata.triggers.priority ?? 0));

    return {
      skills : candidates,
      summary: candidates.map((skill) => ({
        slug       : skill.slug,
        name       : skill.name,
        description: skill.description,
        versionNo  : skill.versionNo
      })),
      loadedAt: new Date().toISOString()
    };
  }

  /**
   * 功能：按 skillId 加载激活版全文（供 agent 的 load_skill 工具按需注入上下文）。
   * 输入：skillId。
   * 输出：完整 MD 文档；无激活版或不存在时返回 null。
   */
  async function loadSkill(skillId: string): Promise<string | null> {
    const skill = await prismaClient.skill.findUnique({
      where : { id: skillId, deletedAt: null },
      select: {
        slug    : true,
        name    : true,
        versions: {
          where  : { isActive: true },
          select : { content: true, versionNo: true },
          orderBy: { versionNo: "desc" }
        }
      }
    });
    if (!skill) {
      return null;
    }

    return skill.versions[0]?.content ?? null;
  }

  return {
    resolveSkillsForBook,
    loadSkill
  };
}

export type SkillLoader = ReturnType<typeof createSkillLoader>;

export const skillLoader = createSkillLoader(prisma);
