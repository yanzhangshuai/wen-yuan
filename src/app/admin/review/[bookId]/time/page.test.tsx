import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_BOOK_ID = "22222222-2222-4222-8222-222222222222";

const personaTimeMatrixDto = {
  bookId  : BOOK_ID,
  personas: [{
    personaId                : "persona-1",
    displayName              : "诸葛亮",
    aliases                  : ["孔明"],
    primaryPersonaCandidateId: "candidate-1",
    personaCandidateIds      : ["candidate-1"],
    firstTimeSortKey         : 10,
    totalEventCount          : 2,
    totalRelationCount       : 1,
    totalTimeClaimCount      : 1
  }],
  timeGroups: [{
    timeType        : "NAMED_EVENT",
    label           : "事件节点",
    defaultCollapsed: false,
    slices          : [{
      timeKey           : "NAMED_EVENT::赤壁之战前::10::2::3",
      timeType          : "NAMED_EVENT",
      normalizedLabel   : "赤壁之战前",
      rawLabels         : ["赤壁之战前"],
      timeSortKey       : 10,
      chapterRangeStart : 2,
      chapterRangeEnd   : 3,
      linkedChapters    : [],
      sourceTimeClaimIds: ["time-claim-1"]
    }]
  }],
  cells      : [],
  generatedAt: "2026-04-22T08:00:00.000Z"
};

const allBooks = [
  { id: BOOK_ID, title: "三国演义", personaCount: 108 },
  { id: OTHER_BOOK_ID, title: "儒林外史", personaCount: 12 }
];

const hoisted = vi.hoisted(() => {
  const getPersonaChapterMatrixMock = vi.fn();
  const getRelationEditorViewMock = vi.fn();
  const getPersonaTimeMatrixMock = vi.fn();

  return {
    getBookByIdMock             : vi.fn(),
    listBooksMock               : vi.fn(),
    notFoundMock                : vi.fn(),
    getPersonaChapterMatrixMock,
    getRelationEditorViewMock,
    getPersonaTimeMatrixMock,
    createReviewQueryServiceMock: vi.fn(() => ({
      getPersonaChapterMatrix: getPersonaChapterMatrixMock,
      getRelationEditorView  : getRelationEditorViewMock,
      getPersonaTimeMatrix   : getPersonaTimeMatrixMock
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
 * 文件定位（人物 x 时间审核页 server component 单测）：
 * - 锁定 `/admin/review/[bookId]/time` 的首屏装配契约；
 * - 当前阶段只验证服务端取数和路由语义，不提前覆盖 Task 5 的客户端交互细节。
 */
describe("AdminBookTimeReviewPage", () => {
  beforeEach(() => {
    hoisted.getBookByIdMock.mockResolvedValue({ id: BOOK_ID, title: "三国演义" });
    hoisted.listBooksMock.mockResolvedValue(allBooks);
    hoisted.getPersonaTimeMatrixMock.mockResolvedValue(personaTimeMatrixDto);
    hoisted.getPersonaChapterMatrixMock.mockResolvedValue({
      bookId  : BOOK_ID,
      personas: [],
      chapters: [],
      cells   : []
    });
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
    hoisted.getPersonaTimeMatrixMock.mockReset();
    hoisted.createReviewQueryServiceMock.mockClear();
    vi.resetModules();
  });

  it("loads book, book switcher data, and forwards the initial persona-time matrix", async () => {
    hoisted.getPersonaChapterMatrixMock.mockResolvedValue({
      bookId  : BOOK_ID,
      personas: [{
        personaId              : "persona-1",
        displayName            : "诸葛亮",
        aliases                : ["孔明"],
        firstChapterNo         : 1,
        totalEventCount        : 5,
        totalRelationCount     : 2,
        totalConflictCount     : 0,
        personaCandidateIds    : ["pc-1"]
      }],
      chapters: [
        { chapterId: "chapter-1", chapterNo: 1, label: "第 1 回", title: "桃园结义" }
      ],
      cells: []
    });

    const { default: AdminBookTimeReviewPage } = await import("./page");

    const page = await AdminBookTimeReviewPage({
      params      : Promise.resolve({ bookId: BOOK_ID }),
      searchParams: Promise.resolve({
        personaId: "persona-1",
        timeLabel: "赤壁之战前"
      })
    } as never);

    expect(hoisted.getBookByIdMock).toHaveBeenCalledWith(BOOK_ID);
    expect(hoisted.listBooksMock).toHaveBeenCalledOnce();
    expect(hoisted.getPersonaTimeMatrixMock).toHaveBeenCalledWith({ bookId: BOOK_ID });
    expect(hoisted.getPersonaChapterMatrixMock).toHaveBeenCalledWith({ bookId: BOOK_ID });
    expect(hoisted.getRelationEditorViewMock).not.toHaveBeenCalled();

    const shell = findElementByProp(page, "mode", "time");
    expect(shell?.props.bookId).toBe(BOOK_ID);

    const renderMain = shell?.props.renderMain;
    expect(typeof renderMain).toBe("function");

    if (typeof renderMain === "function") {
      const mainContent = renderMain({
        selectedPersonaId: null,
        focusOnly        : false,
        onFocusOnlyChange: () => {}
      });
      const matrixEntry = findElementByProp(mainContent, "data-time-matrix-book-id", BOOK_ID);
      expect(matrixEntry?.props["data-persona-count"]).toBe(1);
      expect(matrixEntry?.props["data-time-group-count"]).toBe(1);
      expect(matrixEntry?.props["data-cell-count"]).toBe(0);
    }
  });

  it("calls notFound when book id does not resolve to a book", async () => {
    hoisted.getBookByIdMock.mockRejectedValueOnce(new Error("missing book"));
    const { default: AdminBookTimeReviewPage } = await import("./page");

    await expect(AdminBookTimeReviewPage({
      params: Promise.resolve({ bookId: BOOK_ID })
    })).rejects.toThrow("NEXT_NOT_FOUND");

    expect(hoisted.listBooksMock).not.toHaveBeenCalled();
    expect(hoisted.getPersonaTimeMatrixMock).not.toHaveBeenCalled();
  });

  it("bubbles projection read failures to the review error boundary without legacy fallback", async () => {
    hoisted.getPersonaTimeMatrixMock.mockRejectedValueOnce(new Error("time projection unavailable"));
    const { default: AdminBookTimeReviewPage } = await import("./page");

    await expect(AdminBookTimeReviewPage({
      params: Promise.resolve({ bookId: BOOK_ID })
    })).rejects.toThrow("time projection unavailable");

    expect(hoisted.notFoundMock).not.toHaveBeenCalled();
    expect(hoisted.getPersonaTimeMatrixMock).toHaveBeenCalledWith({ bookId: BOOK_ID });
    expect(hoisted.getRelationEditorViewMock).not.toHaveBeenCalled();
  });
});
