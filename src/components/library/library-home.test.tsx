/** @vitest-environment jsdom */

/**
 * 说明：
 * - 本文件聚焦 LibraryHome 的“书库入口可达性”回归场景；
 * - 重点验证不同书籍状态下的导航行为与基础信息展示是否正确；
 * - 不覆盖动画与视觉细节（由组件快照/视觉回归在其他层验证）。
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  LibraryHome,
  type LibraryBookCardData
} from "@/components/library/library-home";

interface MockLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href    : string;
  children: React.ReactNode;
}

interface MockImageProps {
  alt      : string;
  src      : string;
  className: string | undefined;
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

// 使用轻量 mock 避免 next/image 在测试环境触发布局相关副作用。
vi.mock("next/image", () => ({
  default: ({
    alt,
    src,
    className
  }: MockImageProps) => (
    <span
      data-testid="mock-next-image"
      data-alt={alt}
      data-src={src}
      className={className}
    />
  )
}));

/**
 * 构造最小可用书籍数据：
 * - 每个用例只覆盖关心字段，其他字段使用稳定默认值；
 * - 默认值固定后，断言会更聚焦，避免无关字段引起测试噪声。
 */
function buildBook(partial: Partial<LibraryBookCardData>): LibraryBookCardData {
  return {
    id              : partial.id ?? "book-1",
    title           : partial.title ?? "儒林外史",
    author          : partial.author ?? "吴敬梓",
    dynasty         : partial.dynasty ?? "清",
    coverUrl        : partial.coverUrl ?? "/api/assets/books/book-1/cover.png",
    status          : partial.status ?? "PENDING",
    chapterCount    : partial.chapterCount ?? 10,
    personaCount    : partial.personaCount ?? 100,
    lastAnalyzedAt  : partial.lastAnalyzedAt ?? "2026-03-24T10:00:00.000Z",
    currentModel    : partial.currentModel ?? "DeepSeek V3",
    lastErrorSummary: partial.lastErrorSummary ?? null,
    createdAt       : partial.createdAt ?? "2026-03-24T08:00:00.000Z",
    updatedAt       : partial.updatedAt ?? "2026-03-24T10:00:00.000Z",
    sourceFile      : partial.sourceFile ?? {
      key : null,
      url : null,
      name: null,
      mime: null,
      size: null
    }
  };
}

describe("LibraryHome", () => {
  it("renders the empty state when there are no readable books", () => {
    // Arrange
    render(<LibraryHome books={[]} />);

    // Assert
    expect(screen.getByText("暂无可阅读书籍")).toBeInTheDocument();
    expect(screen.getByText((_, element) => (
      element?.tagName.toLowerCase() === "p"
      && element.textContent?.includes("请联系管理员在后台导入并解析书籍。")
    ))).toBeInTheDocument();
    expect(screen.queryByText("书库")).toBeNull();
  });

  it("allows navigation to graph when book is completed", () => {
    // Arrange: 构造“已完成”的书籍卡片。
    render(<LibraryHome books={[buildBook({ id: "book-completed", status: "COMPLETED" })]} />);

    // Act: 以无障碍名称查询进入图谱的链接。
    const graphLink = screen.getByRole("link", { name: "查看「儒林外史」人物图谱" });
    // Assert: 链接应指向该书对应的图谱页。
    expect(graphLink).toHaveAttribute("href", "/books/book-completed/graph");
  });

  it("does not render graph link for non-completed book", () => {
    // Arrange: 构造“处理中”书籍。
    render(<LibraryHome books={[buildBook({ status: "PROCESSING" })]} />);

    // Assert: 不应渲染图谱跳转入口，且应提示处理中状态。
    expect(screen.queryByRole("link", { name: "查看「儒林外史」人物图谱" })).toBeNull();
    expect(screen.getByText("解析中")).toBeInTheDocument();
  });

  it("displays book count and section header", () => {
    // Arrange: 传入两本书，验证书库头部统计是否与数据源一致。
    render(<LibraryHome books={[buildBook({ status: "COMPLETED" }), buildBook({ id: "book-2", status: "COMPLETED" })]} />);

    // Assert: 标题与数量文案都应可见。
    expect(screen.getByText("书库")).toBeInTheDocument();
    expect(screen.getByText("2 部典籍")).toBeInTheDocument();
  });
});
