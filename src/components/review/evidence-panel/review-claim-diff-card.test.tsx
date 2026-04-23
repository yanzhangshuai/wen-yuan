/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { buildFieldDiff, buildVersionDiff } from "./test-fixtures";
import { ReviewClaimDiffCard } from "./review-claim-diff-card";

describe("ReviewClaimDiffCard", () => {
  it("renders reviewer-friendly version diffs with source labels", () => {
    render(
      <ReviewClaimDiffCard
        versionDiff={buildVersionDiff({
          versionSource: "MANUAL_LINEAGE",
          fieldDiffs   : [
            buildFieldDiff({
              fieldKey  : "effectiveChapterEnd",
              fieldLabel: "生效结束章节",
              beforeText: "2",
              afterText : "3"
            })
          ]
        })}
      />
    );

    expect(screen.getByRole("heading", { name: "版本差异" })).toBeInTheDocument();
    expect(screen.getByText("手工 lineage 比对")).toBeInTheDocument();
    expect(screen.getByText("生效结束章节")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows an empty state when the current claim has no version diff", () => {
    render(
      <ReviewClaimDiffCard
        versionDiff={buildVersionDiff({
          versionSource: "NONE",
          fieldDiffs   : []
        })}
      />
    );

    expect(screen.getByText("当前 claim 暂无版本差异")).toBeInTheDocument();
  });
});
