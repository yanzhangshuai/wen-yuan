import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_BOOK_ID = "22222222-2222-4222-8222-222222222222";

const relationEditorDto = {
  bookId        : BOOK_ID,
  personaOptions: [
    { personaId: "persona-1", displayName: "范进", aliases: ["范举人"] },
    { personaId: "persona-2", displayName: "周进", aliases: ["周老爷"] }
  ],
  relationTypeOptions: [
    {
      relationTypeKey   : "teacher_of",
      label             : "师生",
      direction         : "OUTGOING",
      relationTypeSource: "PRESET",
      aliasLabels       : ["授业"],
      systemPreset      : true
    }
  ],
  pairSummaries: [
    {
      pairKey           : "persona-1::persona-2",
      leftPersonaId     : "persona-1",
      rightPersonaId    : "persona-2",
      leftPersonaName   : "范进",
      rightPersonaName  : "周进",
      totalClaims       : 2,
      activeClaims      : 1,
      latestUpdatedAt   : "2026-04-21T10:30:00.000Z",
      relationTypeKeys  : ["teacher_of"],
      reviewStateSummary: { PENDING: 1, ACCEPTED: 1 },
      warningFlags      : {
        directionConflict: false,
        intervalConflict : true
      }
    }
  ],
  selectedPair: null,
  generatedAt : "2026-04-21T10:30:00.000Z"
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
    listAdminDraftsMock         : vi.fn(),
    listMergeSuggestionsMock    : vi.fn(),
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

vi.mock("@/server/modules/review/listDrafts", () => ({
  listAdminDrafts: hoisted.listAdminDraftsMock
}));

vi.mock("@/server/modules/review/mergeSuggestions", () => ({
  listMergeSuggestions: hoisted.listMergeSuggestionsMock
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
 * 文件定位（关系审核页 server component 单测）：
 * - 锁定 T14 `/relations` 页面只加载 relation editor 首屏 DTO；
 * - 保证它复用审核书籍切换壳层，并继续隔离 legacy drafts/merge suggestions。
 */
describe("AdminBookRelationReviewPage", () => {
  beforeEach(() => {
    hoisted.getBookByIdMock.mockResolvedValue({ id: BOOK_ID, title: "儒林外史" });
    hoisted.listBooksMock.mockResolvedValue(allBooks);
    hoisted.getRelationEditorViewMock.mockResolvedValue(relationEditorDto);
    hoisted.listAdminDraftsMock.mockResolvedValue({ summary: {}, personas: [] });
    hoisted.listMergeSuggestionsMock.mockResolvedValue([]);
    hoisted.notFoundMock.mockImplementation(() => {
      throw new Error("NEXT_NOT_FOUND");
    });
  });

  afterEach(() => {
    hoisted.getBookByIdMock.mockReset();
    hoisted.listBooksMock.mockReset();
    hoisted.listAdminDraftsMock.mockReset();
    hoisted.listMergeSuggestionsMock.mockReset();
    hoisted.notFoundMock.mockReset();
    hoisted.getPersonaChapterMatrixMock.mockReset();
    hoisted.getRelationEditorViewMock.mockReset();
    hoisted.createReviewQueryServiceMock.mockClear();
    vi.resetModules();
  });

  it("loads book, book switcher data, and the initial relation editor view", async () => {
    const { default: AdminBookRelationReviewPage } = await import("./page");

    const page = await AdminBookRelationReviewPage({
      params: Promise.resolve({ bookId: BOOK_ID })
    });

    expect(hoisted.getBookByIdMock).toHaveBeenCalledWith(BOOK_ID);
    expect(hoisted.listBooksMock).toHaveBeenCalledOnce();
    expect(hoisted.getRelationEditorViewMock).toHaveBeenCalledWith({ bookId: BOOK_ID });
    expect(hoisted.getPersonaChapterMatrixMock).not.toHaveBeenCalled();
    expect(hoisted.listAdminDraftsMock).not.toHaveBeenCalled();
    expect(hoisted.listMergeSuggestionsMock).not.toHaveBeenCalled();

    const modeNav = findElementByProp(page, "activeMode", "relations");
    expect(modeNav?.props.bookId).toBe(BOOK_ID);

    const relationSummary = findElementByProp(page, "data-relation-editor-book-id", BOOK_ID);
    expect(relationSummary?.props["data-pair-count"]).toBe(1);
    expect(relationSummary?.props["data-persona-count"]).toBe(2);
    expect(relationSummary?.props["data-relation-type-count"]).toBe(1);
  });

  it("calls notFound when book id does not resolve to a book", async () => {
    hoisted.getBookByIdMock.mockRejectedValueOnce(new Error("missing book"));
    const { default: AdminBookRelationReviewPage } = await import("./page");

    await expect(AdminBookRelationReviewPage({
      params: Promise.resolve({ bookId: BOOK_ID })
    })).rejects.toThrow("NEXT_NOT_FOUND");

    expect(hoisted.listBooksMock).not.toHaveBeenCalled();
    expect(hoisted.getRelationEditorViewMock).not.toHaveBeenCalled();
  });
});
