/**
 * 文件定位（前端/同构 lib 层单测）：
 * - 验证页面调用的服务封装与策略计算逻辑，确保请求契约和推荐结果稳定。
 * - 该层位于 React 组件与后端 API 之间，负责把业务动作转换为可执行调用。
 *
 * 业务职责：
 * - 降低页面重复拼装请求的复杂度。
 * - 通过单测锁定关键参数与默认值，减少联调风险。
 */

import { describe, expect, it } from "vitest";
import {
  STAGE_RECOMMENDED_MODELS,
  isRecommendedModelMatch,
  pickRecommendedEnabledModel
} from "@/lib/model-recommendations";
import { PipelineStage } from "@/types/pipeline";

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("model recommendations config", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("picks recommended model by aliasKey", () => {
    const recommendation = STAGE_RECOMMENDED_MODELS[PipelineStage.CHUNK_EXTRACTION];
    const chosen = pickRecommendedEnabledModel(recommendation, [
      { id: "m-1", aliasKey: "deepseek-v3-stable" },
      { id: "m-2", aliasKey: "legacy-alias" }
    ]);

    expect(chosen?.id).toBe("m-1");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("does not match when aliasKey is missing", () => {
    const recommendation = STAGE_RECOMMENDED_MODELS[PipelineStage.CHUNK_EXTRACTION];
    const chosen = pickRecommendedEnabledModel(recommendation, [
      { id: "m-1", aliasKey: null },
      { id: "m-2", aliasKey: undefined }
    ]);

    expect(chosen).toBeNull();
  });
});
