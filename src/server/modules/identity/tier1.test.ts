import { beforeEach, describe, expect, it, vi } from "vitest";
import { runTier1 } from "./tier1.ts";

// mock llm 调用 + 落库
vi.mock("./llm.ts", () => ({
  callIdentityLlm: vi.fn(),
}));
vi.mock("./identityService.ts", () => ({
  writeRegistry: vi.fn(async () => ({ created: 3, updated: 0 })),
}));

// mock fs（A/B 校准表读取）：默认单遍，分卷测试里覆盖
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(() => JSON.stringify({})),
}));
import { readFileSync } from "node:fs";
const readFileSyncMock = vi.mocked(readFileSync);

import { callIdentityLlm } from "./llm.ts";
import { writeRegistry } from "./identityService.ts";

const mockCall = vi.mocked(callIdentityLlm);
const mockWrite = vi.mocked(writeRegistry);

const baseInput = {
  bookId: "book-1",
  jobId: "job-1",
  fullText: "　　第一回　内容A\n　　第二回　内容B\n",
  bookSizeTokens: 200_000,
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
        data: [{ canonical: "范进", type: "PERSON", aliases: ["范老爷"], evidenceAnchors: [{ chapterNo: 3, paraIndex: 1 }] }],
        modelId: "m1",
        isFallback: false,
      })
      .mockResolvedValueOnce({
        data: [{ canonical: "诸暨县", type: "LOCATION", aliases: [], evidenceAnchors: [{ chapterNo: 1, paraIndex: 1 }] }],
        modelId: "m1",
        isFallback: false,
      })
      .mockResolvedValueOnce({
        data: [],
        modelId: "m1",
        isFallback: false,
      });

    await runTier1(baseInput, "deepseek-v3");
    expect(mockCall).toHaveBeenCalledTimes(3); // PERSON/LOCATION/ORGANIZATION
    expect(mockWrite).toHaveBeenCalledTimes(1);
    const arg = mockWrite.mock.calls[0][0];
    expect(arg.entries.some((e: { canonical: string }) => e.canonical === "范进")).toBe(true);
    expect(arg.entries.some((e: { canonical: string }) => e.canonical === "诸暨县")).toBe(true);
  });

  it("预扫描候选并入（LLM 漏项）", async () => {
    mockCall.mockResolvedValue({
      data: [{ canonical: "范进", type: "PERSON", aliases: [], evidenceAnchors: [] }],
      modelId: "m1",
      isFallback: false,
    });
    await runTier1({
      ...baseInput,
      prescanCandidates: [{ canonical: "周进", type: "PERSON", aliases: ["周学道"], evidenceAnchors: [{ chapterNo: 2, paraIndex: 1 }] }],
    }, "deepseek-v3");
    const arg = mockWrite.mock.calls[0][0];
    expect(arg.entries.some((e: { canonical: string }) => e.canonical === "周进")).toBe(true);
  });

  it("volume 路径（校准表返回 volume）：按卷调用 + 合并", async () => {
    readFileSyncMock.mockReturnValue(JSON.stringify({ "deepseek-v3": { "<400K": "volume" } }));
    const longText = Array.from({ length: 30 }, (_, i) => `　　第${i + 1}回　内容${i + 1}`).join("\n");
    mockCall.mockResolvedValue({
      data: [{ canonical: "范进", type: "PERSON", aliases: ["范老爷"], evidenceAnchors: [{ chapterNo: 3, paraIndex: 1 }] }],
      modelId: "m1",
      isFallback: false,
    });
    await runTier1({ ...baseInput, fullText: longText }, "deepseek-v3");
    // volume 分支：30 章 → 2 卷（每卷 25 + 重叠 3）
    expect(mockCall).toHaveBeenCalledTimes(2);
    expect(mockWrite).toHaveBeenCalledTimes(1);
  });
});
