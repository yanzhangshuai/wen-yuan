/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReviewStateBadge } from "./review-state-badge";

/**
 * 文件定位（审核状态徽标单测）：
 * - 锁定 reviewer-facing 的中文状态文案，避免后续矩阵页出现英文枚举泄漏。
 * - 冲突态需要单独断言 warning 风格，因为 T13/T14 都会复用这层视觉语义。
 */
describe("ReviewStateBadge", () => {
  it("renders stable Chinese labels for every review state", () => {
    render(
      <div>
        <ReviewStateBadge reviewState="PENDING" />
        <ReviewStateBadge reviewState="ACCEPTED" />
        <ReviewStateBadge reviewState="REJECTED" />
        <ReviewStateBadge reviewState="EDITED" />
        <ReviewStateBadge reviewState="DEFERRED" />
        <ReviewStateBadge reviewState="CONFLICTED" />
      </div>
    );

    expect(screen.getByText("待审核")).toBeInTheDocument();
    expect(screen.getByText("已接受")).toBeInTheDocument();
    expect(screen.getByText("已拒绝")).toBeInTheDocument();
    expect(screen.getByText("已修订")).toBeInTheDocument();
    expect(screen.getByText("已暂缓")).toBeInTheDocument();
    expect(screen.getByText("冲突待判")).toBeInTheDocument();
  });

  it("renders active conflicts with a visible warning treatment", () => {
    render(<ReviewStateBadge reviewState="PENDING" conflictState="ACTIVE" />);

    const badge = screen.getByText(/待审核.*冲突/);
    expect(badge).toHaveClass("bg-warning");
    expect(badge).toHaveAttribute("data-conflict-state", "ACTIVE");
  });
});
