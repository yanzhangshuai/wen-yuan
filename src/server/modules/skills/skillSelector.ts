/**
 * =============================================================================
 * 文件定位（Skill 域：AI 动态 skill 选择器）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/skills/skillSelector.ts`
 *
 * 模块职责：
 * - 每次任务启动时，由 AI 按"书 + skill 目录"动态选择装载技能（design.md §3.1）；
 * - 目录 = 全部 active+enabled skill 的 frontmatter-only 摘要（slug/name/description/category），
 *   不读正文（对标 Claude Code 记忆系统"只扫前 30 行"）；
 * - 书上下文 = 元数据（书名/作者/朝代/简介）+ 章节正文（总字符超阈值时抽样首/中/末各 ~2K 字）；
 * - 一次 LLM 调用（走统一默认模型）→ { skillSlugs, inferredType, reasons }
 *   → zod 校验：skillSlugs 必须 ⊆ 目录（且 isEnabled=true），非法 slug 直接丢弃并告警；
 * - 装载集合 = scope=GLOBAL ∪ 选中的 skill；关系码契约从装载技能 frontmatter relationshipCodes 并集
 *   （去重按 code，先到先得），供 schema/guardrail 取码；
 * - `selectSkillsForJob` 把结果快照进 AnalysisJob（skillsSnapshot / relationshipTypesSnapshot），
 *   任务内各阶段从 job 快照读取，任务间互不干扰。
 *
 * 关键约束：
 * - jobId 必须为真实 AnalysisJob id（AiCallExecutor 写 analysis_phase_logs 外键）；
 * - LLM 输出非 JSON → 抛错，由 AiCallExecutor 统一重试/回退；
 * - 不做书级持久化 / 版本陈旧检测 / 手动重测（非目标）。
 * =============================================================================
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { SkillStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { aiCallExecutor } from "@/server/modules/analysis/services/AiCallExecutor";
import {
  getRelationshipCodesFromSkills,
  type RelationshipCodeInfo
} from "@/server/modules/extraction/schema";
import {
  parseSkillMetadata,
  type SkillDocument,
  type SkillMetadata
} from "@/server/modules/skills/content-schema";
import { callJsonLlm } from "@/server/providers/ai/callJsonLlm";
import { z } from "zod";

/** 书正文总字符 ≤ 该阈值时全量注入选择器，否则抽样首/中/末。 */
export const SKILL_SELECTION_TEXT_THRESHOLD = 6000;

/** 超长书抽样时每段（首/中/末）的字符数。 */
export const SKILL_SELECTION_SAMPLE_CHARS = 2000;

/**
 * skill 选择 LLM 输出（AI 输出不可信，先 zod 校验再消费）。
 * - skillSlugs：选中的技能 slug 列表；
 * - inferredType：推断的书籍类型（可选，不做书级持久化，仅快照展示）；
 * - reasons：选择理由（审计用）。
 */
export const skillSelectionOutputSchema = z.object({
  skillSlugs  : z.array(z.string().min(1)),
  inferredType: z.string().nullable(),
  reasons     : z.string()
});
export type SkillSelectionOutput = z.infer<typeof skillSelectionOutputSchema>;

/** 目录项（frontmatter-only 摘要，注入选择器 prompt 的轻量索引）。 */
export interface SkillCatalogItem {
  slug       : string;
  name       : string;
  description: string | null;
  category   : string;
}

/** 书上下文（元数据 + 章节抽样文本），注入选择器 prompt。 */
export interface BookContext {
  title      : string;
  author     : string | null;
  dynasty    : string | null;
  description: string | null;
  sample     : string;
}

/** 选择器一次 LLM 调用的入参（system/user 已构建；jobId 供 executor 写 phase log）。 */
export interface SkillSelectorCallLlmInput {
  system: string;
  user  : string;
  jobId : string;
}

/** 选择输入：必须携带真实 jobId（AiCallExecutor 写 analysis_phase_logs）。 */
export interface SkillSelectionInput {
  bookId: string;
  jobId : string;
}

/** 选择结果（装载集合 = scope=GLOBAL ∪ 选中）。 */
export interface SkillSelectionResult {
  /** AI 选中的 skill slug（已通过目录校验，不含 GLOBAL 常驻技能）。 */
  selectedSlugs    : string[];
  /** 实际装载的 skill 全文文档（scope=GLOBAL ∪ 选中）。 */
  selectedSkills   : SkillDocument[];
  /** 全部装载 slug（GLOBAL ∪ 选中），供快照 allLoadedSlugs 使用。 */
  allLoadedSlugs   : string[];
  /** 装载技能 frontmatter relationshipCodes 并集（去重按 code，先到先得）。 */
  relationshipCodes: RelationshipCodeInfo[];
  inferredType     : string | null;
  reasons          : string;
}

/** 任务 skill 快照（analysis_jobs.skillsSnapshot）。 */
export interface SkillsSnapshot {
  /** AI 选中的 skill slug（不含 GLOBAL）。 */
  selectedSlugs : string[];
  /** 实际装载的全部 slug（scope=GLOBAL ∪ 选中）。 */
  allLoadedSlugs: string[];
  /** 各装载 skill → 激活版本号（versionMap）。 */
  versionMap    : Record<string, number>;
  inferredType  : string | null;
  reasons       : string;
  selectedAt    : string;
}

/** 内部装载候选（含 scope 与激活版全文，供装载集合与契约并集）。 */
interface CatalogSkill {
  slug       : string;
  name       : string;
  description: string | null;
  category   : string;
  scope      : string;
  versionNo  : number;
  content    : string;
  metadata   : SkillMetadata;
}

/** 选择器依赖（可注入便于单元测试）。 */
export interface SkillSelectorDeps {
  /** prisma 客户端（缺省走全局单例）。 */
  prismaClient?: PrismaClient;
  /** 选择 LLM 调用；测试注入 mock。缺省走 aiCallExecutor。 */
  callLlm?     : (input: SkillSelectorCallLlmInput) => Promise<unknown>;
}

/**
 * 任务契约（减法原则，≤150 token）：目标 + 输出 JSON + 成功判据，不写角色渲染。
 * 领域知识（各技能 description/category）由调用方经 user prompt 目录清单注入。
 */

/** 从 zod schema 推导的 JSON 类型名（覆盖本项目输出契约用到的 string/array/nullable）。 */
function renderZodTypeName(schema: z.ZodTypeAny): string {
  if (schema instanceof z.ZodNullable) {
    return `${renderZodTypeName(schema.unwrap() as z.ZodTypeAny)} | null`;
  }
  if (schema instanceof z.ZodArray) {
    return `${renderZodTypeName(schema.element as z.ZodTypeAny)}[]`;
  }
  if (schema instanceof z.ZodString) {
    return "string";
  }
  return "unknown";
}

/**
 * 功能：把 zod object schema 渲染为 JSON 类型描述，供 prompt 注入（单一来源，避免类型双份维护）。
 * 输入：zod object schema。
 * 输出：形如 `{ "skillSlugs": string[], "inferredType": string | null, "reasons": string }` 的字符串。
 * 异常：无。
 * 副作用：无。
 */
export function renderOutputShape(schema: z.ZodObject<z.ZodRawShape>): string {
  const entries = Object.entries(schema.shape).map(
    ([key, field]) => `"${key}": ${renderZodTypeName(field)}`
  );
  return `{ ${entries.join(", ")} }`;
}

export const SKILL_SELECTION_SYSTEM_PROMPT = [
  "为中文古典文学书籍解析选择最相关的内容技能包。",
  "",
  "输出 JSON：",
  renderOutputShape(skillSelectionOutputSchema),
  "",
  "成功判据：",
  "- skillSlugs 仅可取自下方目录，且与本书文体/主题/历史背景直接相关",
  "- 关系/称谓/命名类技能与书籍类型强相关，优先选择",
  "- 与本书无关或信息不足时不选；不确定返回空数组",
  "- 禁止臆造目录外的 slug"
].join("\n");

/**
 * 功能：对超长正文做首/中/末抽样（全书 concat 后的字符维度）。
 * 输入：全文内容、阈值、每段字符数。
 * 输出：全文（≤阈值）或带标记的三段抽样文本。
 * 异常：无。
 * 副作用：无。
 */
export function sampleBookText(
  content  : string,
  threshold= SKILL_SELECTION_TEXT_THRESHOLD,
  chunkSize= SKILL_SELECTION_SAMPLE_CHARS
): string {
  if (content.length <= threshold) {
    return content;
  }

  const first = content.slice(0, chunkSize);
  const middleStart = Math.floor(content.length / 2) - Math.floor(chunkSize / 2);
  const middle = content.slice(middleStart, middleStart + chunkSize);
  const last = content.slice(content.length - chunkSize);

  return ["【开头】", first, "", "【中段】", middle, "", "【结尾】", last].join("\n");
}

/**
 * 功能：构建选择器 user prompt（书上下文 + 目录清单表格）。
 * 输入：书上下文、目录项列表。
 * 输出：user 消息文本。
 * 异常：无。
 * 副作用：无。
 */
export function buildSkillSelectionUserPrompt(context: BookContext, catalog: SkillCatalogItem[]): string {
  const lines = ["【书籍信息】", `书名：${context.title}`];
  if (context.author) {
    lines.push(`作者：${context.author}`);
  }
  if (context.dynasty) {
    lines.push(`朝代：${context.dynasty}`);
  }
  if (context.description) {
    lines.push(`简介：${context.description}`);
  }
  lines.push("", "【正文样本】", context.sample, "", "【技能目录】");
  for (const item of catalog) {
    lines.push(`- ${item.slug}｜${item.name}｜${item.description ?? ""}｜${item.category}`);
  }
  return lines.join("\n");
}

/**
 * 功能：执行一次 skill 选择 LLM 调用（结构化 JSON 输出）。
 * 输入：已构建的 system/user、真实 jobId/bookId。
 * 输出：LLM 返回的原始 JSON 对象（未校验，由调用方 zod 校验）。
 * 异常：输出非 JSON 时抛错（由 AiCallExecutor 统一重试/回退）。
 * 副作用：写入 analysis_phase_logs。
 */
export async function callSkillSelectorLlm(input: SkillSelectorCallLlmInput): Promise<unknown> {
  const prompt = { system: input.system, user: input.user };

  const result = await aiCallExecutor.execute<unknown>({
    stage : "SKILL_SELECT",
    prompt,
    jobId : input.jobId,
    callFn: async ({ model, prompt: p }) => callJsonLlm<unknown>(model, p, {
      temperature: 0,
      label      : "skill 选择"
    })
  });

  return result.data;
}

/**
 * 从 analysis_jobs.skillsSnapshot（JsonB）防御性恢复 SkillsSnapshot。
 * 输入：数据库读取的原始 Json 值。
 * 输出：解析后的快照；结构不合法时返回 null（调用方回退为全部 GLOBAL）。
 * 异常：无。
 * 副作用：无。
 */
export function parseSkillsSnapshot(snapshot: unknown): SkillsSnapshot | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }
  const record = snapshot as Record<string, unknown>;
  if (!Array.isArray(record.allLoadedSlugs)) {
    return null;
  }

  const stringArray = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];

  return {
    selectedSlugs : stringArray(record.selectedSlugs),
    allLoadedSlugs: stringArray(record.allLoadedSlugs),
    versionMap    : (() => {
      if (!record.versionMap || typeof record.versionMap !== "object" || Array.isArray(record.versionMap)) {
        return {};
      }
      const map: Record<string, number> = {};
      for (const [slug, versionNo] of Object.entries(record.versionMap)) {
        if (typeof versionNo === "number") {
          map[slug] = versionNo;
        }
      }
      return map;
    })(),
    inferredType: typeof record.inferredType === "string" ? record.inferredType : null,
    reasons     : typeof record.reasons === "string" ? record.reasons : "",
    selectedAt  : typeof record.selectedAt === "string" ? record.selectedAt : ""
  };
}

/**
 * 功能：创建 AI 动态 skill 选择器。
 * 输入：可选依赖（prisma 客户端 / 选择 LLM 调用）。
 * 输出：`selectSkills`（选择原语）与 `selectSkillsForJob`（选择 + 快照落库）。
 * 异常：书籍不存在、LLM 输出非 JSON 或校验失败时抛错。
 * 副作用：`selectSkillsForJob` 写入 analysis_jobs 快照字段。
 */
export function createSkillSelector(deps: SkillSelectorDeps = {}) {
  const prismaClient = deps.prismaClient ?? prisma;
  const callLlm = deps.callLlm ?? callSkillSelectorLlm;

  /** 装载 active+enabled 技能的激活版全文（含 scope 与元数据），供目录与装载集合共用。 */
  async function loadCatalog(): Promise<CatalogSkill[]> {
    const skills = await prismaClient.skill.findMany({
      where  : { status: SkillStatus.ACTIVE, isEnabled: true, deletedAt: null },
      include: {
        versions: {
          where  : { isActive: true },
          select : { versionNo: true, content: true },
          orderBy: { versionNo: "desc" }
        }
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }]
    });

    const catalog: CatalogSkill[] = [];
    for (const skill of skills) {
      const version = skill.versions[0];
      if (!version) {
        continue;
      }

      let metadata: SkillMetadata;
      try {
        metadata = parseSkillMetadata(version.content);
      } catch (error) {
        console.warn(`[SkillSelector] frontmatter 解析失败，目录跳过 ${skill.slug}:`, error instanceof Error ? error.message : String(error));
        continue;
      }

      catalog.push({
        slug       : skill.slug,
        name       : metadata.name ?? skill.name,
        description: metadata.description ?? skill.description,
        category   : skill.category,
        scope      : skill.scope,
        versionNo  : version.versionNo,
        content    : version.content,
        metadata
      });
    }
    return catalog;
  }

  /** 装载书元数据 + 章节正文抽样。 */
  async function loadBookContext(bookId: string): Promise<BookContext> {
    const book = await prismaClient.book.findUnique({
      where : { id: bookId },
      select: { title: true, author: true, dynasty: true, description: true }
    });
    if (!book) {
      throw new Error(`书籍不存在: ${bookId}`);
    }

    const chapters = await prismaClient.chapter.findMany({
      where  : { bookId },
      select : { title: true, content: true },
      orderBy: { no: "asc" }
    });
    const fullText = chapters.map((chapter) => `${chapter.title}\n${chapter.content}`).join("\n\n");

    return {
      title      : book.title,
      author     : book.author,
      dynasty    : book.dynasty,
      description: book.description,
      sample     : sampleBookText(fullText)
    };
  }

  /**
   * 功能：执行 AI 动态 skill 选择原语。
   * 输入：bookId/jobId。
   * 输出：装载集合（GLOBAL ∪ 选中）、关系码契约并集、推断类型与理由。
   * 异常：书籍不存在、LLM 输出非 JSON 或 zod 校验失败时抛错。
   * 副作用：一次 SKILL_SELECTOR LLM 调用（写 analysis_phase_logs）。
   */
  async function selectSkills(input: SkillSelectionInput): Promise<SkillSelectionResult> {
    const catalog = await loadCatalog();
    const context = await loadBookContext(input.bookId);
    const user = buildSkillSelectionUserPrompt(context, catalog.map((skill) => ({
      slug       : skill.slug,
      name       : skill.name,
      description: skill.description,
      category   : skill.category
    })));

    const raw = await callLlm({
      system: SKILL_SELECTION_SYSTEM_PROMPT,
      user,
      jobId : input.jobId
    });

    const parsed = skillSelectionOutputSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(`skill 选择 LLM 输出不合法: ${parsed.error.message}`);
    }

    // zod 目录过滤：非法 slug 直接丢弃并告警（AI 选到未启用/不存在的 skill 时兜底）
    const catalogSlugs = new Set(catalog.map((skill) => skill.slug));
    const selectedSlugs = parsed.data.skillSlugs.filter((slug) => catalogSlugs.has(slug));
    const dropped = parsed.data.skillSlugs.filter((slug) => !catalogSlugs.has(slug));
    if (dropped.length > 0) {
      console.warn(`[SkillSelector] 丢弃目录外 slug: ${dropped.join(", ")}`);
    }

    // 装载集合 = scope=GLOBAL（常驻兜底）∪ 选中的 skill
    const loaded = catalog.filter((skill) => skill.scope === "GLOBAL" || selectedSlugs.includes(skill.slug));
    const selectedSkills: SkillDocument[] = loaded.map((skill) => ({
      slug       : skill.slug,
      name       : skill.name,
      description: skill.description,
      versionNo  : skill.versionNo,
      metadata   : skill.metadata,
      markdown   : skill.content
    }));

    return {
      selectedSlugs,
      selectedSkills,
      allLoadedSlugs   : selectedSkills.map((skill) => skill.slug),
      relationshipCodes: getRelationshipCodesFromSkills(selectedSkills),
      inferredType     : parsed.data.inferredType,
      reasons          : parsed.data.reasons
    };
  }

  /**
   * 功能：执行 skill 选择并把结果快照进 AnalysisJob。
   * 输入：bookId/jobId。
   * 输出：写好的 SkillsSnapshot（同时写入 skillsSnapshot / relationshipTypesSnapshot 两列）。
   * 异常：job 不存在、LLM 调用失败时抛错。
   * 副作用：更新 analysis_jobs.skillsSnapshot / relationshipTypesSnapshot。
   */
  async function selectSkillsForJob(input: SkillSelectionInput): Promise<SkillsSnapshot> {
    const result = await selectSkills(input);
    const snapshot: SkillsSnapshot = {
      selectedSlugs : result.selectedSlugs,
      allLoadedSlugs: result.allLoadedSlugs,
      versionMap    : Object.fromEntries(result.selectedSkills.map((skill) => [skill.slug, skill.versionNo])),
      inferredType  : result.inferredType,
      reasons       : result.reasons,
      selectedAt    : new Date().toISOString()
    };

    await prismaClient.analysisJob.update({
      where: { id: input.jobId },
      data : {
        skillsSnapshot           : snapshot as unknown as Prisma.InputJsonValue,
        relationshipTypesSnapshot: result.relationshipCodes as unknown as Prisma.InputJsonValue
      }
    });

    return snapshot;
  }

  return {
    selectSkills,
    selectSkillsForJob
  };
}

export type SkillSelector = ReturnType<typeof createSkillSelector>;

export const skillSelector = createSkillSelector({ prismaClient: prisma });
