/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AdminRoleWorkbenchPage, { metadata } from "./page";

const { listBooksMock } = vi.hoisted(() => ({
  listBooksMock: vi.fn()
}));

interface MockLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href    : string;
  children: React.ReactNode;
}

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: MockLinkProps) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));

vi.mock("@/server/modules/books/listBooks", () => ({
  listBooks: listBooksMock
}));

describe("AdminRoleWorkbenchPage", () => {
  beforeEach(() => {
    listBooksMock.mockReset();
    listBooksMock.mockResolvedValue([]);
  });

  it("uses the short role profile name in metadata and page heading", async () => {
    // Arrange & Act: 首页无书籍时也必须展示短名与录入定位说明。
    const ui = await AdminRoleWorkbenchPage();
    render(ui);

    // Assert: metadata、页面标题和描述都保持“AI 预填 + 人工补全/确认”的产品定位。
    expect(metadata.title).toBe("角色资料");
    expect(screen.getByRole("heading", { name: "角色资料" })).toBeInTheDocument();
    expect(screen.getByText("AI 预填人物、关系与传记事件，人工补全后确认入库")).toBeInTheDocument();
  });
});
