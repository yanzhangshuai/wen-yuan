import { beforeEach, describe, expect, it, vi } from "vitest";
import { collectResidualCandidates, runTier2 } from "./tier2.ts";
import type { BookRegistry } from "./registry.ts";

import { runPrimitive } from "./primitive.ts";
import { writeRegistry } from "./identityService.ts";

vi.mock("./primitive.ts", () => ({
  runPrimitive: vi.fn()
}));
vi.mock("./identityService.ts", () => ({
  writeRegistry: vi.fn(async () => ({ created: 1, updated: 0 }))
}));

const mockPrimitive = vi.mocked(runPrimitive);
const mockWrite = vi.mocked(writeRegistry);

const registry: BookRegistry = {
  bookId : "book-1",
  entries: [
    { entityId: "e1", canonical: "范进", type: "PERSON", aliases: ["范老爷"], confidenceTier: "HIGH", activeChapters: [3], firstAppearanceChapter: 3, nameType: "NAMED" },
    { entityId: "e2", canonical: "姚驼子", type: "PERSON", aliases: [], confidenceTier: "LOW", activeChapters: [20], firstAppearanceChapter: 20, nameType: "NAMED" }
  ],
  loadedAt: new Date()
};

beforeEach(() => {
  mockPrimitive.mockReset();
  mockWrite.mockReset();
  mockWrite.mockResolvedValue({ created: 1, updated: 0 });
});

describe("collectResidualCandidates", () => {
  it("只收集 LOW 或 TITLE_ONLY MEDIUM", () => {
    const candidates = collectResidualCandidates(registry);
    expect(candidates.map((c) => c.surfaceForm)).toContain("姚驼子");
    expect(candidates.map((c) => c.surfaceForm)).not.toContain("范进");
  });
});

describe("runTier2", () => {
  it("new_entity → 写登记表；ambiguous → 计数", async () => {
    mockPrimitive
      .mockResolvedValueOnce({ output: { verdict: "new_entity", resolvedEntityId: null, evidenceAnchors: [], note: null }, highConfidence: false })
      .mockResolvedValueOnce({ output: { verdict: "ambiguous", resolvedEntityId: null, evidenceAnchors: [], note: "两可" }, highConfidence: false });

    const result = await runTier2(
      {
        bookId     : "book-1",
        jobId      : "job-1",
        bookSummary: "",
        skills     : [],
        candidates : [
          { surfaceForm: "新人物", windows: [{ chapterNo: 3, paraIndex: 1, excerpt: "x" }] },
          { surfaceForm: "另一人", windows: [{ chapterNo: 4, paraIndex: 1, excerpt: "y" }] }
        ]
      },
      registry
    );
    expect(result.newEntities).toBe(1);
    expect(result.ambiguous).toBe(1);
    expect(mockWrite).toHaveBeenCalled();
  });

  it("resolved → 不写新实体", async () => {
    mockPrimitive.mockResolvedValue({ output: { verdict: "resolved", resolvedEntityId: "e1", evidenceAnchors: [{ chapterNo: 3, paraIndex: 1 }], note: null }, highConfidence: true });
    const result = await runTier2(
      { bookId: "book-1", jobId: "job-1", bookSummary: "", skills: [], candidates: [{ surfaceForm: "范举人", windows: [{ chapterNo: 3, paraIndex: 1, excerpt: "x" }] }] },
      registry
    );
    expect(result.resolved).toBe(1);
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
