import type { PrismaClient } from "@/generated/prisma/client";
import { SkillStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import {
  parseSkillMetadata,
  type SkillDocument
} from "@/server/modules/skills/content-schema";
import { parseSkillsSnapshot } from "@/server/modules/skills/skillSelector";

/**
 * =============================================================================
 * 文件定位（Skill 域：技能装载器）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/skills/loader.ts`
 *
 * 模块职责：
 * - `resolveSkillsForJob(jobId)` 从任务快照（AnalysisJob.skillsSnapshot.allLoadedSlugs）
 *   装载技能，返回**完整 MD 文档列表**（AI 自主阅读与应用）；
 * - 不做知识字典抽取/合并——知识作为 MD 上下文交给 AI。
 *
 * 装载规则：
 * 1. 仅 status=ACTIVE 且 isEnabled=true（deletedAt=null）；
 * 2. 装载集合 = scope=GLOBAL（常驻兜底）∪ 任务快照选中的 skill（AI 动态选择结果）；
 * 3. 每个 skill 取全局激活版（skill 版本激活即全局激活，无书型专属激活版）；
 * 4. 按 triggers.priority 降序 + skill.sortOrder 排序。
 *
 * 装载集合由 AI 动态 skill 选择（skillSelector → job.skillsSnapshot）决定，无 bookType 过滤。
 * =============================================================================
 */

/** 解析后的技能装载上下文（agent system prompt 的"可用技能"段）。 */
export interface ResolvedSkillContext {
  /** 候选技能（只含元数据 + 全文 MD，供 AI 选择加载）。 */
  skills     : SkillDocument[];
  /** 按 priority 降序排序后的技能元数据摘要（注入上下文的轻量列表）。 */
  summary    : Array<{ slug: string; name: string; description: string | null; category: string; versionNo: number }>;
  /** 虚指代词契约名单（装载的 GLOBAL skill frontmatter deicticJunk 并集；契约缺失时为空数组）。 */
  deicticJunk: string[];
  loadedAt   : string;
}

export function createSkillLoader(prismaClient: PrismaClient = prisma) {
  /**
   * 功能：按任务快照装载技能（返回完整 MD 文档）。
   * 输入：jobId（读取 analysis_jobs.skillsSnapshot.allLoadedSlugs）。
   * 输出：ResolvedSkillContext。
   * 异常：任务不存在时抛错；单技能 frontmatter 非法时跳过并告警。
   */
  async function resolveSkillsForJob(jobId: string): Promise<ResolvedSkillContext> {
    const job = await prismaClient.analysisJob.findUnique({
      where : { id: jobId },
      select: { skillsSnapshot: true }
    });
    if (!job) {
      throw new Error(`分析任务不存在: ${jobId}`);
    }
    const snapshot = parseSkillsSnapshot(job.skillsSnapshot);
    const allLoadedSlugs = snapshot?.allLoadedSlugs ?? [];

    // 装载集合 = scope=GLOBAL ∪ 快照选中的 slug（均受 isEnabled/ACTIVE 实时约束）
    const skills = await prismaClient.skill.findMany({
      where: {
        status   : SkillStatus.ACTIVE,
        isEnabled: true,
        deletedAt: null,
        OR       : [{ scope: "GLOBAL" }, { slug: { in: allLoadedSlugs } }]
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
    const globalSlugs = new Set<string>();
    const categoryMap = new Map<string, string>();

    for (const skill of skills) {
      // 版本激活即全局激活（无书型专属激活版）
      const version = skill.versions[0];
      if (!version) {
        continue;
      }

      categoryMap.set(skill.slug, skill.category);
      if (skill.scope === "GLOBAL") {
        globalSlugs.add(skill.slug);
      }

      // 解析 frontmatter 元数据（单技能非法仅告警，不阻断整体装载）
      let metadata;
      try {
        metadata = parseSkillMetadata(version.content);
      } catch (error) {
        console.warn(`[SkillLoader] frontmatter 解析失败，跳过 ${skill.slug}:`, error instanceof Error ? error.message : String(error));
        continue;
      }

      candidates.push({
        slug       : skill.slug,
        name       : metadata.name ?? skill.name,
        description: metadata.description ?? skill.description,
        versionNo  : version.versionNo,
        metadata   : { ...metadata, triggers: metadata.triggers },
        markdown   : version.content
      });
    }

    // 按 priority 降序排序
    candidates.sort((left, right) => (right.metadata.triggers.priority ?? 0) - (left.metadata.triggers.priority ?? 0));

    // 虚指代词契约名单：装载的 GLOBAL skill frontmatter deicticJunk 并集（去重）
    const deicticJunk = [
      ...new Set(
        candidates
          .filter((skill) => globalSlugs.has(skill.slug))
          .flatMap((skill) => skill.metadata.deicticJunk ?? [])
      )
    ];

    return {
      skills : candidates,
      summary: candidates.map((skill) => ({
        slug       : skill.slug,
        name       : skill.name,
        description: skill.description,
        category   : categoryMap.get(skill.slug) ?? "",
        versionNo  : skill.versionNo
      })),
      deicticJunk,
      loadedAt: new Date().toISOString()
    };
  }

  return {
    resolveSkillsForJob
  };
}

export type SkillLoader = ReturnType<typeof createSkillLoader>;

export const skillLoader = createSkillLoader(prisma);
