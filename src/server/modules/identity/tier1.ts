/**
 * Tier1：全书一遍草稿登记表
 *
 * - 按全书 token 规模自动选路径：小书 single_pass（全书一次，按实体类型拆 2-3 次调用），
 *   大书 volume 分卷（相邻卷重叠 + 卷级合并，保证单次 prompt 不超模型上下文）
 * - 输出界确定性合并（canonical 去重 + 别名/锚点并集）
 * - 产出走 writeRegistry 落库
 *
 * 架构依据：docs/architecture/13-agent-architecture-v5.md §2.3
 */
import { callIdentityLlm } from "./llm.ts";
import { TIER1_SYSTEM_PROMPT } from "./prompts.ts";
import type { RegistryWriteEntry } from "./identityService.ts";
import { writeRegistry } from "./identityService.ts";

export interface Tier1DraftEntry {
  canonical       : string;
  type            : "PERSON" | "LOCATION" | "ORGANIZATION" | "CONCEPT";
  aliases         : string[];
  /** 可选：登记表输出不携带证据锚点（属 Pass1 提取职责）；预扫描候选可携带。 */
  evidenceAnchors?: { chapterNo: number; paraIndex: number | null }[];
  /** 可选：登记表输出不携带 note。 */
  note?           : string;
}

export interface Tier1Input {
  bookId            : string;
  jobId             : string;
  /** Pass0 的 agent_run id（由 traceAgentRun 创建），审计外键必须真实存在。 */
  agentRunId        : string;
  fullText          : string;
  bookSizeTokens    : number;
  prescanCandidates?: Tier1DraftEntry[];
}

/** 章回式章节标题（"第X回"，兼容前置全角空格），用于按标题切分正文。
 * 注意：正文里章节标题直接以"第"开头（如"第一回　…"），不能要求前置全角空格，
 * 否则 split 失败会把整本书当成一个"卷"单发（实测 prompt 245K token 超限）。 */
const CHAPTER_TITLE_RE = /\n(?=[ \t　]*第[\d〇一二三四五六七八九十百千万]+回)/;

/** Tier1 单次调用允许的最大估算 token 数（超过则分卷，控制单次 prompt 规模）。
 * 实测：分卷越大，单卷实体输出越接近 16K 上限（11 章一卷 ~1100 实体仍截断）。
 * 12K 输入（约 3-4 章）+ 16K 输出预算下，单类型实体列表 ~300-400 条，余量充足。 */
const MAX_SHARD_TOKENS = 12_000;
/** 单次 ROSTER_DISCOVERY 输出预算。模型输出波动极大（同 3 章分卷产出 2K~16K token，
 * 密集卷可达 ~1000 实体），取 32K 上限（模型已实测接受）给最密分卷留足余量。 */
const ROSTER_MAX_OUTPUT_TOKENS = 32_768;

/**
 * 按全书 token 规模决定 Tier1 调用策略。
 * - ≤ MAX_SHARD_TOKENS → single_pass（全书一次，3 组实体类型各调一次）；
 * - 超过 → volume 分卷，卷大小按目标片 token 反推，确保每卷 prompt 不超限。
 * 说明：原先的 A/B 校准表（ab-calibration.json）从未生成，恒回退 single_pass，
 * 导致大书整本单发——这里改为纯规模决策，消除死配置依赖。
 */
function pickTier1Plan(fullText: string, bookSizeTokens: number): { mode: "single_pass" | "volume"; volumeSize?: number } {
  if (bookSizeTokens <= MAX_SHARD_TOKENS) {
    return { mode: "single_pass" };
  }

  const chapters = fullText.split(CHAPTER_TITLE_RE).filter(Boolean);
  const targetVolumes = Math.max(1, Math.ceil(bookSizeTokens / MAX_SHARD_TOKENS));
  return {
    mode      : "volume",
    volumeSize: Math.max(1, Math.ceil(chapters.length / targetVolumes))
  };
}

function toWriteEntries(drafts: Tier1DraftEntry[]): RegistryWriteEntry[] {
  return drafts.map((d) => ({
    canonical : d.canonical,
    aliases   : d.aliases,
    type      : d.type,
    nameType  : d.note?.includes("TITLE_ONLY") ? "TITLE_ONLY" : "NAMED",
    // 登记表无证据锚点，改用别名数作为实体置信信号（有别名 → 更高置信）。
    confidence: d.aliases.length >= 1 ? 0.85 : 0.6
  }));
}

/** Tier1 提取的实体类型分组（单次调用只提取一种类型，控制输出规模）。 */
const ENTITY_GROUPS: Tier1DraftEntry["type"][] = ["PERSON", "LOCATION", "ORGANIZATION"];

/**
 * 对一段正文提取指定实体类型。
 * 单次调用只请求一种类型，避免"整卷全部类型"导致输出超过 max_tokens 被截断成非法 JSON。
 */
async function extractGroupForText(
  input: Tier1Input,
  group: Tier1DraftEntry["type"],
  text: string,
  label?: string
): Promise<Tier1DraftEntry[]> {
  const user = [
    `需提取的实体类型：${group}`,
    "",
    ...(label ? [label, ""] : []),
    `正文：\n${text}`,
    input.prescanCandidates?.length ? `\n预扫描候选：${JSON.stringify(input.prescanCandidates)}\n` : "",
    "输出该类型全部实体的 JSON 数组。"
  ].join("\n");

  const { data } = await callIdentityLlm<Tier1DraftEntry[]>({
    stage          : "ROSTER_DISCOVERY",
    system         : TIER1_SYSTEM_PROMPT,
    user,
    jobId          : input.jobId,
    maxOutputTokens: ROSTER_MAX_OUTPUT_TOKENS,
    // 关闭思考：DeepSeek V4 Flash 等推理模型会把 max_tokens 全部耗在 reasoning_content 上，
    // 导致正文 content 为空或截断。实体列举是确定性任务，不需要推理。
    enableThinking : false
  });
  return data;
}

/**
 * Tier1 主入口。
 */
export async function runTier1(input: Tier1Input): Promise<{ created: number; updated: number }> {
  const plan = pickTier1Plan(input.fullText, input.bookSizeTokens);
  const allDrafts: Tier1DraftEntry[] = [];

  if (plan.mode === "single_pass") {
    // 全书一遍：按实体类型拆 3 次调用，每次输出一种类型的完整列表。
    for (const group of ENTITY_GROUPS) {
      allDrafts.push(...await extractGroupForText(input, group, input.fullText));
    }
  } else {
    // 分卷路径：卷大小按目标片 token 反推 + 相邻卷重叠 3 章；每卷再按类型拆分，
    // 保证单次输入（≤ 分卷 token）与单次输出（单类型实体列表）都不超限。
    const VOLUME_SIZE = plan.volumeSize ?? 25;
    // 自适应重叠：小卷重叠太多会放大单次输入，按卷大小折半（上限 3 章）。
    const overlap = Math.min(3, Math.max(1, Math.floor(VOLUME_SIZE / 2)));
    const chapters = input.fullText.split(CHAPTER_TITLE_RE);
    for (let i = 0; i < chapters.length; i += VOLUME_SIZE) {
      const end = Math.min(i + VOLUME_SIZE + overlap, chapters.length);
      const volumeText = chapters.slice(i, end).join("\n");
      for (const group of ENTITY_GROUPS) {
        allDrafts.push(...await extractGroupForText(
          input,
          group,
          volumeText,
          `卷 ${i / VOLUME_SIZE + 1}`
        ));
      }
    }
  }

  // 合并预扫描候选（LLM 漏掉的高频项）
  if (input.prescanCandidates) {
    const existing = new Set(allDrafts.map((d) => d.canonical));
    for (const c of input.prescanCandidates) {
      if (!existing.has(c.canonical)) allDrafts.push(c);
    }
  }

  // canonical 去重合并（别名并集；登记表不携带证据锚点，无需锚点合并）
  const merged = new Map<string, Tier1DraftEntry>();
  for (const d of allDrafts) {
    const existing = merged.get(d.canonical);
    if (!existing) {
      merged.set(d.canonical, d);
    } else {
      existing.aliases = Array.from(new Set([...existing.aliases, ...d.aliases]));
    }
  }

  return writeRegistry({
    bookId    : input.bookId,
    source    : "tier1",
    agentRunId: input.agentRunId,
    entries   : toWriteEntries(Array.from(merged.values()))
  });
}
