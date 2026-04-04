import { describe, expect, it } from "vitest";
import {
  STAGE_RECOMMENDED_MODELS,
  isRecommendedModelMatch,
  pickRecommendedEnabledModel
} from "@/lib/model-recommendations";
import { PipelineStage } from "@/types/pipeline";

describe("model recommendations config", () => {
  it("maps each stage to an explicit recommendation alias", () => {
    expect(STAGE_RECOMMENDED_MODELS[PipelineStage.ROSTER_DISCOVERY]).toMatchObject({
      alias: "qwen-max-stable"
    });
    expect(STAGE_RECOMMENDED_MODELS[PipelineStage.CHUNK_EXTRACTION]).toMatchObject({
      alias: "deepseek-v3-stable"
    });
    expect(STAGE_RECOMMENDED_MODELS[PipelineStage.CHAPTER_VALIDATION]).toMatchObject({
      alias: "qwen-plus-stable"
    });
    expect(STAGE_RECOMMENDED_MODELS[PipelineStage.TITLE_RESOLUTION]).toMatchObject({
      alias: "qwen-max-stable"
    });
    expect(STAGE_RECOMMENDED_MODELS[PipelineStage.GRAY_ZONE_ARBITRATION]).toMatchObject({
      alias: "qwen-plus-stable"
    });
    expect(STAGE_RECOMMENDED_MODELS[PipelineStage.BOOK_VALIDATION]).toMatchObject({
      alias: "qwen-max-stable"
    });
    expect(STAGE_RECOMMENDED_MODELS[PipelineStage.FALLBACK]).toMatchObject({
      alias: "qwen-plus-stable"
    });
  });

  it("matches strictly by aliasKey", () => {
    const recommendation = STAGE_RECOMMENDED_MODELS[PipelineStage.CHUNK_EXTRACTION];
    expect(recommendation).not.toBeNull();

    expect(
      isRecommendedModelMatch(recommendation, {
        aliasKey: "deepseek-v3-stable"
      })
    ).toBe(true);
    expect(
      isRecommendedModelMatch(recommendation, {
        aliasKey: "deepseek-v3-stable"
      })
    ).toBe(true);
    expect(
      isRecommendedModelMatch(recommendation, {
        aliasKey: "other-alias"
      })
    ).toBe(false);
  });

  it("picks recommended model by aliasKey", () => {
    const recommendation = STAGE_RECOMMENDED_MODELS[PipelineStage.CHUNK_EXTRACTION];
    const chosen = pickRecommendedEnabledModel(recommendation, [
      { id: "m-1", aliasKey: "deepseek-v3-stable" },
      { id: "m-2", aliasKey: "legacy-alias" }
    ]);

    expect(chosen?.id).toBe("m-1");
  });

  it("does not match when aliasKey is missing", () => {
    const recommendation = STAGE_RECOMMENDED_MODELS[PipelineStage.CHUNK_EXTRACTION];
    const chosen = pickRecommendedEnabledModel(recommendation, [
      { id: "m-1", aliasKey: null },
      { id: "m-2", aliasKey: undefined }
    ]);

    expect(chosen).toBeNull();
  });
});
