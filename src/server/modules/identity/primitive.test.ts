import { beforeEach, describe, expect, it, vi } from "vitest";
import { runPrimitive, sampleWindows } from "./primitive.ts";
import type { MentionWindow, PrimitiveOutput } from "./primitive.ts";
import type { BookRegistry } from "./registry.ts";

// mock llm.ts 的 callIdentityLlm
vi.mock("./llm.ts", () => ({
  callIdentityLlm: vi.fn(),
}));

import { callIdentityLlm } from "./llm.ts";

const mockCall = vi.mocked(callIdentityLlm);

function makeRegistry(): BookRegistry {
  return {
    bookId: "book-1",
    entries: [
      { entityId: "e1", canonical: "范进", type: "PERSON", aliases: ["范老爷"], confidenceTier: "HIGH", activeChapters: [3], firstAppearanceChapter: 3, nameType: "NAMED" },
    ],
    loadedAt: new Date(),
  };
}

function window(c: number): MentionWindow {
  return { chapterNo: c, paraIndex: 1, excerpt: `第${c}章片段` };
}

const baseInput = {
  surfaceForm: "范老爷",
  windows: [window(2), window(3), window(4)],
  registry: makeRegistry(),
  bookSummary: "儒林外史摘要",
  skills: [],
  jobId: "job-1",
  bookId: "book-1",
};

describe("sampleWindows", () => {
  it("窗口数 ≤ maxCount 时原样返回", () => {
    expect(sampleWindows([window(1), window(2)], 15)).toHaveLength(2);
  });

  it("按章去重", () => {
    const windows = [window(1), window(1), window(2)];
    expect(sampleWindows(windows, 15)).toHaveLength(2);
  });

  it("超量时均匀采样到 maxCount", () => {
    const windows = Array.from({ length: 30 }, (_, i) => window(i + 1));
    expect(sampleWindows(windows, 15)).toHaveLength(15);
  });
});

describe("runPrimitive HIGH 组合规则", () => {
  beforeEach(() => {
    mockCall.mockReset();
  });

  it("resolved + 证据锚点 + 提及数≥2 → HIGH", async () => {
    mockCall.mockResolvedValue({
      data: {
        verdict: "resolved",
        resolvedEntityId: "e1",
        evidenceAnchors: [{ chapterNo: 3, paraIndex: 1 }],
        note: null,
      } as PrimitiveOutput,
      modelId: "m1",
      isFallback: false,
    });
    const { output, highConfidence } = await runPrimitive(baseInput);
    expect(output.verdict).toBe("resolved");
    expect(highConfidence).toBe(true);
  });

  it("提及数 <2（单窗口）→ 不高置信", async () => {
    mockCall.mockResolvedValue({
      data: {
        verdict: "resolved",
        resolvedEntityId: "e1",
        evidenceAnchors: [{ chapterNo: 3, paraIndex: 1 }],
        note: null,
      } as PrimitiveOutput,
      modelId: "m1",
      isFallback: false,
    });
    const { highConfidence } = await runPrimitive({ ...baseInput, windows: [window(3)] });
    expect(highConfidence).toBe(false);
  });

  it("ambiguous → 不高置信", async () => {
    mockCall.mockResolvedValue({
      data: { verdict: "ambiguous", resolvedEntityId: null, evidenceAnchors: [], note: "两可" } as PrimitiveOutput,
      modelId: "m1",
      isFallback: false,
    });
    const { highConfidence } = await runPrimitive(baseInput);
    expect(highConfidence).toBe(false);
  });

  it("resolved 但无证据锚点 → 不高置信", async () => {
    mockCall.mockResolvedValue({
      data: { verdict: "resolved", resolvedEntityId: "e1", evidenceAnchors: [], note: null } as PrimitiveOutput,
      modelId: "m1",
      isFallback: false,
    });
    const { highConfidence } = await runPrimitive(baseInput);
    expect(highConfidence).toBe(false);
  });
});
