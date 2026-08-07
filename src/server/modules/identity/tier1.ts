/**
 * Tier1：全书一遍草稿登记表
 *
 * - A/B 校准表选路径（single_pass / volume）
 * - 全书一遍：按人物/地点/组织拆 2-3 次调用（输出界分片），确定性合并
 * - 分卷路径：相邻卷重叠 + 卷级合并（canonical 去重 + 别名/锚点并集）
 * - 产出走 writeRegistry 落库
 *
 * 架构依据：docs/architecture/13-agent-architecture-v5.md §2.3
 */
import { PipelineStage } from "@/types/pipeline";
import { callIdentityLlm } from "./llm.ts";
import { TIER1_SYSTEM_PROMPT } from "./prompts.ts";
import type { RegistryWriteEntry } from "./identityService.ts";
import { writeRegistry } from "./identityService.ts";

export interface Tier1DraftEntry {
  canonical: string;
  type: "PERSON" | "LOCATION" | "ORGANIZATION" | "CONCEPT";
  aliases: string[];
  evidenceAnchors: { chapterNo: number; paraIndex: number | null }[];
  note?: string;
}

export interface Tier1Input {
  bookId: string;
  jobId: string;
  fullText: string;
  bookSizeTokens: number;
  prescanCandidates?: Tier1DraftEntry[];
}

/** A/B 校准表读取（离线生成，生产查表；缺省 single_pass）。 */
async function pickTier1Path(modelId: string, bookSizeTokens: number): Promise<"single_pass" | "volume"> {
  try {
    const fs = await import("node:fs");
    const raw = fs.readFileSync(process.cwd() + "/scripts/eval/ab-calibration.json", "utf-8");
    const table = JSON.parse(raw) as Record<string, Record<string, "single_pass" | "volume">>;
    const sizeBand = bookSizeTokens <= 400_000 ? "<400K" : "400K-1M";
    return table[modelId]?.[sizeBand] ?? "single_pass";
  } catch {
    return "single_pass";
  }
}

function toWriteEntries(drafts: Tier1DraftEntry[]): RegistryWriteEntry[] {
  return drafts.map((d) => ({
    canonical: d.canonical,
    aliases: d.aliases,
    type: d.type,
    nameType: d.note?.includes("TITLE_ONLY") ? "TITLE_ONLY" : "NAMED",
    confidence: d.evidenceAnchors.length >= 2 ? 0.85 : 0.6,
  }));
}

/**
 * Tier1 主入口。
 * @param modelId 用于 A/B 校准表选路径。
 */
export async function runTier1(input: Tier1Input, modelId: string): Promise<{ created: number; updated: number }> {
  const path = await pickTier1Path(modelId, input.bookSizeTokens);
  const allDrafts: Tier1DraftEntry[] = [];

  if (path === "single_pass") {
    const groups: Tier1DraftEntry["type"][] = ["PERSON", "LOCATION", "ORGANIZATION"];
    for (const group of groups) {
      const user = [
        `需提取的实体类型：${group}`,
        "",
        `全文正文：\n${input.fullText}`,
        input.prescanCandidates?.length ? `\n预扫描候选：${JSON.stringify(input.prescanCandidates)}\n` : "",
        `输出该类型全部实体的 JSON 数组。`,
      ].join("\n");

      const { data } = await callIdentityLlm<Tier1DraftEntry[]>({
        stage: PipelineStage.ROSTER_DISCOVERY,
        system: TIER1_SYSTEM_PROMPT,
        user,
        jobId: input.jobId,
        bookId: input.bookId,
      });
      allDrafts.push(...data);
    }
  } else {
    // 分卷路径：每卷 25 章 + 相邻卷重叠 3 章
    const VOLUME_SIZE = 25;
    const OVERLAP = 3;
    const chapters = input.fullText.split(/\n(?=　　[第\d])/);
    for (let i = 0; i < chapters.length; i += VOLUME_SIZE) {
      const end = Math.min(i + VOLUME_SIZE + OVERLAP, chapters.length);
      const volumeText = chapters.slice(i, end).join("\n");
      const { data } = await callIdentityLlm<Tier1DraftEntry[]>({
        stage: PipelineStage.ROSTER_DISCOVERY,
        system: TIER1_SYSTEM_PROMPT,
        user: `卷 ${i / VOLUME_SIZE + 1}\n\n${volumeText}`,
        jobId: input.jobId,
        bookId: input.bookId,
      });
      allDrafts.push(...data);
    }
  }

  // 合并预扫描候选（LLM 漏掉的高频项）
  if (input.prescanCandidates) {
    const existing = new Set(allDrafts.map((d) => d.canonical));
    for (const c of input.prescanCandidates) {
      if (!existing.has(c.canonical)) allDrafts.push(c);
    }
  }

  // canonical 去重合并（别名 + 锚点并集）
  const merged = new Map<string, Tier1DraftEntry>();
  for (const d of allDrafts) {
    const existing = merged.get(d.canonical);
    if (!existing) {
      merged.set(d.canonical, d);
    } else {
      existing.aliases = Array.from(new Set([...existing.aliases, ...d.aliases]));
      const anchorMap = new Map<string, { chapterNo: number; paraIndex: number | null }>();
      for (const a of [...existing.evidenceAnchors, ...d.evidenceAnchors]) anchorMap.set(`${a.chapterNo}:${a.paraIndex}`, a);
      existing.evidenceAnchors = Array.from(anchorMap.values());
    }
  }

  return writeRegistry({
    bookId: input.bookId,
    source: "tier1",
    agentRunId: crypto.randomUUID(),
    entries: toWriteEntries(Array.from(merged.values())),
  });
}
