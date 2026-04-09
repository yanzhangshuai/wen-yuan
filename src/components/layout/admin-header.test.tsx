/** @vitest-environment jsdom */

/**
 * 说明：
 * - 本文件锁定运营后台头部的站点级导航契约；
 * - 重点验证品牌 Logo 的真实去向、退出按钮文案，以及退出后的跳转兜底。
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AdminHeader } from "@/components/layout/admin-header";

const { logoutMock, pushMock } = vi.hoisted(() => ({
  logoutMock: vi.fn(),
  pushMock  : vi.fn()
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

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin/books",
  useRouter  : () => ({ push: pushMock })
}));

vi.mock("@/components/theme", () => ({
  ThemeToggle: () => <button type="button">切换主题</button>
}));

vi.mock("@/lib/services/auth", () => ({
  logout: logoutMock
}));

describe("AdminHeader", () => {
  beforeEach(() => {
    pushMock.mockReset();
    logoutMock.mockReset();
  });

  it("routes the logo back to viewer home instead of admin overview", () => {
    // Arrange: 渲染带用户信息的后台头部。
    render(<AdminHeader userName="运营同学" />);

    // Assert: 左上角品牌入口必须回主站，而不是后台概览。
    const homeLink = screen.getByRole("link", { name: "返回主站" });
    expect(homeLink).toHaveAttribute("href", "/");
  });

  it("renders the short logout label", () => {
    // Arrange: 渲染头部。
    render(<AdminHeader userName="运营同学" />);

    // Assert: 使用简化文案“退出”，避免后台专属措辞冗余。
    expect(screen.getByRole("button", { name: "退出" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "退出管理" })).toBeNull();
  });

  it("navigates to login after logout succeeds", async () => {
    // Arrange: 模拟退出接口成功。
    logoutMock.mockResolvedValueOnce(undefined);

    render(<AdminHeader userName="运营同学" />);
    // Act: 点击退出按钮。
    fireEvent.click(screen.getByRole("button", { name: "退出" }));

    // Assert: 成功分支必须跳转到登录页。
    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalledTimes(1);
      expect(pushMock).toHaveBeenCalledWith("/login");
    });
  });

  it("still navigates to login when logout request fails", async () => {
    // Arrange: 模拟接口失败，验证兜底导航仍成立。
    logoutMock.mockRejectedValueOnce(new Error("network"));

    render(<AdminHeader userName="运营同学" />);
    // Act: 点击退出按钮。
    fireEvent.click(screen.getByRole("button", { name: "退出" }));

    // Assert: 失败分支也要强制离开后台受保护域。
    await waitFor(() => {
      expect(logoutMock).toHaveBeenCalledTimes(1);
      expect(pushMock).toHaveBeenCalledWith("/login");
    });
  });
});
