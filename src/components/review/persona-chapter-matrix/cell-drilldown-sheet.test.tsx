/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PersonaChapterMatrixDto,
  ReviewClaimDetailRecord,
  ReviewClaimDetailResponse,
  ReviewClaimListItem
} from "@/lib/services/review-matrix";

import { CellDrilldownSheet } from "./cell-drilldown-sheet";

const BOOK_ID = "book-1";

const hoisted = vi.hoisted(() => ({
  fetchCellClaimsMock        : vi.fn(),
  fetchReviewClaimDetailMock : vi.fn(),
  createManualReviewClaimMock: vi.fn()
}));

vi.mock("@/lib/services/review-matrix", async () => {
  const actual = await vi.importActual("@/lib/services/review-matrix");

  return {
    ...actual,
    fetchCellClaims        : hoisted.fetchCellClaimsMock,
    fetchReviewClaimDetail : hoisted.fetchReviewClaimDetailMock,
    createManualReviewClaim: hoisted.createManualReviewClaimMock
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
        totalConflictCount       : 1
      }
    ],
    chapters: [
      {
        chapterId: "chapter-1",
        chapterNo: 1,
        title    : "学道登场",
        label    : "第 1 回"
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
        conflictCount     : 1,
        reviewStateSummary: {
          PENDING: { NONE: 1 }
        },
        latestUpdatedAt: "2026-04-21T10:30:00.000Z"
      }
    ],
    ...overrides
  };
}

function buildClaimListItem(
  overrides: Partial<ReviewClaimListItem> = {}
): ReviewClaimListItem {
  return {
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
    evidenceSpanIds    : ["evidence-1"],
    ...overrides
  };
}

function buildClaimDetailRecord(
  overrides: Partial<ReviewClaimDetailRecord> = {}
): ReviewClaimDetailRecord {
  return {
    id                 : "claim-event-1",
    claimId            : "claim-event-1",
    claimKind          : "EVENT",
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
    evidenceSpanIds    : ["evidence-1"],
    derivedFromClaimId : null,
    ...overrides
  };
}

function buildDetail(
  overrides: Partial<ReviewClaimDetailResponse> = {}
): ReviewClaimDetailResponse {
  return {
    claim            : buildClaimDetailRecord(),
    evidence         : [],
    basisClaim       : null,
    projectionSummary: {
      personaChapterFacts: [],
      personaTimeFacts   : [],
      relationshipEdges  : [],
      timelineEvents     : []
    },
    auditHistory: [],
    ...overrides
  };
}

/**
 * 文件定位（T13 Task 8 钻取抽屉单测）：
 * - 锁定 claim-first 钻取层的数据装配边界，避免把页面状态机和明细拉取逻辑耦死。
 * - 测试重点是 reviewer 的可见行为：懒加载、claim 分类、证据查看、空态提示和失败重试。
 */
describe("CellDrilldownSheet", () => {
  beforeEach(() => {
    hoisted.fetchCellClaimsMock.mockReset();
    hoisted.fetchReviewClaimDetailMock.mockReset();
    hoisted.createManualReviewClaimMock.mockReset();
  });

  it("loads cell claims lazily and labels event, relation, and conflict items clearly", async () => {
    hoisted.fetchCellClaimsMock.mockResolvedValueOnce({
      items: [
        buildClaimListItem(),
        buildClaimListItem({
          claimKind      : "RELATION",
          claimId        : "claim-relation-1",
          relationTypeKey: "mentor_of",
          evidenceSpanIds: ["evidence-2"],
          reviewState    : "ACCEPTED",
          conflictState  : "NONE",
          timeLabel      : null
        }),
        buildClaimListItem({
          claimKind      : "CONFLICT_FLAG",
          claimId        : "claim-conflict-1",
          reviewState    : "CONFLICTED",
          conflictState  : "ACTIVE",
          timeLabel      : null,
          relationTypeKey: null
        })
      ],
      total: 3
    });

    render(
      <CellDrilldownSheet
        open
        matrix={buildMatrix()}
        selection={{
          personaId: "persona-1",
          chapterId: "chapter-1"
        }}
        onOpenChange={vi.fn()}
      />
    );

    expect(
      screen.getByRole("heading", { level: 2, name: "范进 · 第 1 回" })
    ).toBeInTheDocument();

    await waitFor(() => {
      expect(hoisted.fetchCellClaimsMock).toHaveBeenCalledWith({
        bookId   : BOOK_ID,
        personaId: "persona-1",
        chapterId: "chapter-1",
        limit    : 50
      });
    });

    expect(screen.getByText("事迹")).toBeInTheDocument();
    expect(screen.getByText("关系")).toBeInTheDocument();
    expect(screen.getByText("冲突")).toBeInTheDocument();
  });

  it("fetches claim detail after the reviewer selects a claim and shows evidence with AI basis", async () => {
    hoisted.fetchCellClaimsMock.mockResolvedValueOnce({
      items: [buildClaimListItem()],
      total: 1
    });
    hoisted.fetchReviewClaimDetailMock.mockResolvedValueOnce(
      buildDetail({
        evidence: [
          {
            id                 : "evidence-1",
            chapterId          : "chapter-1",
            startOffset        : 12,
            endOffset          : 28,
            quotedText         : "范进叩首称谢，众人都道喜。",
            normalizedText     : "范进叩首称谢，众人都道喜。",
            speakerHint        : "张乡绅",
            narrativeRegionType: "DIALOGUE_CONTENT",
            createdAt          : "2026-04-21T09:00:00.000Z"
          }
        ],
        basisClaim: buildClaimDetailRecord({
          id             : "claim-basis-1",
          claimId        : "claim-basis-1",
          claimKind      : "RELATION",
          relationTypeKey: "mentor_of",
          reviewState    : "ACCEPTED"
        })
      })
    );

    render(
      <CellDrilldownSheet
        open
        matrix={buildMatrix()}
        selection={{
          personaId: "persona-1",
          chapterId: "chapter-1"
        }}
        onOpenChange={vi.fn()}
      />
    );

    const claimButton = await screen.findByRole("button", { name: "查看事迹" });
    fireEvent.click(claimButton);

    await waitFor(() => {
      expect(hoisted.fetchReviewClaimDetailMock).toHaveBeenCalledWith({
        bookId   : BOOK_ID,
        claimKind: "EVENT",
        claimId  : "claim-event-1"
      });
    });

    expect(screen.getByText("范进叩首称谢，众人都道喜。")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AI 提取依据" })).toBeInTheDocument();
    expect(screen.getByText("关系类型：mentor_of")).toBeInTheDocument();
  });

  it("shows a create prompt instead of a raw empty table when the selected cell has no claims", async () => {
    hoisted.fetchCellClaimsMock.mockResolvedValueOnce({
      items: [],
      total: 0
    });

    render(
      <CellDrilldownSheet
        open
        matrix={buildMatrix({
          cells: []
        })}
        selection={{
          personaId: "persona-1",
          chapterId: "chapter-1"
        }}
        onOpenChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("当前单元格还没有可审核记录")).toBeInTheDocument();
    });
    expect(screen.getByText("可在下一步补录事迹、关系或冲突说明。")).toBeInTheDocument();
  });

  it("shows retry after the claim list request fails and reloads successfully", async () => {
    hoisted.fetchCellClaimsMock
      .mockRejectedValueOnce(new Error("claim list failed"))
      .mockResolvedValueOnce({
        items: [buildClaimListItem()],
        total: 1
      });

    render(
      <CellDrilldownSheet
        open
        matrix={buildMatrix()}
        selection={{
          personaId: "persona-1",
          chapterId: "chapter-1"
        }}
        onOpenChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("单元格加载失败")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "重试" }));

    await waitFor(() => {
      expect(hoisted.fetchCellClaimsMock).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByText("事迹")).toBeInTheDocument();
  });

  it("refreshes cell claims and matrix summary after a manual event is created", async () => {
    const onMutationSuccess = vi.fn();
    hoisted.fetchCellClaimsMock
      .mockResolvedValueOnce({
        items: [],
        total: 0
      })
      .mockResolvedValueOnce({
        items: [buildClaimListItem({
          claimId    : "manual-event-1",
          reviewState: "ACCEPTED",
          source     : "MANUAL"
        })],
        total: 1
      });
    hoisted.createManualReviewClaimMock.mockResolvedValueOnce({
      id       : "manual-event-1",
      claimKind: "EVENT"
    });

    render(
      <CellDrilldownSheet
        open
        matrix={buildMatrix({ cells: [] })}
        selection={{
          personaId: "persona-1",
          chapterId: "chapter-1"
        }}
        onOpenChange={vi.fn()}
        onMutationSuccess={onMutationSuccess}
      />
    );

    await screen.findByText("当前单元格还没有可审核记录");

    fireEvent.click(screen.getByRole("button", { name: "新增事迹" }));
    fireEvent.change(screen.getByRole("textbox", { name: "运行 ID（临时必填）" }), {
      target: { value: "33333333-3333-4333-8333-333333333333" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "证据 Span IDs（临时必填）" }), {
      target: { value: "44444444-4444-4444-8444-444444444444" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "事迹谓语" }), {
      target: { value: "中举" }
    });
    fireEvent.click(screen.getByRole("button", { name: "创建事迹" }));

    await waitFor(() => {
      expect(hoisted.fetchCellClaimsMock).toHaveBeenCalledTimes(2);
    });
    expect(onMutationSuccess).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("button", { name: "查看事迹" })).toBeInTheDocument();
  });
});
