/**
 * 身份判定原语（primitive.ts）
 *
 * IdentityResolutionPrimitive —— 复用 llm.ts 做单次判定。
 *
 * HIGH 组合规则（写死，置信参与绝不独裁）：
 *   LLM 判定 resolved（带证据锚点）
 *   ∧ 提及数 ≥ 2（窗口数）
 *   ∧ 分布式冲突扫描干净（caller 外置校验）
 *   ∧ 采样窗口语义一致（prompt 约束 + LLM 内部判定）
 */
import type { BookRegistry } from "./registry.ts";
import { IDENTITY_RESOLUTION_SYSTEM_PROMPT } from "./prompts.ts";
import { callIdentityLlm } from "./llm.ts";

export type PrimitiveVerdict = "resolved" | "new_entity" | "ambiguous";

export interface MentionWindow {
  chapterNo: number;
  paraIndex: number | null;
  excerpt  : string;
}

export interface PrimitiveInput {
  surfaceForm: string;
  windows    : MentionWindow[];
  registry   : BookRegistry;
  bookSummary: string;
  skills     : string[];
  jobId      : string;
}

export interface PrimitiveOutput {
  verdict         : PrimitiveVerdict;
  resolvedEntityId: string | null;
  evidenceAnchors : { chapterNo: number; paraIndex: number | null }[];
  note            : string | null;
}

export interface PrimitiveResult {
  output        : PrimitiveOutput;
  highConfidence: boolean;
}

/**
 * 分层采样：按章去重 + 均匀取样，最多 N 个窗口（控制成本 + 保分布信息）。
 */
export function sampleWindows(windows: MentionWindow[], maxCount = 15): MentionWindow[] {
  // 先按章去重（同一章只保留一个代表窗口）
  const byChapter = new Map<number, MentionWindow>();
  for (const w of windows) {
    if (!byChapter.has(w.chapterNo)) byChapter.set(w.chapterNo, w);
  }
  const chapters = Array.from(byChapter.values()).sort((a, b) => a.chapterNo - b.chapterNo);
  if (chapters.length <= maxCount) return chapters;

  // 均匀抽 maxCount 个（保留分布信息，控制成本）
  const step = chapters.length / maxCount;
  const result: MentionWindow[] = [];
  for (let i = 0; i < maxCount; i++) {
    const idx = Math.min(Math.floor(i * step), chapters.length - 1);
    result.push(chapters[idx]);
  }
  return result;
}

/**
 * 运行身份判定原语。
 * @throws LLM 非 JSON / 重试耗尽时抛错。
 */
export async function runPrimitive(input: PrimitiveInput): Promise<PrimitiveResult> {
  const sampled = sampleWindows(input.windows, 15);
  const windowsJson = JSON.stringify(sampled.map((w) => ({ chapterNo: w.chapterNo, paraIndex: w.paraIndex, excerpt: w.excerpt })));
  const registryJson = JSON.stringify(
    input.registry.entries.map((e) => ({ entityId: e.entityId, canonical: e.canonical, type: e.type, aliases: e.aliases }))
  );

  const user = [
    `表面形式：${input.surfaceForm}`,
    "",
    `出现窗口：${windowsJson}`,
    "",
    `当前登记表：${registryJson}`,
    "",
    `全书摘要：${input.bookSummary}`,
    "",
    `相关 skill：${input.skills.join("\n---\n")}`
  ].join("\n");

  const { data } = await callIdentityLlm<PrimitiveOutput>({
    stage : "TITLE_RESOLUTION",
    system: IDENTITY_RESOLUTION_SYSTEM_PROMPT,
    user,
    jobId : input.jobId
  });

  const condition1 = data.verdict === "resolved" && data.evidenceAnchors.length > 0 && !!data.resolvedEntityId;
  const condition2 = sampled.length >= 2;
  const highConfidence = condition1 && condition2;

  return { output: data, highConfidence };
}
