/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import RoleWorkbenchError from "./error";

describe("RoleWorkbenchError", () => {
  it("uses the short role profile title in the visible error boundary", () => {
    // Arrange & Act: 渲染通用错误边界，并使用空 message 触发兜底文案。
    render(<RoleWorkbenchError error={new Error("")} reset={vi.fn()} />);

    // Assert: 错误标题使用短名，兜底描述不再暴露旧长名。
    expect(screen.getByRole("heading", { name: "角色资料出错" })).toBeInTheDocument();
    expect(screen.getByText("加载角色资料数据时出错，请重试。")).toBeInTheDocument();
  });
});
