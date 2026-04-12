/**
 * 文件定位（analysis pipeline 抽象层单测）：
 * - 验证 Phase 1 新增的工厂与空壳实现不会偷偷接管现有执行链路；
 * - 核心断言是“能按架构正确选实现，且在被误调用时明确失败”。
 */

import { describe, expect, it } from "vitest";

import { createPipeline } from "@/server/modules/analysis/pipelines/factory";
import type { PipelineRunParams } from "@/server/modules/analysis/pipelines/types";

function buildRunParams(): PipelineRunParams {
  return {
    jobId     : "job-1",
    bookId    : "book-1",
    chapters  : [{ id: "chapter-1", no: 1 }],
    isCanceled: async () => false,
    onProgress: async () => undefined
  };
}

describe("analysis pipeline factory", () => {
  it("returns sequential pipeline and fails fast when runtime dependencies are missing", async () => {
    const pipeline = createPipeline("sequential");

    expect(pipeline.architecture).toBe("sequential");
    await expect(pipeline.run(buildRunParams())).rejects.toThrow(
      "SequentialPipeline 缺少运行时依赖"
    );
  });

  it("returns twopass pipeline and fails fast when runtime dependencies are missing", async () => {
    const pipeline = createPipeline("twopass");

    expect(pipeline.architecture).toBe("twopass");
    await expect(pipeline.run(buildRunParams())).rejects.toThrow(
      "TwoPassPipeline 缺少运行时依赖"
    );
  });
});
