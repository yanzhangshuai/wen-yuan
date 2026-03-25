/** @vitest-environment jsdom */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ImportBookPage from "@/app/books/import/page";

interface MockLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href    : string;
  children: React.ReactNode;
}

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: MockLinkProps) => (
    <a href={href} {...props}>
      {children}
    </a>
  )
}));

describe("ImportBookPage", () => {
  it("renders mvp import flow and core controls", () => {
    render(<ImportBookPage />);

    expect(screen.getByRole("heading", { name: "导入书籍" })).toBeInTheDocument();
    expect(screen.getByText("1 上传")).toBeInTheDocument();
    expect(screen.getByText("2 元数据")).toBeInTheDocument();
    expect(screen.getByText("3 章节预览")).toBeInTheDocument();
    expect(screen.getByText("4 启动解析")).toBeInTheDocument();

    const fileInput = screen.getByLabelText("书籍文件（仅 .txt）");
    expect(fileInput).toHaveAttribute("type", "file");
    expect(fileInput).toHaveAttribute("accept", ".txt,text/plain");

    expect(screen.getByRole("button", { name: "创建书籍" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "生成章节预览" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "启动解析" })).toBeInTheDocument();
  });

  it("shows chapter range inputs when scope is chapter range", () => {
    render(<ImportBookPage />);

    const scopeSelect = screen.getByLabelText("解析范围");
    fireEvent.change(scopeSelect, { target: { value: "CHAPTER_RANGE" } });

    expect(screen.getByLabelText("起始章节")).toBeInTheDocument();
    expect(screen.getByLabelText("结束章节")).toBeInTheDocument();
  });
});
