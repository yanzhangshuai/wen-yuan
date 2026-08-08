import { beforeEach, describe, expect, it, vi } from "vitest";
import { runReconcile } from "./reconcile.ts";
import type { BookRegistry } from "./registry.ts";

import { runPrimitive } from "./primitive.ts";
import { writeRegistry } from "./identityService.ts";

// mock prisma（groupBy + findMany）与 primitive + 落库
const mockGroupBy = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const mockFindMany = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    mention: {
      groupBy : (...a: unknown[]) => mockGroupBy(...a),
      findMany: (...a: unknown[]) => mockFindMany(...a)
    }
  }
}));
vi.mock("./primitive.ts", () => ({ runPrimitive: vi.fn() }));
vi.mock("./identityService.ts", () => ({ writeRegistry: vi.fn(async () => ({ created: 1, updated: 0 })) }));

const mockPrimitive = vi.mocked(runPrimitive);
const mockWrite = vi.mocked(writeRegistry);

const registry: BookRegistry = {
  bookId  : "book-1",
  entries : [{ entityId: "e1", canonical: "范进", type: "PERSON", aliases: ["范老爷"], confidenceTier: "HIGH", activeChapters: [3], firstAppearanceChapter: 3, nameType: "NAMED" }],
  loadedAt: new Date()
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrimitive.mockResolvedValue({ output: { verdict: "new_entity", resolvedEntityId: null, evidenceAnchors: [], note: null }, highConfidence: false });
  mockWrite.mockResolvedValue({ created: 1, updated: 0 });
});

describe("runReconcile", () => {
  it("扫出漏网高频表面形式并补判", async () => {
    // 漏网：rawText="范大人" 提及 3 次，不在登记表
    mockGroupBy.mockResolvedValue([
      { rawText: "范大人", _count: { _all: 3 } },
      { rawText: "范老爷", _count: { _all: 5 } } // 已在登记表（别名）
    ]);
    mockFindMany.mockResolvedValue([
      { paraIndex: 1, chapter: { no: 5 }, rawText: "范大人" },
      { paraIndex: 2, chapter: { no: 6 }, rawText: "范大人" },
      { paraIndex: 3, chapter: { no: 7 }, rawText: "范大人" }
    ]);

    const result = await runReconcile({ bookId: "book-1", jobId: "job-1", agentRunId: "run-1", bookSummary: "", skills: [] }, registry);

    // 只补判"范大人"（"范老爷"已在登记表，跳过）
    expect(mockPrimitive).toHaveBeenCalledTimes(1);
    expect(result.newEntities).toBe(1);
    expect(mockWrite).toHaveBeenCalled();
  });

  it("无漏网 → 不调用原语", async () => {
    mockGroupBy.mockResolvedValue([]);
    const result = await runReconcile({ bookId: "book-1", jobId: "job-1", agentRunId: "run-1", bookSummary: "", skills: [] }, registry);
    expect(result.scanned).toBe(0);
    expect(mockPrimitive).not.toHaveBeenCalled();
  });

  it("ambiguous / resolved 分支计数，不触发写", async () => {
    mockGroupBy.mockResolvedValue([
      { rawText: "甲某", _count: { _all: 3 } },
      { rawText: "乙某", _count: { _all: 4 } }
    ]);
    mockFindMany.mockResolvedValue([
      { paraIndex: 1, chapter: { no: 1 }, rawText: "甲某" },
      { paraIndex: 1, chapter: { no: 2 }, rawText: "乙某" }
    ]);
    mockPrimitive
      .mockResolvedValueOnce({ output: { verdict: "ambiguous", resolvedEntityId: null, evidenceAnchors: [], note: "两可" }, highConfidence: false })
      .mockResolvedValueOnce({ output: { verdict: "resolved", resolvedEntityId: "e1", evidenceAnchors: [{ chapterNo: 2, paraIndex: 1 }], note: null }, highConfidence: true });

    const result = await runReconcile({ bookId: "book-1", jobId: "job-1", agentRunId: "run-1", bookSummary: "", skills: [] }, registry);
    expect(result.ambiguous).toBe(1);
    expect(result.resolved).toBe(1);
    expect(result.newEntities).toBe(0);
    expect(mockWrite).not.toHaveBeenCalled();
  });
});
