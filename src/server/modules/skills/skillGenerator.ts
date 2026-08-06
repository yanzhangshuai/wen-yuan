import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { serializeSkillFrontmatter } from "@/server/modules/skills/content-schema";
import { createSkillService } from "@/server/modules/skills/skillService";

/**
 * =============================================================================
 * 文件定位（Skill 域：技能生成器）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/skills/skillGenerator.ts`
 *
 * 模块职责：
 * - 从书籍分析信号（高频称谓、字典外关系码、新名字模式）生成候选 Skill；
 * - 落库为 DRAFT 技能包，交管理员审核激活。
 *
 * 本期边界：
 * - 结构化信号 → MD 文档（正文承载知识表，AI 阅读）；
 * - LLM 驱动的深度内容润色将在 Agent 引擎（阶段 D）就绪后接入。
 * =============================================================================
 */

/** 书籍分析信号（由分析管线 Pass0/Pass5 产出）。 */
export interface SkillGenerationSignals {
  bookId   : string;
  /** 高频但未建档的称谓（如 TITLE_ONLY 高频词）。 */
  frequentTitles?: string[];
  /** 出现但不在关系类型字典内的关系码。 */
  unknownRelationshipCodes?: string[];
  /** 新出现的名字模式（正则或描述）。 */
  newNamePatterns?: Array<{ ruleType: string; pattern: string; description?: string }>;
}

export interface GenerateSkillResult {
  skillId: string;
  slug   : string;
  status : string;
}

export function createSkillGenerator(prismaClient: PrismaClient = prisma) {
  const service = createSkillService(prismaClient);

  /** 生成技能 slug：`gen-<bookId 前 8 位>-<序号>`。 */
  function buildSlug(bookId: string, existingSlugs: Set<string>): string {
    const prefix = `gen-${bookId.slice(0, 8)}`;
    let index = 1;
    let slug = `${prefix}-${index}`;
    while (existingSlugs.has(slug)) {
      index += 1;
      slug = `${prefix}-${index}`;
    }
    return slug;
  }

  /** 把结构化信号组装为 MD 文档（frontmatter + 正文知识表）。 */
  function buildMarkdownFromSignals(signals: SkillGenerationSignals): string {
    const sections: string[] = [
      "# 生成技能",
      "",
      "> 本技能由 SkillGenerator 从分析信号生成，请管理员审核知识条目并补充指令后激活。"
    ];

    if (signals.frequentTitles && signals.frequentTitles.length > 0) {
      sections.push("", "## 高频称谓", "", "以下称谓在书中高频出现但未建档，可能是泛称或特殊称呼：");
      sections.push("", ...signals.frequentTitles.slice(0, 50).map((title) => `- ${title}`));
    }

    if (signals.unknownRelationshipCodes && signals.unknownRelationshipCodes.length > 0) {
      sections.push("", "## 待归类关系", "", "以下关系类型未在现有字典中，请确认规范 code 与方向：");
      sections.push(
        "",
        "| 关系 | 方向 | 说明 |",
        "|------|------|------|",
        ...signals.unknownRelationshipCodes.slice(0, 30).map((code) => `| ${code} | 待定 | 待归类 |`)
      );
    }

    if (signals.newNamePatterns && signals.newNamePatterns.length > 0) {
      sections.push("", "## 新名字模式", "", "以下名字模式需要复核（默认 WARN，谨慎处理）：");
      sections.push(
        "",
        "| 模式 | 类型 | 说明 |",
        "|------|------|------|",
        ...signals.newNamePatterns.slice(0, 20).map((pattern) =>
          `| \`${pattern.pattern}\` | ${pattern.ruleType} | ${pattern.description ?? ""} |`
        )
      );
    }

    return `${serializeSkillFrontmatter({ kind: "HYBRID", triggers: { priority: 0 } })}\n\n${sections.join("\n")}`;
  }

  /**
   * 功能：从书籍信号生成 DRAFT 技能包。
   * 输入：分析信号（高频称谓/字典外关系码/新名字模式）。
   * 输出：创建的技能标识与状态（DRAFT）。
   * 异常：信号为空或书籍不存在时抛错。
   */
  async function generateSkillFromSignals(signals: SkillGenerationSignals): Promise<GenerateSkillResult> {
    if (!signals.bookId) {
      throw new Error("生成技能需要 bookId");
    }
    if (
      (!signals.frequentTitles || signals.frequentTitles.length === 0)
      && (!signals.unknownRelationshipCodes || signals.unknownRelationshipCodes.length === 0)
      && (!signals.newNamePatterns || signals.newNamePatterns.length === 0)
    ) {
      throw new Error("生成技能需要至少一类信号（高频称谓/字典外关系码/新名字模式）");
    }

    const book = await prismaClient.book.findUnique({
      where : { id: signals.bookId },
      select: { id: true, title: true }
    });
    if (!book) {
      throw new Error(`书籍不存在: ${signals.bookId}`);
    }

    const existing = await prismaClient.skill.findMany({
      where : { deletedAt: null },
      select: { slug: true }
    });
    const slug = buildSlug(signals.bookId, new Set(existing.map((skill) => skill.slug)));

    const created = await service.createSkill({
      slug       : slug,
      name       : `${book.title} 生成技能`,
      description: `由 SkillGenerator 从《${book.title}》分析信号生成，待审核。`,
      category   : "HYBRID",
      scope      : "BOOK_TYPE",
      content    : buildMarkdownFromSignals(signals),
      isBuiltin  : false
    });

    return {
      skillId: created.id,
      slug   : created.slug,
      status : "DRAFT"
    };
  }

  return {
    generateSkillFromSignals,
    buildMarkdownFromSignals
  };
}

export type SkillGenerator = ReturnType<typeof createSkillGenerator>;

export const skillGenerator = createSkillGenerator(prisma);
