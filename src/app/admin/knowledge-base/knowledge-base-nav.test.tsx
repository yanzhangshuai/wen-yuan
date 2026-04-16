/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { KnowledgeBaseNav } from "./knowledge-base-nav";

const { usePathnameMock } = vi.hoisted(() => ({
  usePathnameMock: vi.fn()
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
  usePathname: usePathnameMock
}));

describe("KnowledgeBaseNav", () => {
  beforeEach(() => {
    usePathnameMock.mockReset();
  });

  it("marks overview active only on the exact overview route", () => {
    // Arrange: 总览页只允许精确匹配，避免所有子路由都误高亮“总览”。
    usePathnameMock.mockReturnValue("/admin/knowledge-base");

    render(
      <KnowledgeBaseNav
        links={[
          { href: "/admin/knowledge-base", label: "总览", iconKey: "overview" },
          { href: "/admin/knowledge-base/surnames", label: "姓氏词库", iconKey: "surname" }
        ]}
      />
    );

    // Assert: 总览页精确命中时应标记为当前页，其他入口保持未选中。
    expect(screen.getByRole("link", { name: "总览" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "姓氏词库" })).not.toHaveAttribute("aria-current");
  });

  it("marks the matching child route active without activating overview", () => {
    // Arrange: 子路由命中时，只有对应模块高亮，不能把总览一起标成当前页。
    usePathnameMock.mockReturnValue("/admin/knowledge-base/surnames");

    render(
      <KnowledgeBaseNav
        links={[
          { href: "/admin/knowledge-base", label: "总览", iconKey: "overview" },
          { href: "/admin/knowledge-base/surnames", label: "姓氏词库", iconKey: "surname" }
        ]}
      />
    );

    // Assert: 子路由使用前缀匹配，且总览必须保持未激活。
    expect(screen.getByRole("link", { name: "总览" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "姓氏词库" })).toHaveAttribute("aria-current", "page");
  });
});
