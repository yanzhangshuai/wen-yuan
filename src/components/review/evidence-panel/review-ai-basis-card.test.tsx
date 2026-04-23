/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildAiSummary, buildClaimDetailRecord } from "./test-fixtures";
import { ReviewAiBasisCard } from "./review-ai-basis-card";

describe("ReviewAiBasisCard", () => {
  it("renders AI basis summary lines and raw-output reviewer summary", () => {
    render(
      <ReviewAiBasisCard
        aiSummary={buildAiSummary({
          rawOutput: {
            stageKey         : "stage-2-relation",
            provider         : "openai",
            model            : "gpt-5.4",
            createdAt        : "2026-04-22T10:00:00.000Z",
            responseExcerpt  : "识别到周进与范进之间的师生关系。",
            hasStructuredJson: true,
            parseError       : "字段缺失后自动回退",
            schemaError      : null,
            discardReason    : null
          }
        })}
        basisClaim={buildClaimDetailRecord({
          id         : "claim-basis-1",
          claimId    : "claim-basis-1",
          reviewState: "ACCEPTED"
        })}
      />
    );

    expect(screen.getByRole("heading", { name: "AI 提取依据" })).toBeInTheDocument();
    expect(screen.getByText("关系")).toBeInTheDocument();
    expect(screen.getByText("章节：chapter-1")).toBeInTheDocument();
    expect(screen.getByText("模型输出摘要")).toBeInTheDocument();
    expect(screen.getByText("stage-2-relation")).toBeInTheDocument();
    expect(screen.getByText("openai / gpt-5.4")).toBeInTheDocument();
    expect(screen.getByText("识别到周进与范进之间的师生关系。")).toBeInTheDocument();
    expect(screen.getByText("字段缺失后自动回退")).toBeInTheDocument();
  });

  it("shows an empty reviewer hint when there is no AI basis", () => {
    render(<ReviewAiBasisCard aiSummary={null} basisClaim={null} />);

    expect(screen.getByText("暂无 AI 依据")).toBeInTheDocument();
  });
});
