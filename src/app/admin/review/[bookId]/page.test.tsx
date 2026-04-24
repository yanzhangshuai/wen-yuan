import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_BOOK_ID = "22222222-2222-4222-8222-222222222222";

const matrixDto = {
  bookId             : BOOK_ID,
  personas           : [],
  chapters           : [],
  cells              : [],
  relationTypeOptions: [],
  generatedAt        : "2026-04-21T00:00:00.000Z"
};

const allBooks = [
  { id: BOOK_ID, title: "儒林外史", personaCount: 12 },
  { id: OTHER_BOOK_ID, title: "三国演义", personaCount: 108 }
];

const hoisted = vi.hoisted(() => {
  const getPersonaChapterMatrixMock = vi.fn();
  const getRelationEditorViewMock = vi.fn();

  return {
    getBookByIdMock             : vi.fn(),
    listBooksMock               : vi.fn(),
    notFoundMock                : vi.fn(),
    getPersonaChapterMatrixMock,
    getRelationEditorViewMock,
    createReviewQueryServiceMock: vi.fn(() => ({
      getPersonaChapterMatrix: getPersonaChapterMatrixMock,
      getRelationEditorView  : getRelationEditorViewMock
    }))
  };
});

vi.mock("@/server/modules/books/getBookById", () => ({
  getBookById: hoisted.getBookByIdMock
}));

vi.mock("@/server/modules/books/listBooks", () => ({
  listBooks: hoisted.listBooksMock
}));

vi.mock("@/server/modules/review/evidence-review/review-query-service", () => ({
  createReviewQueryService: hoisted.createReviewQueryServiceMock
}));

vi.mock("next/navigation", () => ({
  notFound: hoisted.notFoundMock
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

    const childResult = findElementByProp(
      current.props.children as ReactNode,
      propName,
      propValue
    );
    if (childResult) {
      return childResult;
    }
  }

  return null;
}

/**
 * 文件定位（单书审核页 server component 单测）：
 * - 锁定 T13 页面入口切换：首屏加载矩阵 DTO，不再加载 legacy drafts/merge suggestions。
 * - 不渲染完整客户端 UI，只检查服务端装配的数据契约，避免提前测试 T13 后续组件细节。
 */
describe("AdminBookReviewPage", () => {
  beforeEach(() => {
    hoisted.getBookByIdMock.mockResolvedValue({ id: BOOK_ID, title: "儒林外史" });
    hoisted.listBooksMock.mockResolvedValue(allBooks);
    hoisted.getPersonaChapterMatrixMock.mockResolvedValue(matrixDto);
    hoisted.notFoundMock.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
  });

  afterEach(() => {
    hoisted.getBookByIdMock.mockReset();
    hoisted.listBooksMock.mockReset();
    hoisted.notFoundMock.mockReset();
    hoisted.getPersonaChapterMatrixMock.mockReset();
    hoisted.getRelationEditorViewMock.mockReset();
    hoisted.createReviewQueryServiceMock.mockClear();
    vi.resetModules();
  });

  it("loads book, book switcher data, and the initial persona-chapter matrix", async () => {
    const { default: AdminBookReviewPage } = await import("./page");

    const page = await AdminBookReviewPage({
      params: Promise.resolve({ bookId: BOOK_ID })
    });

    expect(hoisted.getBookByIdMock).toHaveBeenCalledWith(BOOK_ID);
    expect(hoisted.listBooksMock).toHaveBeenCalledOnce();
    expect(hoisted.getPersonaChapterMatrixMock).toHaveBeenCalledWith({ bookId: BOOK_ID });
    expect(hoisted.getRelationEditorViewMock).not.toHaveBeenCalled();

    const modeNav = findElementByProp(page, "activeMode", "matrix");
    expect(modeNav?.props.bookId).toBe(BOOK_ID);

    const matrixEntry = findElementByProp(page, "initialMatrix", matrixDto);
    expect(matrixEntry?.props.bookId).toBe(BOOK_ID);
    expect(matrixEntry?.props.bookTitle).toBe("儒林外史");
    expect(matrixEntry?.props.allBooks).toBe(allBooks);
    expect(matrixEntry?.props.initialMatrix).toBe(matrixDto);
  });

  it("forwards chapter deep-link search params as the initial matrix selection", async () => {
    const { default: AdminBookReviewPage } = await import("./page");

    const page = await AdminBookReviewPage({
      params      : Promise.resolve({ bookId: BOOK_ID }),
      searchParams: Promise.resolve({
        personaId: "persona-2",
        chapterId: "chapter-2"
      })
    } as never);

    const matrixEntry = findElementByProp(page, "initialMatrix", matrixDto);
    expect(matrixEntry?.props.initialSelectedCell).toEqual({
      personaId: "persona-2",
      chapterId: "chapter-2"
    });
  });

  it("calls notFound when book id does not resolve to a book", async () => {
    hoisted.getBookByIdMock.mockRejectedValueOnce(new Error("missing book"));
    const { default: AdminBookReviewPage } = await import("./page");

    await expect(AdminBookReviewPage({
      params: Promise.resolve({ bookId: BOOK_ID })
    })).rejects.toThrow("NEXT_NOT_FOUND");

    expect(hoisted.listBooksMock).not.toHaveBeenCalled();
    expect(hoisted.getPersonaChapterMatrixMock).not.toHaveBeenCalled();
  });

  it("bubbles projection read failures to the review error boundary without legacy fallback", async () => {
    hoisted.getPersonaChapterMatrixMock.mockRejectedValueOnce(new Error("projection unavailable"));
    const { default: AdminBookReviewPage } = await import("./page");

    await expect(AdminBookReviewPage({
      params: Promise.resolve({ bookId: BOOK_ID })
    })).rejects.toThrow("projection unavailable");

    expect(hoisted.notFoundMock).not.toHaveBeenCalled();
    expect(hoisted.getPersonaChapterMatrixMock).toHaveBeenCalledWith({ bookId: BOOK_ID });
    expect(hoisted.getRelationEditorViewMock).not.toHaveBeenCalled();
  });

  it("keeps metadata generation based on the current book title", async () => {
    const { generateMetadata } = await import("./page");

    await expect(generateMetadata({
      params: Promise.resolve({ bookId: BOOK_ID })
    })).resolves.toEqual({ title: "审核 · 儒林外史" });
  });
});
