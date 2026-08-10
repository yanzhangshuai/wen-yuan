/**
 * Pass1 逐章单轮提取（extractor.ts）
 *
 * 每章一次 LLM 调用（无工具循环，上下文一次给全）：
 *   输入 = 本章正文 + 全书摘要 + 相关 skill
 *   输出 = ExtractionSlice（JSON，schema 动态生成约束）
 *   落库 = 实体验收闸 → facts(DRAFT) + mentions + aliases + 审计
 *
 * 复用：identity/llm.ts 调用模式、getRegistry 登记表、guardrails 护栏。
 * 架构依据：docs/architecture/15-agent-architecture-v7.md §3/Pass1
 */
import { callIdentityLlm } from "@/server/modules/identity/llm.ts";
import { EXTRACTION_SYSTEM_PROMPT } from "./prompts.ts";
import { runGuardrails, type PersistableFact } from "./guardrails.ts";
import type { ExtractionSlice } from "./types.ts";

export interface ExtractSliceInput {
  bookId               : string;
  jobId                : string;
  /** 片正文（章节拼接） */
  sliceText            : string;
  /** 片覆盖章号（v7 逐章后为单章号） */
  chapterNos           : number[];
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
  /** 通过实体验收闸的实体（= 保留 facts 的参与者），供落库反推。 */
  entities   : ReturnType<typeof runGuardrails>["entities"];
}

/** 组装提取 prompt（user 含正文 + 摘要 + skill + schema 枚举；v6 提取无身份登记表注入）。 */
export function buildExtractionUserPrompt(input: {
  sliceText            : string;
  bookSummary          : string;
  skills               : string[];
  relationshipTypeCodes: string[];
}): string {
  return [
    `章节正文：\n${input.sliceText}`,
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
      bookSummary          : input.bookSummary,
      skills               : input.skills,
      relationshipTypeCodes: input.relationshipTypeCodes
    }),
    jobId          : input.jobId,
    maxOutputTokens: 32_768,
    // 关闭思考：同身份列举，推理模型会吃掉输出预算导致空响应/截断。
    enableThinking : false
  });

  const slice: ExtractionSlice = {
    ...data,
    book      : input.bookId,
    chapterNos: input.chapterNos
  };

  const { facts, dropRecords, entities } = runGuardrails(
    slice,
    input.sliceText,
    new Set(input.relationshipTypeCodes),
    input.deicticJunk ? new Set(input.deicticJunk) : undefined
  );

  return { slice, facts, dropRecords, entities };
}
