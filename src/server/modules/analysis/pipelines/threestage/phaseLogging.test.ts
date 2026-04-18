import { describe, expect, it, vi } from "vitest";

import {
  buildStageSummaryLogMessage,
  writeStagePhaseLog
} from "@/server/modules/analysis/pipelines/threestage/phaseLogging";

describe("phaseLogging", () => {
  it("builds a compact stage summary payload", () => {
    const message = buildStageSummaryLogMessage({
      stage  : "STAGE_A",
      status : "WARNING",
      metrics: {
        totalMentions       : 1,
        chaptersWithMentions: 1
      }
    }, [
      {
        code   : "STAGE_A_SPARSE_COVERAGE",
        stage  : "STAGE_A",
        message: "Stage A coverage is sparse"
      }
    ]);

    expect(message).toContain("\"totalMentions\":1");
    expect(message).toContain("\"code\":\"STAGE_A_SPARSE_COVERAGE\"");
  });

  it("writes system phase logs without model binding", async () => {
    const create = vi.fn().mockResolvedValue({});

    await writeStagePhaseLog({
      prisma    : { analysisPhaseLog: { create } } as never,
      jobId     : "job-1",
      stage     : "STAGE_C",
      status    : "SUCCESS",
      durationMs: 123,
      summary   : { biographiesCreated: 4 }
    });

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId       : "job-1",
        stage       : "STAGE_C",
        modelId     : null,
        modelSource : "SYSTEM",
        status      : "SUCCESS",
        durationMs  : 123,
        errorMessage: expect.stringContaining("\"biographiesCreated\":4")
      })
    });
  });
});
