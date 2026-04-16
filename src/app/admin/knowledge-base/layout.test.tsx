/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import KnowledgeBaseLayout from "./layout";

const { capturedNavProps } = vi.hoisted(() => ({
  capturedNavProps: {
    links: [] as Array<Record<string, unknown>>
  }
}));

vi.mock("./knowledge-base-nav", () => ({
  KnowledgeBaseNav: ({ links }: { links: Array<Record<string, unknown>> }) => {
    capturedNavProps.links = links;
    return <div data-testid="knowledge-base-nav" />;
  }
}));

describe("KnowledgeBaseLayout", () => {
  it("passes only serializable nav link data to the client navigation component", () => {
    // Arrange: layout 是 Server Component，传给客户端导航的 props 必须保持可序列化。
    render(
      <KnowledgeBaseLayout>
        <div>知识库内容</div>
      </KnowledgeBaseLayout>
    );

    // Assert: 导航入口仍然渲染，同时链接配置里不应出现函数型 icon。
    expect(screen.getByText("知识库管理")).toBeInTheDocument();
    expect(capturedNavProps.links.length).toBeGreaterThan(0);
    expect(capturedNavProps.links.every((link) => typeof link.iconKey === "string")).toBe(true);
    expect(capturedNavProps.links.some((link) => typeof link.icon === "function")).toBe(false);
  });
});
