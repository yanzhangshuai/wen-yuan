/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import GraphLoading from "./loading";

describe("GraphLoading", () => {
  it("renders book-opening loading stage with accessible status", () => {
    const { container } = render(<GraphLoading />);

    expect(screen.getByRole("status", { name: "正在展开书籍并加载人物图谱" })).toBeInTheDocument();
    expect(screen.getByText("书卷展开中，正在载入人物图谱")).toBeInTheDocument();

    expect(container.querySelector(".graph-loading-book-cover-left")).not.toBeNull();
    expect(container.querySelector(".graph-loading-book-cover-right")).not.toBeNull();
    expect(container.querySelectorAll(".graph-loading-book-dots span")).toHaveLength(3);
  });
});
