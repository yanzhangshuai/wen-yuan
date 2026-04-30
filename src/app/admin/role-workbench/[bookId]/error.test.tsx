/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import BookRoleWorkbenchError from "./error";

describe("BookRoleWorkbenchError", () => {
  it("uses the short role profile wording in the visible fallback copy", () => {
    // Arrange & Act: 渲染单书错误边界，并使用空 message 触发兜底文案。
    render(<BookRoleWorkbenchError error={new Error("")} reset={vi.fn()} />);

    // Assert: 单书错误态继续使用短名，不出现旧长名。
    expect(screen.getByRole("heading", { name: "角色资料页面出错" })).toBeInTheDocument();
    expect(screen.getByText("加载角色资料时发生错误，请稍后重试。")).toBeInTheDocument();
  });
});
