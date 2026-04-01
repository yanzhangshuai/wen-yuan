/** @vitest-environment jsdom */

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
  it("allows navigation to graph when book is completed", () => {
    render(<LibraryHome books={[buildBook({ id: "book-completed", status: "COMPLETED" })]} />);

    const graphLink = screen.getByRole("link", { name: "查看「儒林外史」人物图谱" });
    expect(graphLink).toHaveAttribute("href", "/books/book-completed/graph");
  });

  it("does not render graph link for non-completed book", () => {
    render(<LibraryHome books={[buildBook({ status: "PROCESSING" })]} />);

    expect(screen.queryByRole("link", { name: "查看「儒林外史」人物图谱" })).toBeNull();
    expect(screen.getByText("解析中")).toBeInTheDocument();
  });

  it("displays book count and section header", () => {
    render(<LibraryHome books={[buildBook({ status: "COMPLETED" }), buildBook({ id: "book-2", status: "COMPLETED" })]} />);

    expect(screen.getByText("书库")).toBeInTheDocument();
    expect(screen.getByText("2 部典藏")).toBeInTheDocument();
  });
});
