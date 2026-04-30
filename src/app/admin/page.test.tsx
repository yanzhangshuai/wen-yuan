/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AdminHomePage from "./page";

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

describe("AdminHomePage", () => {
  beforeEach(() => {
    listBooksMock.mockReset();
    listBooksMock.mockResolvedValue([]);
  });

  it("uses the short role profile label for visible admin entry points", async () => {
    // Arrange & Act: 直接执行后台首页 Server Component，再挂载渲染结果。
    const ui = await AdminHomePage();
    render(ui);

    // Assert: 后台首页所有用户可见入口短名都应是“角色资料”，不出现旧长名。
    expect(screen.getByRole("heading", { name: "管理后台" })).toBeInTheDocument();
    expect(screen.getAllByText("角色资料")).toHaveLength(2);
  });
});
