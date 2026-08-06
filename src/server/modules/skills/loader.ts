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
 * - 按书籍 + 任务类型解析候选技能，返回**完整 MD 文档列表**（AI 自主阅读与应用）；
 * - `loadSkill(skillId)` 按需加载单个技能的激活版全文（供 agent 的 load_skill 工具）；
 * - 不做知识字典抽取/合并——知识作为 MD 上下文交给 AI。
 *
 * 装载规则：
 * 1. 仅 status=ACTIVE 且（scope=GLOBAL 或已挂载到本书型）；
 * 2. 每个 skill 选激活版：书型专属激活版优先，否则全局激活版；
 * 3. 按 triggers.priority 降序 + skill.sortOrder 排序；
 * 4. triggers.taskTypes 为空表示全部阶段，否则需包含当前 taskType。
 * =============================================================================
 */

/** 解析后的技能装载上下文（agent system prompt 的"可用技能"段）。 */
export interface ResolvedSkillContext {
  /** 候选技能（只含元数据 + 全文 MD，供 AI 选择加载）。 */
  skills       : SkillDocument[];
  /** 按 priority 降序排序后的技能元数据摘要（注入上下文的轻量列表）。 */
  summary      : Array<{ slug: string; name: string; description: string | null; versionNo: number }>;
  loadedAt     : string;
}

export function createSkillLoader(prismaClient: PrismaClient = prisma) {
  /**
   * 功能：按书籍 + 任务类型解析候选技能（返回完整 MD 文档）。
   * 输入：bookId、可选 taskType。
   * 输出：ResolvedSkillContext。
   * 异常：书籍不存在时抛错；单技能 frontmatter 非法时跳过并告警。
   */
  async function resolveSkillsForBook(
    bookId: string,
    taskType?: string
  ): Promise<ResolvedSkillContext> {
    const book = await prismaClient.book.findUnique({
      where : { id: bookId },
      select: {
        bookTypeId: true,
        bookType  : { select: { key: true, id: true } }
      }
    });
    if (!book) {
      throw new Error(`书籍不存在: ${bookId}`);
    }

    const bookTypeId = book.bookTypeId ?? null;

    const skills = await prismaClient.skill.findMany({
      where: {
        status   : SkillStatus.ACTIVE,
        deletedAt: null,
        OR       : [
          { scope: "GLOBAL" },
          ...(bookTypeId ? [{ bookTypeLinks: { some: { bookTypeId, isEnabled: true } } }] : [])
        ]
      },
      include: {
        versions: {
          where  : { isActive: true },
          select : { id: true, versionNo: true, content: true, bookTypeId: true, isActive: true },
          orderBy: { versionNo: "desc" }
        },
        bookTypeLinks: {
          where : { ...(bookTypeId ? { bookTypeId } : { bookTypeId: undefined }) },
          select: { priority: true, isEnabled: true }
        }
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });

    const candidates: SkillDocument[] = [];

    for (const skill of skills) {
      // 选激活版：书型专属激活版优先，否则全局激活版
      const bookTypeActive = skill.versions.find((version) => version.bookTypeId !== null && version.isActive);
      const globalActive = skill.versions.find((version) => version.bookTypeId === null && version.isActive);
      const version = bookTypeActive ?? globalActive;
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

      // 装载优先级 = skill 书型关联 priority 或 content.triggers.priority（用于排序）
      const linkPriority = skill.bookTypeLinks[0]?.priority ?? 0;
      const priority = Math.max(linkPriority, triggers.priority ?? 0);

      candidates.push({
        slug       : skill.slug,
        name       : metadata.name ?? skill.name,
        description: metadata.description ?? skill.description,
        versionNo  : version.versionNo,
        metadata   : { ...metadata, triggers: { ...triggers, priority } },
        markdown   : version.content
      });
    }

    // 按 priority 降序排序
    candidates.sort((left, right) => (right.metadata.triggers.priority ?? 0) - (left.metadata.triggers.priority ?? 0));

    return {
      skills  : candidates,
      summary : candidates.map((skill) => ({
        slug      : skill.slug,
        name      : skill.name,
        description: skill.description,
        versionNo : skill.versionNo
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
          select : { content: true, versionNo: true, bookTypeId: true },
          orderBy: { versionNo: "desc" }
        }
      }
    });
    if (!skill) {
      return null;
    }

    const bookTypeActive = skill.versions.find((version) => version.bookTypeId !== null);
    const globalActive = skill.versions.find((version) => version.bookTypeId === null);
    const version = bookTypeActive ?? globalActive;
    return version?.content ?? null;
  }

  return {
    resolveSkillsForBook,
    loadSkill
  };
}

export type SkillLoader = ReturnType<typeof createSkillLoader>;

export const skillLoader = createSkillLoader(prisma);
