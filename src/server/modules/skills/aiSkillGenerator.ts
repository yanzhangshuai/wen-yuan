import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";
import { SkillStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { loadSystemDefaultModel } from "@/server/modules/models/defaultModel";
import { callJsonLlm } from "@/server/providers/ai/callJsonLlm";
import { parseSkillMetadata } from "@/server/modules/skills/content-schema";
import { createSkillService } from "@/server/modules/skills/skillService";

/**
 * =============================================================================
 * 文件定位（Skill 域：AI 辅助生成器）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/skills/aiSkillGenerator.ts`
 *
 * 模块职责：
 * - 用系统默认模型按管理员的用途描述，生成一个新技能的完整 MD 文档；
 * - 结构化为 JSON 输出后再由本模块组装 frontmatter，保证 YAML 合法可装载；
 * - 落库为 ENABLED 技能包。
 *
 * 与 skillGenerator.ts（信号生成）的区别：
 * - skillGenerator 从书籍分析信号（高频称谓/未知关系码）生成候选技能，确定性模板；
 * - 本模块由管理员主动触发，AI 自由设计知识内容，属于"AI 辅助创建"。
 * =============================================================================
 */

/** AI 生成输出结构（LLM 只产出结构化内容，frontmatter 由本模块组装）。 */
const skillGenerationOutputSchema = z.object({
  name       : z.string().min(1, "技能名称不能为空"),
  description: z.string().min(1, "技能描述不能为空"),
  scope      : z.enum(["GLOBAL", "BOOK_TYPE"]).default("GLOBAL"),
  /** 正文 markdown（技能的目标/适用场景/知识条目/注意事项）。 */
  body       : z.string().min(1, "技能正文不能为空")
});

export interface AiSkillGenerationInput {
  /** 管理员的用途描述（必填，如"科举相关的称谓与关系码知识"）。 */
  purpose: string;
  name?  : string;
  scope? : "GLOBAL" | "BOOK_TYPE";
}

export interface AiSkillGenerationResult {
  skillId: string;
  slug   : string;
  status : string;
}

type SkillGenerationDraft = z.infer<typeof skillGenerationOutputSchema>;

const SKILL_GENERATION_SYSTEM_PROMPT = `你是「文渊」古典文学知识图谱系统的技能设计师。系统以"技能 = MD 文档"组织领域知识：每条技能是一个 markdown 文件，由 YAML frontmatter（装载元数据）+ 正文（知识/指令/说明）组成；AI 分析管线运行时会把技能全文装载进上下文供大模型自主阅读与应用。

设计技能时遵循：
- frontmatter 只放装载元数据（name/description/scope），不放知识正文；
- 正文用中文编写，结构清晰，善用 markdown 标题/列表/表格；
- 明确技能的目标、适用场景、知识条目与使用注意事项；
- 若技能涉及关系类型，请在正文用表格列出规范的关系码、方向（INVERSE/SYMMETRIC）与别名；
- 若技能涉及虚指/泛称名单，请在正文用表格或列表承载；
- 正文 200-800 字，避免空话套话。

只输出一个 JSON 对象（不要 markdown 代码块包裹），字段：
{"name":"技能名称(中文,简短)","description":"一句话说明技能用途","scope":"GLOBAL 或 BOOK_TYPE","body":"正文 markdown(多行字符串,保留换行)"}`;

/**
 * 功能：组装 AI 生成技能的 user prompt。
 * 输入：用途描述 + 可选约束（名称/分类/范围）。
 * 输出：user prompt 字符串。
 */
export function buildSkillGenerationUserPrompt(input: AiSkillGenerationInput): string {
  const constraints: string[] = [];
  if (input.name) {
    constraints.push(`技能名称建议为：${input.name}`);
  }
  if (input.scope) {
    constraints.push(`作用范围建议为：${input.scope}`);
  }

  const constraintText = constraints.length > 0
    ? `\n\n约束（在满足需求的前提下尽量遵守）：\n${constraints.map((line) => `- ${line}`).join("\n")}`
    : "";

  return `请设计一个新技能，用途描述如下：\n${input.purpose}${constraintText}`;
}

/**
 * 功能：把 AI 输出组装为完整 skill MD 文档（frontmatter + 正文）。
 * 输入：结构化生成草稿。
 * 输出：完整 MD 字符串。
 */
export function assembleSkillMarkdown(draft: SkillGenerationDraft): string {
  // name/description 用 JSON 双引号序列化，规避 YAML 里冒号/引号转义问题。
  const frontmatter = [
    "---",
    `name: ${JSON.stringify(draft.name)}`,
    `description: ${JSON.stringify(draft.description)}`,
    `scope: ${draft.scope}`,
    "---"
  ].join("\n");

  return `${frontmatter}\n\n${draft.body.trim()}`;
}

/** 生成 AI 技能 slug：`ai-<清洗后名称>`，冲突时追加序号。 */
function buildAiSlug(name: string, existingSlugs: Set<string>): string {
  // 中文/字母/数字/连字符保留，其余剔除；空则回退 ai-skill
  const cleaned = name.replace(/[^\p{L}\p{N}-]/gu, "").slice(0, 40) || "skill";
  let slug = `ai-${cleaned}`;
  let index = 2;
  while (existingSlugs.has(slug)) {
    slug = `ai-${cleaned}-${index}`;
    index += 1;
  }
  return slug;
}

export function createAiSkillGenerator(prismaClient: PrismaClient = prisma) {
  const service = createSkillService(prismaClient);

  /**
   * 功能：调用默认模型按用途描述生成一份技能 MD（含 frontmatter 校验），不落库。
   * 输入：用途描述 + 可选名称/范围约束。
   * 输出：结构化草稿 + 组装好的完整 MD 文档。
   * 异常：无可用默认模型、AI 输出结构非法、frontmatter 校验失败时抛错。
   * 副作用：调用外部模型 API。
   */
  async function generateSkillMarkdown(input: {
    purpose: string;
    name?  : string;
    scope? : "GLOBAL" | "BOOK_TYPE";
  }): Promise<{ draft: SkillGenerationDraft; markdown: string }> {
    const purpose = input.purpose.trim();
    if (!purpose) {
      throw new Error("请描述技能用途");
    }

    const model = await loadSystemDefaultModel(prismaClient);
    const { data } = await callJsonLlm<unknown>(model, {
      system: SKILL_GENERATION_SYSTEM_PROMPT,
      user  : buildSkillGenerationUserPrompt(input)
    }, {
      temperature    : 0.4,
      maxOutputTokens: 4000,
      label          : "AI 生成技能"
    });

    const parsed = skillGenerationOutputSchema.safeParse(data);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ");
      throw new Error(`AI 生成结果结构不合法: ${issues}`);
    }

    // 组装完整 MD 并做装载级校验，确保落库后一定能被 loader 解析。
    const markdown = assembleSkillMarkdown(parsed.data);
    parseSkillMetadata(markdown);

    return { draft: parsed.data, markdown };
  }

  /**
   * 功能：按管理员描述调用默认模型生成一个 ENABLED 技能。
   * 输入：用途描述与可选约束。
   * 输出：新技能的 id/slug/状态。
   * 异常：无可用默认模型、AI 输出结构非法、frontmatter 校验失败时抛错。
   * 副作用：调用外部模型 API；落库 skills 表。
   */
  async function generateSkillFromPrompt(input: AiSkillGenerationInput): Promise<AiSkillGenerationResult> {
    const { draft, markdown } = await generateSkillMarkdown(input);

    const existing = await prismaClient.skill.findMany({
      where : { deletedAt: null },
      select: { slug: true }
    });
    const slug = buildAiSlug(draft.name, new Set(existing.map((skill) => skill.slug)));

    const created = await service.createSkill({
      slug       : slug,
      name       : draft.name,
      description: draft.description,
      scope      : draft.scope,
      content    : markdown
    });

    return {
      skillId: created.id,
      slug   : created.slug,
      status : SkillStatus.ENABLED
    };
  }

  return {
    generateSkillFromPrompt,
    generateSkillMarkdown
  };
}

export type AiSkillGenerator = ReturnType<typeof createAiSkillGenerator>;

export const aiSkillGenerator = createAiSkillGenerator(prisma);
