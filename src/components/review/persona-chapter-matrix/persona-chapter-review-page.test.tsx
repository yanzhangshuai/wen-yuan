/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PersonaChapterMatrixDto } from "@/lib/services/review-matrix";

import { PersonaChapterReviewPage } from "./persona-chapter-review-page";

const BOOK_ID = "book-1";

const allBooks = [
  { id: BOOK_ID, title: "儒林外史", personaCount: 2 },
  { id: "book-2", title: "三国演义", personaCount: 3 }
];

const hoisted = vi.hoisted(() => ({
  fetchPersonaChapterMatrixMock: vi.fn(),
  fetchCellClaimsMock          : vi.fn(),
  fetchReviewClaimDetailMock   : vi.fn(),
  submitReviewClaimActionMock  : vi.fn()
}));

vi.mock("@/lib/services/review-matrix", async () => {
  const actual = await vi.importActual("@/lib/services/review-matrix");

  return {
    ...actual,
    fetchPersonaChapterMatrix: hoisted.fetchPersonaChapterMatrixMock,
    fetchCellClaims          : hoisted.fetchCellClaimsMock,
    fetchReviewClaimDetail   : hoisted.fetchReviewClaimDetailMock,
    submitReviewClaimAction  : hoisted.submitReviewClaimActionMock
  };
});

function buildMatrix(overrides?: Partial<PersonaChapterMatrixDto>): PersonaChapterMatrixDto {
  return {
    bookId             : BOOK_ID,
    generatedAt        : "2026-04-21T10:30:00.000Z",
    relationTypeOptions: [],
    personas           : [
      {
        personaId                : "persona-1",
        displayName              : "范进",
        aliases                  : ["范举人"],
        primaryPersonaCandidateId: "candidate-1",
        personaCandidateIds      : ["candidate-1"],
        firstChapterNo           : 1,
        totalEventCount          : 2,
        totalRelationCount       : 1,
        totalConflictCount       : 0
      },
      {
        personaId                : "persona-2",
        displayName              : "周进",
        aliases                  : ["周老爷"],
        primaryPersonaCandidateId: "candidate-2",
        personaCandidateIds      : ["candidate-2"],
        firstChapterNo           : 2,
        totalEventCount          : 1,
        totalRelationCount       : 0,
        totalConflictCount       : 1
      }
    ],
    chapters: [
      {
        chapterId: "chapter-1",
        chapterNo: 1,
        title    : "学道登场",
        label    : "第 1 回"
      },
      {
        chapterId: "chapter-2",
        chapterNo: 2,
        title    : "中举发迹",
        label    : "第 2 回"
      },
      {
        chapterId: "chapter-3",
        chapterNo: 3,
        title    : "范进赴宴",
        label    : "第 3 回"
      }
    ],
    cells: [
      {
        bookId            : BOOK_ID,
        personaId         : "persona-1",
        chapterId         : "chapter-1",
        chapterNo         : 1,
        eventCount        : 2,
        relationCount     : 1,
        conflictCount     : 0,
        reviewStateSummary: {
          PENDING: { NONE: 1 }
        },
        latestUpdatedAt: "2026-04-21T10:30:00.000Z"
      },
      {
        bookId            : BOOK_ID,
        personaId         : "persona-2",
        chapterId         : "chapter-2",
        chapterNo         : 2,
        eventCount        : 1,
        relationCount     : 0,
        conflictCount     : 1,
        reviewStateSummary: {
          CONFLICTED: { ACTIVE: 1 }
        },
        latestUpdatedAt: "2026-04-21T11:00:00.000Z"
      }
    ],
    ...overrides
  };
}

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error("deferred resolve used before initialization");
  };
  let reject: (reason?: unknown) => void = () => {
    throw new Error("deferred reject used before initialization");
  };

  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });

  return {
    promise,
    resolve,
    reject
  };
}

function buildClaimListItem(overrides: Record<string, unknown> = {}) {
  return {
    claimKind          : "EVENT",
    claimId            : "claim-event-1",
    bookId             : BOOK_ID,
    chapterId          : "chapter-2",
    reviewState        : "CONFLICTED",
    source             : "AI",
    conflictState      : "ACTIVE",
    createdAt          : "2026-04-21T10:00:00.000Z",
    updatedAt          : "2026-04-21T10:05:00.000Z",
    personaCandidateIds: ["candidate-2"],
    personaIds         : ["persona-2"],
    timeLabel          : "发榜之后",
    relationTypeKey    : null,
    evidenceSpanIds    : ["evidence-1"],
    ...overrides
  };
}

function buildClaimDetailRecord(overrides: Record<string, unknown> = {}) {
  return {
    ...buildClaimListItem(),
    id                       : "claim-event-1",
    derivedFromClaimId       : "basis-claim-1",
    runId                    : "run-1",
    confidence               : 0.88,
    subjectMentionId         : null,
    subjectPersonaCandidateId: "candidate-2",
    predicate                : "受提携",
    objectText               : "赴考",
    objectPersonaCandidateId : null,
    locationText             : "省城",
    timeHintId               : null,
    eventCategory            : "EXAM",
    narrativeLens            : "SELF",
    ...overrides
  };
}

function buildClaimDetail(overrides: Record<string, unknown> = {}) {
  return {
    claim   : buildClaimDetailRecord(),
    evidence: [
      {
        id                 : "evidence-1",
        chapterId          : "chapter-2",
        chapterLabel       : "第 2 回",
        startOffset        : 10,
        endOffset          : 18,
        quotedText         : "周进在此回提携范进",
        normalizedText     : "周进在此回提携范进",
        speakerHint        : null,
        narrativeRegionType: "NARRATIVE",
        createdAt          : "2026-04-21T10:01:00.000Z"
      }
    ],
    basisClaim: buildClaimDetailRecord({
      claimId      : "basis-claim-1",
      id           : "basis-claim-1",
      reviewState  : "PENDING",
      conflictState: "NONE",
      source       : "AI",
      chapterId    : "chapter-2"
    }),
    aiSummary: {
      basisClaimId  : "basis-claim-1",
      basisClaimKind: "EVENT",
      source        : "AI",
      runId         : "run-1",
      confidence    : 0.88,
      summaryLines  : ["事迹：周进在此回提携范进"],
      rawOutput     : null
    },
    projectionSummary: {
      personaChapterFacts: [],
      personaTimeFacts   : [],
      relationshipEdges  : [],
      timelineEvents     : []
    },
    auditHistory: [],
    versionDiff : null,
    ...overrides
  };
}

function buildLargeMatrix(): PersonaChapterMatrixDto {
  const personas = Array.from({ length: 50 }, (_, index) => ({
    personaId                : `persona-${index + 1}`,
    displayName              : `人物 ${index + 1}`,
    aliases                  : [],
    primaryPersonaCandidateId: `candidate-${index + 1}`,
    personaCandidateIds      : [`candidate-${index + 1}`],
    firstChapterNo           : 1,
    totalEventCount          : index % 3,
    totalRelationCount       : index % 2,
    totalConflictCount       : index % 5 === 0 ? 1 : 0
  }));
  const chapters = Array.from({ length: 100 }, (_, index) => ({
    chapterId: `chapter-${index + 1}`,
    chapterNo: index + 1,
    title    : `章节 ${index + 1}`,
    label    : `第 ${index + 1} 回`
  }));
  const cells = chapters.flatMap((chapter, chapterIndex) => (
    personas.map((persona, personaIndex) => ({
      bookId            : BOOK_ID,
      personaId         : persona.personaId,
      chapterId         : chapter.chapterId,
      chapterNo         : chapter.chapterNo,
      eventCount        : (chapterIndex + personaIndex) % 2,
      relationCount     : (chapterIndex + personaIndex) % 3 === 0 ? 1 : 0,
      conflictCount     : 0,
      reviewStateSummary: {
        PENDING: { NONE: 1 }
      },
      latestUpdatedAt: "2026-04-21T10:30:00.000Z"
    }))
  ));

  return {
    bookId             : BOOK_ID,
    generatedAt        : "2026-04-21T10:30:00.000Z",
    relationTypeOptions: [],
    personas,
    chapters,
    cells
  };
}

/**
 * 文件定位（T13 Task 7 页面级测试）：
 * - 锁定人物 x 章节矩阵入口页的筛选/跳转/状态切换，不提前验证 Task 8 钻取细节。
 * - 测试重点是“页面状态编排是否正确”，而不是 MatrixGrid 的底层渲染细节。
 */
describe("PersonaChapterReviewPage", () => {
  beforeEach(() => {
    hoisted.fetchPersonaChapterMatrixMock.mockReset();
    hoisted.fetchCellClaimsMock.mockReset();
    hoisted.fetchReviewClaimDetailMock.mockReset();
    hoisted.submitReviewClaimActionMock.mockReset();
  });

  it("renders the book title, matrix counts, and initial matrix content", () => {
    render(
      <PersonaChapterReviewPage
        bookId={BOOK_ID}
        bookTitle="儒林外史"
        allBooks={allBooks}
        initialMatrix={buildMatrix()}
      />
    );

    expect(screen.getByRole("heading", { level: 1, name: "儒林外史" })).toBeInTheDocument();
    expect(screen.getByText("2 名人物列")).toBeInTheDocument();
    expect(screen.getByText("3 个章节行")).toBeInTheDocument();
    expect(screen.getByText("2 个事实单元格")).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /范进/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /周进/ })).toBeInTheDocument();
  });

  // TODO(4.4): re-enable after wiring persona filtering
  it.skip("narrows visible persona columns locally when the persona search text changes", () => {
    render(
      <PersonaChapterReviewPage
        bookId={BOOK_ID}
        bookTitle="儒林外史"
        allBooks={allBooks}
        initialMatrix={buildMatrix()}
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: "搜索人物" }), {
      target: { value: "范" }
    });

    expect(screen.getByRole("columnheader", { name: /范进/ })).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: /周进/ })).not.toBeInTheDocument();
    expect(hoisted.fetchPersonaChapterMatrixMock).not.toHaveBeenCalled();
  });

  it("refetches the matrix when the review state filter changes", async () => {
    hoisted.fetchPersonaChapterMatrixMock.mockResolvedValueOnce(
      buildMatrix({
        personas: [buildMatrix().personas[0]],
        cells   : [buildMatrix().cells[0]]
      })
    );

    render(
      <PersonaChapterReviewPage
        bookId={BOOK_ID}
        bookTitle="儒林外史"
        allBooks={allBooks}
        initialMatrix={buildMatrix()}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: "审核状态" }), {
      target: { value: "PENDING" }
    });

    await waitFor(() => {
      expect(hoisted.fetchPersonaChapterMatrixMock).toHaveBeenCalledWith({
        bookId      : BOOK_ID,
        reviewStates: ["PENDING"]
      });
    });
    expect(screen.queryByRole("columnheader", { name: /周进/ })).not.toBeInTheDocument();
  });

  it("refetches the matrix when the conflict filter changes", async () => {
    hoisted.fetchPersonaChapterMatrixMock.mockResolvedValueOnce(
      buildMatrix({
        personas: [buildMatrix().personas[1]],
        cells   : [buildMatrix().cells[1]]
      })
    );

    render(
      <PersonaChapterReviewPage
        bookId={BOOK_ID}
        bookTitle="儒林外史"
        allBooks={allBooks}
        initialMatrix={buildMatrix()}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: "冲突状态" }), {
      target: { value: "ACTIVE" }
    });

    await waitFor(() => {
      expect(hoisted.fetchPersonaChapterMatrixMock).toHaveBeenCalledWith({
        bookId       : BOOK_ID,
        conflictState: "ACTIVE"
      });
    });
    expect(screen.queryByRole("columnheader", { name: /范进/ })).not.toBeInTheDocument();
  });

  it("selects the target chapter row when the chapter jump changes", () => {
    render(
      <PersonaChapterReviewPage
        bookId={BOOK_ID}
        bookTitle="儒林外史"
        allBooks={allBooks}
        initialMatrix={buildMatrix()}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: "跳转章节" }), {
      target: { value: "chapter-2" }
    });

    expect(
      screen.getByRole("button", { name: "第 2 回 · 周进" })
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.queryByRole("heading", { level: 2, name: "周进 · 第 2 回" })
    ).not.toBeInTheDocument();
  });

  it("honors an initial selected cell and keeps it stable after reload-style rerenders", () => {
    const initialSelectedCell = {
      personaId: "persona-2",
      chapterId: "chapter-2"
    };
    const { rerender } = render(
      <PersonaChapterReviewPage
        bookId={BOOK_ID}
        bookTitle="儒林外史"
        allBooks={allBooks}
        initialMatrix={buildMatrix()}
        initialSelectedCell={initialSelectedCell}
      />
    );

    expect(
      screen.getByRole("button", { name: "第 2 回 · 周进" })
    ).toHaveAttribute("aria-pressed", "true");

    rerender(
      <PersonaChapterReviewPage
        bookId={BOOK_ID}
        bookTitle="儒林外史"
        allBooks={allBooks}
        initialMatrix={buildMatrix({
          generatedAt: "2026-04-21T12:00:00.000Z"
        })}
        initialSelectedCell={initialSelectedCell}
      />
    );

    expect(
      screen.getByRole("button", { name: "第 2 回 · 周进" })
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("opens the cell drill-down sheet only when the reviewer clicks a matrix cell", async () => {
    hoisted.fetchCellClaimsMock.mockResolvedValueOnce({
      items: [
        {
          claimKind          : "EVENT",
          claimId            : "claim-event-1",
          bookId             : BOOK_ID,
          chapterId          : "chapter-1",
          reviewState        : "PENDING",
          source             : "AI",
          conflictState      : "NONE",
          createdAt          : "2026-04-21T10:00:00.000Z",
          updatedAt          : "2026-04-21T10:05:00.000Z",
          personaCandidateIds: ["candidate-1"],
          personaIds         : ["persona-1"],
          timeLabel          : "乡试之后",
          relationTypeKey    : null,
          evidenceSpanIds    : ["evidence-1"]
        }
      ],
      total: 1
    });

    render(
      <PersonaChapterReviewPage
        bookId={BOOK_ID}
        bookTitle="儒林外史"
        allBooks={allBooks}
        initialMatrix={buildMatrix()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "第 1 回 · 范进" }));

    await waitFor(() => {
      expect(hoisted.fetchCellClaimsMock).toHaveBeenCalledWith({
        bookId   : BOOK_ID,
        personaId: "persona-1",
        chapterId: "chapter-1",
        limit    : 50
      });
    });
    expect(
      screen.getByRole("heading", { level: 2, name: "范进 · 第 1 回" })
    ).toBeInTheDocument();
  });

  // TODO(4.4): re-enable after wiring persona filtering
  it.skip("resets local and remote filters back to the initial query", async () => {
    hoisted.fetchPersonaChapterMatrixMock
      .mockResolvedValueOnce(
        buildMatrix({
          personas: [buildMatrix().personas[0]],
          cells   : [buildMatrix().cells[0]]
        })
      )
      .mockResolvedValueOnce(buildMatrix());

    render(
      <PersonaChapterReviewPage
        bookId={BOOK_ID}
        bookTitle="儒林外史"
        allBooks={allBooks}
        initialMatrix={buildMatrix()}
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: "搜索人物" }), {
      target: { value: "范" }
    });
    fireEvent.change(screen.getByRole("combobox", { name: "审核状态" }), {
      target: { value: "PENDING" }
    });

    await waitFor(() => {
      expect(hoisted.fetchPersonaChapterMatrixMock).toHaveBeenNthCalledWith(1, {
        bookId      : BOOK_ID,
        reviewStates: ["PENDING"]
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "重置筛选" }));

    await waitFor(() => {
      expect(hoisted.fetchPersonaChapterMatrixMock).toHaveBeenNthCalledWith(2, {
        bookId: BOOK_ID
      });
    });

    expect(screen.getByRole("textbox", { name: "搜索人物" })).toHaveValue("");
    expect(screen.getByRole("columnheader", { name: /范进/ })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: /周进/ })).toBeInTheDocument();
  });

  it("shows an explicit loading state while the matrix refetch is pending", async () => {
    const deferred = createDeferred<PersonaChapterMatrixDto>();
    hoisted.fetchPersonaChapterMatrixMock.mockReturnValueOnce(deferred.promise);

    render(
      <PersonaChapterReviewPage
        bookId={BOOK_ID}
        bookTitle="儒林外史"
        allBooks={allBooks}
        initialMatrix={buildMatrix()}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: "审核状态" }), {
      target: { value: "PENDING" }
    });

    expect(screen.getByRole("status")).toHaveTextContent("矩阵刷新中...");

    deferred.resolve(buildMatrix({
      personas: [buildMatrix().personas[0]],
      cells   : [buildMatrix().cells[0]]
    }));

    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  it("shows an explicit error state when matrix refetch fails", async () => {
    hoisted.fetchPersonaChapterMatrixMock.mockRejectedValueOnce(new Error("网络错误"));

    render(
      <PersonaChapterReviewPage
        bookId={BOOK_ID}
        bookTitle="儒林外史"
        allBooks={allBooks}
        initialMatrix={buildMatrix()}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: "审核状态" }), {
      target: { value: "PENDING" }
    });

    await waitFor(() => {
      expect(screen.getByText("矩阵加载失败")).toBeInTheDocument();
    });
    expect(screen.getByText("网络错误")).toBeInTheDocument();
  });

  it("shows an explicit empty state when the refetched matrix contains no visible personas", async () => {
    hoisted.fetchPersonaChapterMatrixMock.mockResolvedValueOnce(
      buildMatrix({
        personas: [],
        cells   : []
      })
    );

    render(
      <PersonaChapterReviewPage
        bookId={BOOK_ID}
        bookTitle="儒林外史"
        allBooks={allBooks}
        initialMatrix={buildMatrix()}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: "审核状态" }), {
      target: { value: "REJECTED" }
    });

    await waitFor(() => {
      expect(screen.getByText("当前筛选下暂无人物章节矩阵")).toBeInTheDocument();
    });
  });

  /**
   * 文件定位（T13 Task 10 集成流程验收）：
   * - 覆盖 reviewer 从矩阵筛冲突、进入抽屉、查看证据到执行暂缓动作的完整路径；
   * - 锁定 mutation 之后必须先回刷当前 cell claims，再回刷矩阵摘要。
   */
  it("supports the conflict-to-detail review flow and refetches matrix summary after defer", async () => {
    hoisted.fetchPersonaChapterMatrixMock
      .mockResolvedValueOnce(
        buildMatrix({
          personas: [buildMatrix().personas[1]],
          cells   : [buildMatrix().cells[1]]
        })
      )
      .mockResolvedValueOnce(
        buildMatrix({
          personas: [buildMatrix().personas[1]],
          cells   : [
            {
              ...buildMatrix().cells[1],
              reviewStateSummary: {
                DEFERRED: { ACTIVE: 1 }
              }
            }
          ]
        })
      );
    hoisted.fetchCellClaimsMock
      .mockResolvedValueOnce({
        items: [buildClaimListItem()],
        total: 1
      })
      .mockResolvedValueOnce({
        items: [
          buildClaimListItem({
            reviewState: "DEFERRED"
          })
        ],
        total: 1
      });
    hoisted.fetchReviewClaimDetailMock.mockResolvedValueOnce(buildClaimDetail());
    hoisted.submitReviewClaimActionMock.mockResolvedValueOnce(undefined);

    render(
      <PersonaChapterReviewPage
        bookId={BOOK_ID}
        bookTitle="儒林外史"
        allBooks={allBooks}
        initialMatrix={buildMatrix()}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: "冲突状态" }), {
      target: { value: "ACTIVE" }
    });

    await waitFor(() => {
      expect(hoisted.fetchPersonaChapterMatrixMock).toHaveBeenNthCalledWith(1, {
        bookId       : BOOK_ID,
        conflictState: "ACTIVE"
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "第 2 回 · 周进" }));

    await waitFor(() => {
      expect(hoisted.fetchCellClaimsMock).toHaveBeenNthCalledWith(1, {
        bookId   : BOOK_ID,
        personaId: "persona-2",
        chapterId: "chapter-2",
        limit    : 50
      });
    });

    fireEvent.click(await screen.findByRole("button", { name: "查看事迹" }));

    await waitFor(() => {
      expect(hoisted.fetchReviewClaimDetailMock).toHaveBeenCalledWith({
        bookId   : BOOK_ID,
        claimKind: "EVENT",
        claimId  : "claim-event-1"
      });
    });

    expect(await screen.findByText("原文证据")).toBeInTheDocument();
    expect(screen.getByText("AI 提取依据")).toBeInTheDocument();
    expect(screen.getByText("周进在此回提携范进")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "审核备注（可选）" }), {
      target: { value: "需要等待更多旁证" }
    });
    fireEvent.click(screen.getByRole("button", { name: "暂缓处理" }));

    await waitFor(() => {
      expect(hoisted.submitReviewClaimActionMock).toHaveBeenCalledWith({
        bookId   : BOOK_ID,
        claimKind: "EVENT",
        claimId  : "claim-event-1",
        action   : "DEFER",
        note     : "需要等待更多旁证"
      });
    });

    await waitFor(() => {
      expect(hoisted.fetchCellClaimsMock).toHaveBeenNthCalledWith(2, {
        bookId   : BOOK_ID,
        personaId: "persona-2",
        chapterId: "chapter-2",
        limit    : 50
      });
    });
    await waitFor(() => {
      expect(hoisted.fetchPersonaChapterMatrixMock).toHaveBeenNthCalledWith(2, {
        bookId       : BOOK_ID,
        conflictState: "ACTIVE"
      });
    });
  });

  /**
   * 文件定位（T13 Task 10 大矩阵可用性验收）：
   * - 锁定 50 x 100 大矩阵不会一次性把 5000 个单元格全部渲染进 DOM；
   * - 同时验证本地窗口化滚动后仍能访问远端章节/人物单元格，确保 reviewer 可继续审查。
   */
  it("keeps a large matrix windowed and can reveal distant cells after scrolling", async () => {
    const { container } = render(
      <PersonaChapterReviewPage
        bookId={BOOK_ID}
        bookTitle="儒林外史"
        allBooks={allBooks}
        initialMatrix={buildLargeMatrix()}
      />
    );

    const gridScroller = container.querySelector(".matrix-grid");
    expect(gridScroller).not.toBeNull();
    expect(container.querySelectorAll(".matrix-cell").length).toBeLessThan(200);
    expect(
      screen.queryByRole("button", { name: "第 50 回 · 人物 20" })
    ).not.toBeInTheDocument();

    fireEvent.scroll(gridScroller as HTMLElement, {
      target: {
        scrollTop : 96 * 49,
        scrollLeft: 224 * 19
      }
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "第 50 回 · 人物 20" })
      ).toBeInTheDocument();
    });
    expect(container.querySelectorAll(".matrix-cell").length).toBeLessThan(200);
  });
});
