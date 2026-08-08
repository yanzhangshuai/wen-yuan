import { beforeEach, describe, expect, it, vi } from "vitest";
import { runTier1 } from "./tier1.ts";

import { callIdentityLlm } from "./llm.ts";
import { writeRegistry } from "./identityService.ts";

// mock llm 调用 + 落库
vi.mock("./llm.ts", () => ({
  callIdentityLlm: vi.fn()
}));
vi.mock("./identityService.ts", () => ({
  writeRegistry: vi.fn(async () => ({ created: 3, updated: 0 }))
}));

const mockCall = vi.mocked(callIdentityLlm);
const mockWrite = vi.mocked(writeRegistry);

// 小书（≤ MAX_SHARD_TOKENS）走 single_pass；分卷用例单独覆盖大书。
const baseInput = {
  bookId        : "book-1",
  jobId         : "job-1",
  agentRunId    : "run-1",
  fullText      : "　　第一回　内容A\n　　第二回　内容B\n",
  bookSizeTokens: 10_000
};

beforeEach(() => {
  mockCall.mockReset();
  mockWrite.mockReset();
  mockWrite.mockResolvedValue({ created: 3, updated: 0 });
});

describe("runTier1", () => {
  it("single_pass 路径：按 3 组调用，合并后落库", async () => {
    mockCall
      .mockResolvedValueOnce({
        data: [{ canonical: "范进", type: "PERSON", aliases: ["范老爷"], evidenceAnchors: [{ chapterNo: 3, paraIndex: 1 }] }]
      })
      .mockResolvedValueOnce({
        data: [{ canonical: "诸暨县", type: "LOCATION", aliases: [], evidenceAnchors: [{ chapterNo: 1, paraIndex: 1 }] }]
      })
      .mockResolvedValueOnce({
        data: []
      });

    await runTier1(baseInput);
    expect(mockCall).toHaveBeenCalledTimes(3); // PERSON/LOCATION/ORGANIZATION
    expect(mockWrite).toHaveBeenCalledTimes(1);
    const arg = mockWrite.mock.calls[0][0];
    expect(arg.entries.some((e: { canonical: string }) => e.canonical === "范进")).toBe(true);
    expect(arg.entries.some((e: { canonical: string }) => e.canonical === "诸暨县")).toBe(true);
  });

  it("预扫描候选并入（LLM 漏项）", async () => {
    mockCall.mockResolvedValue({
      data: [{ canonical: "范进", type: "PERSON", aliases: [], evidenceAnchors: [] }]
    });
    await runTier1({
      ...baseInput,
      prescanCandidates: [{ canonical: "周进", type: "PERSON", aliases: ["周学道"], evidenceAnchors: [{ chapterNo: 2, paraIndex: 1 }] }]
    });
    const arg = mockWrite.mock.calls[0][0];
    expect(arg.entries.some((e: { canonical: string }) => e.canonical === "周进")).toBe(true);
  });

  it("volume 路径（大书按 token 自动分卷）：每卷按类型拆分调用 + 合并", async () => {
    // 30 章 + 200K token → 目标 17 卷（每片 ≤12K），卷大小 = ceil(30/17) = 2，重叠 = floor(2/2)=1。
    const longText = Array.from({ length: 30 }, (_, i) => `　　第${i + 1}回　内容${i + 1}`).join("\n");
    mockCall.mockResolvedValue({
      data: [{ canonical: "范进", type: "PERSON", aliases: ["范老爷"], evidenceAnchors: [{ chapterNo: 3, paraIndex: 1 }] }]
    });
    await runTier1({
      ...baseInput,
      fullText      : longText,
      bookSizeTokens: 200_000
    });
    // volume 分支：i = 0,2,4,…,28 → 15 卷 × 3 类型 = 45 次调用（单次输出仅一种类型）
    expect(mockCall).toHaveBeenCalledTimes(45);
    expect(mockWrite).toHaveBeenCalledTimes(1);
  });
});
