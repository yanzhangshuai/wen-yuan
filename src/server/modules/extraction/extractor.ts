/**
 * Pass1 分片单轮提取（extractor.ts）
 *
 * 每片一次 LLM 调用（无工具循环，上下文一次给全）：
 *   输入 = 片正文 + 身份登记表 + 全书摘要 + 相关 skill
 *   输出 = ExtractionSlice（JSON，schema 动态生成约束）
 *   落库 = guardrails → facts(DRAFT) + mentions + aliases + 审计
 *
 * 复用：identity/llm.ts 调用模式、getRegistry 登记表、guardrails 护栏。
 * 架构依据：docs/architecture/13-agent-architecture-v5.md §2.2/Pass1
 */
import { callIdentityLlm } from "@/server/modules/identity/llm.ts";
import type { BookRegistry } from "@/server/modules/identity/registry.ts";
import { EXTRACTION_SYSTEM_PROMPT } from "./prompts.ts";
import { runGuardrails, type PersistableFact } from "./guardrails.ts";
import type { ExtractionSlice, ExtractedEntity } from "./types.ts";

export interface ExtractSliceInput {
  bookId               : string;
  jobId                : string;
  /** 片正文（章节拼接） */
  sliceText            : string;
  /** 片覆盖章号（含章节标题用于检索） */
  chapterNos           : number[];
  registry             : BookRegistry;
  bookSummary          : string;
  skills               : string[];
  /** 有效关系码（装载 skill 契约，schema 生成） */
  relationshipTypeCodes: string[];
  /** 虚指代词契约名单（装载上下文 GLOBAL skill deicticJunk）；缺省用代码内默认名单 */
  deicticJunk?         : string[];
  /** 已有 entityId 查找（canonical → entityId），供落库时复用 */
  entityIdByName?      : Map<string, string>;
}

export interface ExtractSliceResult {
  slice      : ExtractionSlice;
  facts      : PersistableFact[];
  dropRecords: ReturnType<typeof runGuardrails>["dropRecords"];
}

/** 组装提取 prompt（user 含正文 + 登记表 + 摘要 + skill + schema 枚举）。 */
export function buildExtractionUserPrompt(input: {
  sliceText            : string;
  registry             : BookRegistry;
  bookSummary          : string;
  skills               : string[];
  relationshipTypeCodes: string[];
}): string {
  const registryBrief = input.registry.entries
    .map((e) => `${e.canonical}(${e.type}${e.aliases.length ? "，" + e.aliases.join("/") : ""})`)
    .join("、");
  return [
    `章节正文：\n${input.sliceText}`,
    "",
    `身份登记表：${registryBrief || "（空）"}`,
    "",
    `全书摘要：${input.bookSummary}`,
    "",
    `相关 skill：\n${input.skills.join("\n---\n")}`,
    "",
    `可选关系码：${input.relationshipTypeCodes.join("、") || "（无）"}`
  ].join("\n");
}

/**
 * 执行一片提取。
 * @throws LLM 非 JSON / 重试耗尽时抛错。
 */
export async function extractSlice(input: ExtractSliceInput): Promise<ExtractSliceResult> {
  const { data } = await callIdentityLlm<ExtractionSlice>({
    stage : "INDEPENDENT_EXTRACTION",
    system: EXTRACTION_SYSTEM_PROMPT,
    user  : buildExtractionUserPrompt({
      sliceText            : input.sliceText,
      registry             : input.registry,
      bookSummary          : input.bookSummary,
      skills               : input.skills,
      relationshipTypeCodes: input.relationshipTypeCodes
    }),
    jobId          : input.jobId,
    maxOutputTokens: 32_768,
    // 关闭思考：同 ROSTER_DISCOVERY，推理模型会吃掉输出预算导致空响应/截断。
    enableThinking : false
  });

  const slice: ExtractionSlice = {
    ...data,
    book      : input.bookId,
    chapterNos: input.chapterNos
  };

  // 新实体候选（登记表中不存在的实体 canonical）
  const known = new Set(input.registry.entries.map((e) => e.canonical));
  slice.newEntityCandidates = slice.entities
    .map((e: ExtractedEntity) => e.canonical)
    .filter((name) => !known.has(name));

  const { facts, dropRecords } = runGuardrails(
    slice,
    input.sliceText,
    new Set(input.relationshipTypeCodes),
    input.deicticJunk ? new Set(input.deicticJunk) : undefined
  );

  return { slice, facts, dropRecords };
}
