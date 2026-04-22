/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ReviewModeNav } from "./review-mode-nav";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";

/**
 * 文件定位（审核模式导航单测）：
 * - 锁定 T14 新增的审核页模式切换契约；
 * - 后续 T15 增加时间矩阵时，应扩展这里而不是让页面各自硬编码导航。
 */
describe("ReviewModeNav", () => {
  it("renders matrix and relation review modes for the same book", () => {
    render(<ReviewModeNav bookId={BOOK_ID} activeMode="matrix" />);

    const matrixLink = screen.getByRole("link", { name: "人物 x 章节" });
    const relationsLink = screen.getByRole("link", { name: "人物关系" });

    expect(matrixLink).toHaveAttribute("href", `/admin/review/${BOOK_ID}`);
    expect(relationsLink).toHaveAttribute("href", `/admin/review/${BOOK_ID}/relations`);
  });

  it("highlights the current matrix mode", () => {
    render(<ReviewModeNav bookId={BOOK_ID} activeMode="matrix" />);

    expect(screen.getByRole("link", { name: "人物 x 章节" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "人物关系" })).not.toHaveAttribute(
      "aria-current"
    );
  });

  it("highlights the current relation mode", () => {
    render(<ReviewModeNav bookId={BOOK_ID} activeMode="relations" />);

    expect(screen.getByRole("link", { name: "人物关系" })).toHaveAttribute(
      "aria-current",
      "page"
    );
    expect(screen.getByRole("link", { name: "人物 x 章节" })).not.toHaveAttribute(
      "aria-current"
    );
  });
});
