/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import AdminLayout from "./layout";

const { headersMock, getAuthContextMock } = vi.hoisted(() => ({
  headersMock       : vi.fn(),
  getAuthContextMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn()
}));

vi.mock("@/components/layout/admin-header", () => ({
  AdminHeader: ({ userName }: { userName?: string | null }) => (
    <div data-testid="admin-header">{userName ?? "anonymous"}</div>
  )
}));

vi.mock("@/server/modules/auth", () => ({
  AUTH_ADMIN_ROLE     : "ADMIN",
  getAuthContext      : getAuthContextMock,
  sanitizeRedirectPath: vi.fn((path?: string | null) => path ?? "/admin")
}));

describe("AdminLayout", () => {
  beforeEach(() => {
    headersMock.mockReset();
    getAuthContextMock.mockReset();

    headersMock.mockResolvedValue(new Headers({ "x-auth-current-path": "/admin/books" }));
  });

  it("renders admin content inside a shell that stays above the global theme background", async () => {
    // Arrange: 后台布局在星空主题下必须显式创建更高层级，避免内容被 fixed 背景盖住。
    getAuthContextMock.mockResolvedValue({ role: "ADMIN", name: "运营同学" });

    // Act: 直接执行 async Server Component，再用 jsdom 挂载结果。
    const ui = await AdminLayout({
      children: <div>后台内容</div>
    });
    const { container } = render(ui);

    // Assert: 根壳层必须形成独立 stacking context，并保留后台内容可见。
    const shell = container.querySelector(".admin-layout-shell");
    expect(shell).not.toBeNull();
    expect(shell).toHaveClass("relative");
    expect(shell?.className).toContain("z-[1]");
    expect(screen.getByTestId("admin-header")).toHaveTextContent("运营同学");
    expect(screen.getByText("后台内容")).toBeInTheDocument();
  });
});
