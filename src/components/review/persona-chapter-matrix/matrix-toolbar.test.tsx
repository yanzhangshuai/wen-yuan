/** @vitest-environment jsdom */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MatrixToolbar } from "./matrix-toolbar";

const chapters = [
  {
    chapterId: "chapter-1",
    chapterNo: 1,
    title    : "学道登场",
    label    : "第 1 回"
  },
  {
    chapterId: "chapter-2",
    chapterNo: 2,
    title    : "中举发迹",
    label    : "第 2 回"
  }
];

describe("MatrixToolbar", () => {
  it("does not render persona keyword search input", () => {
    render(
      <MatrixToolbar
        selectedPersonaId={null}
        focusOnly={false}
        reviewStateFilter=""
        conflictStateFilter=""
        chapterJumpId=""
        chapters={chapters}
        visiblePersonaCount={2}
        chapterCount={2}
        cellCount={4}
        isLoading={false}
        onFocusOnlyChange={vi.fn()}
        onReviewStateChange={vi.fn()}
        onConflictStateChange={vi.fn()}
        onChapterJump={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(screen.queryByPlaceholderText(/输入人物名/)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "搜索人物" })).not.toBeInTheDocument();
  });

  it("renders focus-only switch and it is disabled when no persona is selected", () => {
    render(
      <MatrixToolbar
        selectedPersonaId={null}
        focusOnly={false}
        reviewStateFilter=""
        conflictStateFilter=""
        chapterJumpId=""
        chapters={chapters}
        visiblePersonaCount={2}
        chapterCount={2}
        cellCount={4}
        isLoading={false}
        onFocusOnlyChange={vi.fn()}
        onReviewStateChange={vi.fn()}
        onConflictStateChange={vi.fn()}
        onChapterJump={vi.fn()}
        onReset={vi.fn()}
      />
    );

    const focusSwitch = screen.getByRole("switch");
    expect(focusSwitch).toBeInTheDocument();
    expect(focusSwitch).toBeDisabled();
  });

  it("enables focus-only switch when a persona is selected", () => {
    render(
      <MatrixToolbar
        selectedPersonaId="persona-1"
        focusOnly={false}
        reviewStateFilter=""
        conflictStateFilter=""
        chapterJumpId=""
        chapters={chapters}
        visiblePersonaCount={2}
        chapterCount={2}
        cellCount={4}
        isLoading={false}
        onFocusOnlyChange={vi.fn()}
        onReviewStateChange={vi.fn()}
        onConflictStateChange={vi.fn()}
        onChapterJump={vi.fn()}
        onReset={vi.fn()}
      />
    );

    const focusSwitch = screen.getByRole("switch");
    expect(focusSwitch).not.toBeDisabled();
  });

  it("displays focus banner when focusOnly is true and a persona is selected", () => {
    render(
      <MatrixToolbar
        selectedPersonaId="persona-1"
        selectedPersonaDisplayName="范进"
        focusOnly={true}
        reviewStateFilter=""
        conflictStateFilter=""
        chapterJumpId=""
        chapters={chapters}
        visiblePersonaCount={2}
        chapterCount={2}
        cellCount={4}
        isLoading={false}
        onFocusOnlyChange={vi.fn()}
        onReviewStateChange={vi.fn()}
        onConflictStateChange={vi.fn()}
        onChapterJump={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(screen.getByText(/仅显示「范进」相关单元格/)).toBeInTheDocument();
  });

  it("does not display focus banner when focusOnly is false", () => {
    render(
      <MatrixToolbar
        selectedPersonaId="persona-1"
        selectedPersonaDisplayName="范进"
        focusOnly={false}
        reviewStateFilter=""
        conflictStateFilter=""
        chapterJumpId=""
        chapters={chapters}
        visiblePersonaCount={2}
        chapterCount={2}
        cellCount={4}
        isLoading={false}
        onFocusOnlyChange={vi.fn()}
        onReviewStateChange={vi.fn()}
        onConflictStateChange={vi.fn()}
        onChapterJump={vi.fn()}
        onReset={vi.fn()}
      />
    );

    expect(screen.queryByText(/仅显示/)).not.toBeInTheDocument();
  });

  it("calls onClearSelectedPersona when clear focus link is clicked", () => {
    const onClearSelectedPersona = vi.fn();

    render(
      <MatrixToolbar
        selectedPersonaId="persona-1"
        selectedPersonaDisplayName="范进"
        focusOnly={true}
        reviewStateFilter=""
        conflictStateFilter=""
        chapterJumpId=""
        chapters={chapters}
        visiblePersonaCount={2}
        chapterCount={2}
        cellCount={4}
        isLoading={false}
        onFocusOnlyChange={vi.fn()}
        onReviewStateChange={vi.fn()}
        onConflictStateChange={vi.fn()}
        onChapterJump={vi.fn()}
        onReset={vi.fn()}
        onClearSelectedPersona={onClearSelectedPersona}
      />
    );

    const clearLink = screen.getByRole("button", { name: /清除聚焦/ });
    fireEvent.click(clearLink);

    expect(onClearSelectedPersona).toHaveBeenCalledOnce();
  });

  it("calls onFocusOnlyChange when the switch is toggled", () => {
    const onFocusOnlyChange = vi.fn();

    render(
      <MatrixToolbar
        selectedPersonaId="persona-1"
        focusOnly={false}
        reviewStateFilter=""
        conflictStateFilter=""
        chapterJumpId=""
        chapters={chapters}
        visiblePersonaCount={2}
        chapterCount={2}
        cellCount={4}
        isLoading={false}
        onFocusOnlyChange={onFocusOnlyChange}
        onReviewStateChange={vi.fn()}
        onConflictStateChange={vi.fn()}
        onChapterJump={vi.fn()}
        onReset={vi.fn()}
      />
    );

    const focusSwitch = screen.getByRole("switch");
    fireEvent.click(focusSwitch);

    expect(onFocusOnlyChange).toHaveBeenCalledWith(true);
  });
});
