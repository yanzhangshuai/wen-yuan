/** @vitest-environment jsdom */
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { buildEvidenceSpan } from "./test-fixtures";
import { ReviewEvidenceList } from "./review-evidence-list";

describe("ReviewEvidenceList", () => {
  it("renders ordered evidence rows with chapter labels and supports span selection", () => {
    const onSelectEvidenceSpan = vi.fn();

    render(
      <ReviewEvidenceList
        evidence={[
          buildEvidenceSpan({
            id          : "evidence-2",
            chapterId   : "chapter-02",
            chapterLabel: "第 2 回",
            startOffset : 40,
            quotedText  : "第二回后段证据。"
          }),
          buildEvidenceSpan({
            id          : "evidence-1",
            chapterId   : "chapter-01",
            chapterLabel: "第 1 回",
            startOffset : 8,
            quotedText  : "第一回前段证据。"
          })
        ]}
        selectedEvidenceSpanId="evidence-1"
        onSelectEvidenceSpan={onSelectEvidenceSpan}
      />
    );

    const items = screen.getAllByTestId("review-evidence-item");
    expect(items).toHaveLength(2);
    expect(within(items[0]).getByText("第 1 回")).toBeInTheDocument();
    expect(within(items[1]).getByText("第 2 回")).toBeInTheDocument();

    const selectedButton = within(items[0]).getByRole("button", { name: /第一回前段证据/ });
    expect(selectedButton).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(within(items[1]).getByRole("button", { name: /第二回后段证据/ }));
    expect(onSelectEvidenceSpan).toHaveBeenCalledWith("evidence-2");
  });

  it("shows an explicit empty state when no evidence spans are present", () => {
    render(<ReviewEvidenceList evidence={[]} />);

    expect(screen.getByText("暂无原文证据")).toBeInTheDocument();
  });
});
