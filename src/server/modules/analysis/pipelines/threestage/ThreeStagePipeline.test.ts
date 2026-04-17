/**
 * 文件定位（三阶段 pipeline orchestrator 单测）：
 * - 验证章节硬提取 → B.5 → B → C 的顺序与进度回调；
 * - 验证工厂注入替代默认 service 实例（便于在测试中 stub 全链路）。
 */

import { describe, expect, it, vi } from "vitest";

import { createThreeStagePipeline } from "@/server/modules/analysis/pipelines/threestage/ThreeStagePipeline";
import type { PipelineRunParams } from "@/server/modules/analysis/pipelines/types";
import type { AiProviderClient } from "@/server/providers/ai";

function buildRunParams(overrides: Partial<PipelineRunParams> = {}): PipelineRunParams {
  return {
    jobId     : "job-1",
    bookId    : "book-1",
    chapters  : [{ id: "chapter-1", no: 1 }, { id: "chapter-2", no: 2 }],
    isCanceled: async () => false,
    onProgress: async () => undefined,
    ...overrides
  };
}

function fakeAiClient(): AiProviderClient {
  return {
    generateJson: vi.fn().mockResolvedValue({ content: "{}", usage: null })
  };
}

function fakePrisma() {
  return {
    book: {
      findUnique: vi.fn().mockResolvedValue({ id: "book-1", typeCode: "CLASSICAL" })
    },
    chapter: {
      findUnique: vi.fn().mockImplementation(async ({ where: { id } }: { where: { id: string } }) => ({
        id,
        no     : id === "chapter-1" ? 1 : 2,
        content: "章节正文"
      }))
    }
  };
}

describe("ThreeStagePipeline", () => {
  it("fails fast when dependencies are missing", async () => {
    const pipeline = createThreeStagePipeline();
    await expect(pipeline.run(buildRunParams())).rejects.toThrow("ThreeStagePipeline 缺少运行时依赖");
  });

  it("runs Stage A per chapter and then B.5 → B → C in order", async () => {
    const stageA = { extract: vi.fn().mockResolvedValue({ mentionCount: 0 }) };
    const stageB5 = { check: vi.fn().mockResolvedValue({ created: 0 }) };
    const stageB = { resolve: vi.fn().mockResolvedValue({ merges: 0 }) };
    const stageC = { attribute: vi.fn().mockResolvedValue({ biographyCount: 0 }) };

    const progressUpdates: number[] = [];
    const pipeline = createThreeStagePipeline({
      prisma            : fakePrisma() as never,
      aiClient          : fakeAiClient(),
      chapterConcurrency: 2,
      chapterMaxRetries : 0,
      chapterRetryBaseMs: 1,
      stageAFactory     : () => stageA,
      stageB5Factory    : () => stageB5,
      stageBFactory     : () => stageB,
      stageCFactory     : () => stageC
    });

    const params = buildRunParams({
      onProgress: async (update) => {
        progressUpdates.push(update.progress);
      }
    });

    const result = await pipeline.run(params);

    expect(stageA.extract).toHaveBeenCalledTimes(2);
    expect(stageB5.check).toHaveBeenCalledWith("book-1");
    expect(stageB.resolve).toHaveBeenCalledWith({ bookId: "book-1" });
    expect(stageC.attribute).toHaveBeenCalledWith({ bookId: "book-1", jobId: "job-1" });
    expect(result.completedChapters).toBe(2);
    expect(result.failedChapters).toBe(0);
    expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
  });

  it("stops early on cancellation before Stage B.5", async () => {
    const stageA = { extract: vi.fn().mockResolvedValue({ mentionCount: 0 }) };
    const stageB5 = { check: vi.fn() };
    const stageB = { resolve: vi.fn() };
    const stageC = { attribute: vi.fn() };

    let calls = 0;
    const pipeline = createThreeStagePipeline({
      prisma            : fakePrisma() as never,
      aiClient          : fakeAiClient(),
      chapterConcurrency: 1,
      chapterMaxRetries : 0,
      chapterRetryBaseMs: 1,
      stageAFactory     : () => stageA,
      stageB5Factory    : () => stageB5,
      stageBFactory     : () => stageB,
      stageCFactory     : () => stageC
    });

    await pipeline.run(buildRunParams({
      isCanceled: async () => {
        calls += 1;
        // Cancel after Stage A completed for both chapters but before Stage B.5.
        return calls > 2;
      }
    }));

    expect(stageB5.check).not.toHaveBeenCalled();
    expect(stageB.resolve).not.toHaveBeenCalled();
    expect(stageC.attribute).not.toHaveBeenCalled();
  });
});
