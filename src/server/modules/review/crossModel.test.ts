/**
 * 被测对象：crossModel（跨模型复核接口）。
 * 测试目标：复用身份判定原语 + 显式 modelId 换模型。
 * 覆盖范围：success / 非 resolved / modelId 透传。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { crossModelReview } from "./crossModel";
import { runPrimitive } from "@/server/modules/identity/primitive";

vi.mock("@/server/modules/identity/primitive", () => ({
  runPrimitive: vi.fn()
}));

const mockRunPrimitive = vi.mocked(runPrimitive);

const BASE_INPUT = {
  surfaceForm: "范老爷",
  windows    : [{ chapterNo: 3, paraIndex: 1, excerpt: "范老爷中了秀才" }],
  registry   : { bookId: "book-1", entries: [], loadedAt: new Date() },
  bookSummary: "儒林外史",
  skills     : ["keju"],
  jobId      : "job-1",
  modelId    : "model-2"
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("crossModelReview", () => {
  it("复用 runPrimitive 并透传 modelId 换模型", async () => {
    // Arrange
    mockRunPrimitive.mockResolvedValue({
      output        : { verdict: "resolved", resolvedEntityId: "entity-1", evidenceAnchors: [{ chapterNo: 3, paraIndex: 1 }], note: null },
      highConfidence: true
    });

    // Act
    const result = await crossModelReview(BASE_INPUT);

    // Assert
    expect(mockRunPrimitive).toHaveBeenCalledWith(expect.objectContaining({
      surfaceForm: "范老爷",
      modelId    : "model-2"
    }));
    expect(result).toEqual({
      verdict         : "resolved",
      highConfidence  : true,
      resolvedEntityId: "entity-1",
      modelId         : "model-2"
    });
  });

  it("verdict 非 resolved 时透传（ambiguous → 人审）", async () => {
    // Arrange
    mockRunPrimitive.mockResolvedValue({
      output        : { verdict: "ambiguous", resolvedEntityId: null, evidenceAnchors: [], note: "需人工判断" },
      highConfidence: false
    });

    // Act
    const result = await crossModelReview(BASE_INPUT);

    // Assert
    expect(result.verdict).toBe("ambiguous");
    expect(result.highConfidence).toBe(false);
    expect(result.resolvedEntityId).toBeNull();
  });
});
