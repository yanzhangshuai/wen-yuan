/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PersonaTimeMatrixDto } from "@/lib/services/review-time-matrix";

const BOOK_ID = "book-1";

const allBooks = [
  { id: BOOK_ID, title: "三国演义", personaCount: 2 },
  { id: "book-2", title: "儒林外史", personaCount: 3 }
];

const hoisted = vi.hoisted(() => ({
  fetchPersonaTimeMatrixMock: vi.fn()
}));

vi.mock("@/lib/services/review-time-matrix", async () => {
  const actual = await vi.importActual("@/lib/services/review-time-matrix");

  return {
    ...actual,
    fetchPersonaTimeMatrix: hoisted.fetchPersonaTimeMatrixMock
  };
});

function buildMatrix(overrides?: Partial<PersonaTimeMatrixDto>): PersonaTimeMatrixDto {
  return {
    bookId     : BOOK_ID,
    generatedAt: "2026-04-22T09:00:00.000Z",
    personas   : [
      {
        personaId                : "persona-1",
        displayName              : "诸葛亮",
        aliases                  : ["孔明"],
        primaryPersonaCandidateId: "candidate-1",
        personaCandidateIds      : ["candidate-1"],
        firstTimeSortKey         : 10,
        totalEventCount          : 3,
        totalRelationCount       : 1,
        totalTimeClaimCount      : 2
      },
      {
        personaId                : "persona-2",
        displayName              : "周瑜",
        aliases                  : ["公瑾"],
        primaryPersonaCandidateId: "candidate-2",
        personaCandidateIds      : ["candidate-2"],
        firstTimeSortKey         : 12,
        totalEventCount          : 1,
        totalRelationCount       : 2,
        totalTimeClaimCount      : 2
      }
    ],
    timeGroups: [
      {
        timeType        : "CHAPTER_ORDER",
        label           : "章节顺序",
        defaultCollapsed: false,
        slices          : [{
          timeKey          : "chapter-10",
          timeType         : "CHAPTER_ORDER",
          normalizedLabel  : "第十回",
          rawLabels        : ["第十回"],
          timeSortKey      : 10,
          chapterRangeStart: 10,
          chapterRangeEnd  : 10,
          linkedChapters   : [{
            chapterId: "chapter-10",
            chapterNo: 10,
            label    : "第10回 舌战群儒"
          }],
          sourceTimeClaimIds: ["time-claim-1"]
        }]
      },
      {
        timeType        : "RELATIVE_PHASE",
        label           : "相对阶段",
        defaultCollapsed: true,
        slices          : []
      },
      {
        timeType        : "NAMED_EVENT",
        label           : "事件节点",
        defaultCollapsed: false,
        slices          : [
          {
            timeKey          : "event-1",
            timeType         : "NAMED_EVENT",
            normalizedLabel  : "赤壁之战前",
            rawLabels        : ["赤壁之战以前"],
            timeSortKey      : 20,
            chapterRangeStart: 42,
            chapterRangeEnd  : 43,
            linkedChapters   : [{
              chapterId: "chapter-42",
              chapterNo: 42,
              label    : "第42回 赤壁战前"
            }],
            sourceTimeClaimIds: ["time-claim-2"]
          },
          {
            timeKey          : "event-2",
            timeType         : "NAMED_EVENT",
            normalizedLabel  : "赤壁之战后",
            rawLabels        : ["赤壁既罢"],
            timeSortKey      : 21,
            chapterRangeStart: 44,
            chapterRangeEnd  : 45,
            linkedChapters   : [{
              chapterId: "chapter-44",
              chapterNo: 44,
              label    : "第44回 赤壁战后"
            }],
            sourceTimeClaimIds: ["time-claim-3"]
          }
        ]
      },
      {
        timeType        : "HISTORICAL_YEAR",
        label           : "历史年份",
        defaultCollapsed: true,
        slices          : []
      },
      {
        timeType        : "BATTLE_PHASE",
        label           : "战役阶段",
        defaultCollapsed: true,
        slices          : []
      },
      {
        timeType        : "UNCERTAIN",
        label           : "未定时间",
        defaultCollapsed: false,
        slices          : [{
          timeKey           : "uncertain-1",
          timeType          : "UNCERTAIN",
          normalizedLabel   : "约在建安年间",
          rawLabels         : ["约在建安年间"],
          timeSortKey       : 99,
          chapterRangeStart : null,
          chapterRangeEnd   : null,
          linkedChapters    : [],
          sourceTimeClaimIds: ["time-claim-4"]
        }]
      }
    ],
    cells: [
      {
        bookId            : BOOK_ID,
        personaId         : "persona-1",
        timeKey           : "chapter-10",
        normalizedLabel   : "第十回",
        eventCount        : 1,
        relationCount     : 0,
        timeClaimCount    : 1,
        sourceTimeClaimIds: ["time-claim-1"],
        latestUpdatedAt   : "2026-04-22T09:00:00.000Z"
      },
      {
        bookId            : BOOK_ID,
        personaId         : "persona-1",
        timeKey           : "event-1",
        normalizedLabel   : "赤壁之战前",
        eventCount        : 2,
        relationCount     : 1,
        timeClaimCount    : 1,
        sourceTimeClaimIds: ["time-claim-2"],
        latestUpdatedAt   : "2026-04-22T09:10:00.000Z"
      },
      {
        bookId            : BOOK_ID,
        personaId         : "persona-1",
        timeKey           : "event-2",
        normalizedLabel   : "赤壁之战后",
        eventCount        : 1,
        relationCount     : 0,
        timeClaimCount    : 1,
        sourceTimeClaimIds: ["time-claim-3"],
        latestUpdatedAt   : "2026-04-22T09:11:00.000Z"
      },
      {
        bookId            : BOOK_ID,
        personaId         : "persona-2",
        timeKey           : "event-1",
        normalizedLabel   : "赤壁之战前",
        eventCount        : 0,
        relationCount     : 2,
        timeClaimCount    : 1,
        sourceTimeClaimIds: ["time-claim-2"],
        latestUpdatedAt   : "2026-04-22T09:12:00.000Z"
      },
      {
        bookId            : BOOK_ID,
        personaId         : "persona-2",
        timeKey           : "uncertain-1",
        normalizedLabel   : "约在建安年间",
        eventCount        : 1,
        relationCount     : 0,
        timeClaimCount    : 1,
        sourceTimeClaimIds: ["time-claim-4"],
        latestUpdatedAt   : "2026-04-22T09:15:00.000Z"
      }
    ],
    ...overrides
  };
}

function buildEmptyMatrix(): PersonaTimeMatrixDto {
  return buildMatrix({
    personas  : [],
    cells     : [],
    timeGroups: [
      { timeType: "CHAPTER_ORDER", label: "章节顺序", defaultCollapsed: true, slices: [] },
      { timeType: "RELATIVE_PHASE", label: "相对阶段", defaultCollapsed: true, slices: [] },
      { timeType: "NAMED_EVENT", label: "事件节点", defaultCollapsed: true, slices: [] },
      { timeType: "HISTORICAL_YEAR", label: "历史年份", defaultCollapsed: true, slices: [] },
      { timeType: "BATTLE_PHASE", label: "战役阶段", defaultCollapsed: true, slices: [] },
      { timeType: "UNCERTAIN", label: "未定时间", defaultCollapsed: true, slices: [] }
    ]
  });
}

async function renderPage(options?: {
  initialMatrix?    : PersonaTimeMatrixDto;
  bookTitle?        : string;
  selectedPersonaId?: string | null;
  focusOnly?        : boolean;
  onFocusOnlyChange?: (next: boolean) => void;
}) {
  const { PersonaTimeReviewPage } = await import("./persona-time-review-page");

  return render(
    <PersonaTimeReviewPage
      bookId={BOOK_ID}
      bookTitle={options?.bookTitle ?? "三国演义"}
      allBooks={allBooks}
      initialMatrix={options?.initialMatrix ?? buildMatrix()}
      selectedPersonaId={options?.selectedPersonaId ?? null}
      focusOnly={options?.focusOnly ?? false}
      onFocusOnlyChange={options?.onFocusOnlyChange}
    />
  );
}

/**
 * 文件定位（T15 Task 5 页面级测试）：
 * - 锁定人物 x 时间审核页的状态编排，不提前覆盖 Task 6 钻取抽屉与共享 detail panel；
 * - 重点是初始 DTO 展示、本地筛选、显式刷新、稳定 timeKey 选中，以及空/错状态。
 */
describe("PersonaTimeReviewPage", () => {
  beforeEach(() => {
    hoisted.fetchPersonaTimeMatrixMock.mockReset();
  });

  it("renders the initial server dto summary, persona columns, and visible time slices", async () => {
    await renderPage();

    expect(screen.getByRole("heading", { level: 1, name: "三国演义" })).toBeInTheDocument();
    expect(screen.getByText("2 名人物列")).toBeInTheDocument();
    expect(screen.getByText("4 个时间片行")).toBeInTheDocument();
    expect(screen.getByText("5 个事实单元格")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /诸葛亮/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /周瑜/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "赤壁之战前 · 诸葛亮" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "约在建安年间 · 周瑜" })).toBeInTheDocument();
  }, 15_000);

  it("honors an initial selected time cell and keeps it stable after reload-style rerenders", async () => {
    const initialSelectedCell = {
      personaId: "persona-2",
      timeKey  : "event-1"
    };
    const { PersonaTimeReviewPage } = await import("./persona-time-review-page");
    const { rerender } = render(
      <PersonaTimeReviewPage
        bookId={BOOK_ID}
        bookTitle="三国演义"
        allBooks={allBooks}
        initialMatrix={buildMatrix()}
        selectedPersonaId={null}
        focusOnly={false}
        initialSelectedCell={initialSelectedCell}
      />
    );

    expect(
      screen.getByRole("button", { name: "赤壁之战前 · 周瑜" })
    ).toHaveAttribute("aria-pressed", "true");

    rerender(
      <PersonaTimeReviewPage
        bookId={BOOK_ID}
        bookTitle="三国演义"
        allBooks={allBooks}
        initialMatrix={buildMatrix({
          generatedAt: "2026-04-22T12:00:00.000Z"
        })}
        selectedPersonaId={null}
        focusOnly={false}
        initialSelectedCell={initialSelectedCell}
      />
    );

    expect(
      screen.getByRole("button", { name: "赤壁之战前 · 周瑜" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("narrows visible persona columns locally when the persona filter changes", async () => {
    await renderPage();

    fireEvent.click(screen.getByRole("combobox", { name: "人物筛选" }));
    fireEvent.click(screen.getByRole("option", { name: "诸葛亮" }));

    await waitFor(() => {
      expect(screen.getByRole("columnheader", { name: /诸葛亮/ })).toBeInTheDocument();
    });
    expect(screen.queryByRole("columnheader", { name: /周瑜/ })).not.toBeInTheDocument();
    expect(hoisted.fetchPersonaTimeMatrixMock).not.toHaveBeenCalled();
  });

  it("filters visible time slices locally by time type without refetching the matrix", async () => {
    await renderPage();

    fireEvent.click(screen.getByRole("checkbox", { name: "章节顺序" }));

    await waitFor(() => {
      expect(screen.queryByText("第十回")).not.toBeInTheDocument();
    });
    expect(screen.getByText("赤壁之战前")).toBeInTheDocument();
    expect(hoisted.fetchPersonaTimeMatrixMock).not.toHaveBeenCalled();
  });

  it("filters visible time slices locally by label keyword without refetching the matrix", async () => {
    await renderPage();

    fireEvent.change(screen.getByRole("textbox", { name: "时间标签搜索" }), {
      target: { value: "建安" }
    });

    await waitFor(() => {
      expect(screen.getByText("约在建安年间")).toBeInTheDocument();
    });
    expect(screen.queryByText("赤壁之战前")).not.toBeInTheDocument();
    expect(hoisted.fetchPersonaTimeMatrixMock).not.toHaveBeenCalled();
  });

  it("refetches the matrix with current remote filters and preserves the selected time cell by stable timeKey", async () => {
    hoisted.fetchPersonaTimeMatrixMock.mockResolvedValueOnce(buildMatrix({
      cells: [
        {
          bookId            : BOOK_ID,
          personaId         : "persona-1",
          timeKey           : "event-1",
          normalizedLabel   : "赤壁之战前",
          eventCount        : 3,
          relationCount     : 1,
          timeClaimCount    : 1,
          sourceTimeClaimIds: ["time-claim-2"],
          latestUpdatedAt   : "2026-04-22T09:30:00.000Z"
        },
        {
          bookId            : BOOK_ID,
          personaId         : "persona-1",
          timeKey           : "event-2",
          normalizedLabel   : "赤壁之战后",
          eventCount        : 2,
          relationCount     : 0,
          timeClaimCount    : 1,
          sourceTimeClaimIds: ["time-claim-3"],
          latestUpdatedAt   : "2026-04-22T09:31:00.000Z"
        }
      ],
      personas  : [buildMatrix().personas[0]],
      timeGroups: [
        { ...buildMatrix().timeGroups[0], slices: [] },
        buildMatrix().timeGroups[1],
        buildMatrix().timeGroups[2],
        buildMatrix().timeGroups[3],
        buildMatrix().timeGroups[4],
        { ...buildMatrix().timeGroups[5], slices: [] }
      ]
    }));

    await renderPage();

    fireEvent.click(screen.getByRole("combobox", { name: "人物筛选" }));
    fireEvent.click(screen.getByRole("option", { name: "诸葛亮" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "章节顺序" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "未定时间" }));
    fireEvent.change(screen.getByRole("textbox", { name: "时间标签搜索" }), {
      target: { value: "赤壁" }
    });

    const selectedCell = screen.getByRole("button", { name: "赤壁之战前 · 诸葛亮" });
    fireEvent.click(selectedCell);
    expect(selectedCell).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "刷新矩阵" }));

    await waitFor(() => {
      expect(hoisted.fetchPersonaTimeMatrixMock).toHaveBeenCalledWith({
        bookId   : BOOK_ID,
        personaId: "persona-1",
        timeTypes: ["NAMED_EVENT"]
      });
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "赤壁之战前 · 诸葛亮" })
      ).toHaveAttribute("aria-pressed", "true");
    });
  });

  it("shows an explicit empty state when the current matrix has no visible persona-time cells", async () => {
    await renderPage({
      initialMatrix: buildEmptyMatrix()
    });

    expect(screen.getByText("当前筛选下暂无人物时间矩阵")).toBeInTheDocument();
  });

  it("shows an explicit error state when matrix refresh fails", async () => {
    hoisted.fetchPersonaTimeMatrixMock.mockRejectedValueOnce(new Error("网络错误"));

    await renderPage();

    fireEvent.click(screen.getByRole("button", { name: "刷新矩阵" }));

    await waitFor(() => {
      expect(screen.getByText("矩阵加载失败")).toBeInTheDocument();
    });
    expect(screen.getByText("网络错误")).toBeInTheDocument();
  });

  it("highlights the selected persona column when selectedPersonaId is set and focusOnly is false", async () => {
    await renderPage({
      selectedPersonaId: "persona-1",
      focusOnly        : false
    });

    const highlightedColumn = screen.getByRole("columnheader", { name: /诸葛亮/ });
    expect(highlightedColumn).toHaveAttribute("data-highlighted", "true");
    expect(highlightedColumn).toHaveClass("bg-primary/10");

    const otherColumn = screen.getByRole("columnheader", { name: /周瑜/ });
    expect(otherColumn).not.toHaveAttribute("data-highlighted");
  });

  it("filters to single persona when selectedPersonaId is set and focusOnly is true", async () => {
    await renderPage({
      selectedPersonaId: "persona-1",
      focusOnly        : true
    });

    expect(screen.getByRole("columnheader", { name: /诸葛亮/ })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /周瑜/ })).not.toBeInTheDocument();
    expect(screen.getByText("1 名人物列")).toBeInTheDocument();
    expect(screen.getByText("3 个事实单元格")).toBeInTheDocument();

    const highlightedColumn = screen.queryByRole("columnheader", { name: /诸葛亮/ });
    expect(highlightedColumn).not.toHaveAttribute("data-highlighted");
  });

  it("shows all personas when focusOnly is false", async () => {
    await renderPage({
      selectedPersonaId: "persona-1",
      focusOnly        : false
    });

    expect(screen.getByRole("columnheader", { name: /诸葛亮/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /周瑜/ })).toBeInTheDocument();
    expect(screen.getByText("2 名人物列")).toBeInTheDocument();
    expect(screen.getByText("5 个事实单元格")).toBeInTheDocument();
  });
});
