import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";

const hoisted = vi.hoisted(() => ({
  getBookByIdMock: vi.fn()
}));

vi.mock("@/server/modules/books/getBookById", () => ({
  getBookById: hoisted.getBookByIdMock
}));

vi.mock("@/app/admin/books/_components/book-row-actions", () => ({
  BookRowActions: () => <div data-testid="book-row-actions" />
}));

vi.mock("./_components/book-detail-tabs", () => ({
  BookDetailTabs: ({ bookId }: { bookId: string }) => (
    <div data-testid="book-detail-tabs" data-book-id={bookId} />
  )
}));

function findElementByProp(
  node: ReactNode,
  propName: string,
  propValue: unknown
): ReactElement<Record<string, unknown>> | null {
  const nodes = Children.toArray(node);

  for (const current of nodes) {
    if (!isValidElement<Record<string, unknown>>(current)) {
      continue;
    }

    if (current.props[propName] === propValue) {
      return current;
    }

    const childResult = findElementByProp(current.props.children as ReactNode, propName, propValue);
    if (childResult) {
      return childResult;
    }
  }

  return null;
}

/**
 * 文件定位（管理端书籍详情页入口切换测试）：
 * - 锁定 T20 对审核入口的切换，确保运营从书籍详情页进入新的 `/admin/review/:bookId`。
 * - 这里只验证服务端页面装配，不展开测试 tabs 或操作按钮内部实现。
 */
describe("BookDetailPage", () => {
  beforeEach(() => {
    hoisted.getBookByIdMock.mockResolvedValue({
      id              : BOOK_ID,
      title           : "儒林外史",
      status          : "COMPLETED",
      author          : "吴敬梓",
      dynasty         : "清",
      currentModel    : "gpt-5.4",
      lastArchitecture: "three-stage",
      chapterCount    : 56,
      personaCount    : 120,
      createdAt       : "2026-04-24T08:00:00.000Z",
      sourceFile      : {
        name: "rulinwaishi.txt",
        size: 4096
      },
      lastErrorSummary: null
    });
  });

  afterEach(() => {
    hoisted.getBookByIdMock.mockReset();
    vi.resetModules();
  });

  it("links the review action to the new admin review workspace instead of legacy review-center", async () => {
    const { default: BookDetailPage } = await import("./page");

    const page = await BookDetailPage({
      params: Promise.resolve({ id: BOOK_ID })
    });

    expect(findElementByProp(page, "href", `/admin/review/${BOOK_ID}`)).not.toBeNull();
    expect(findElementByProp(page, "href", `/admin/books/${BOOK_ID}/review-center`)).toBeNull();
  });
});
