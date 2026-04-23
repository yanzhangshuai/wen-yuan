/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PersonaTimeMatrixDto,
  ReviewClaimDetailRecord,
  ReviewClaimDetailResponse,
  ReviewClaimListItem
} from "@/lib/services/review-time-matrix";
import * as reviewTimeMatrix from "@/lib/services/review-time-matrix";

const BOOK_ID = "book-1";

function buildMatrix(overrides?: Partial<PersonaTimeMatrixDto>): PersonaTimeMatrixDto {
  return {
    bookId     : BOOK_ID,
    generatedAt: "2026-04-23T10:30:00.000Z",
    personas   : [
      {
        personaId                : "persona-1",
        displayName              : "诸葛亮",
        aliases                  : ["孔明"],
        primaryPersonaCandidateId: "candidate-1",
        personaCandidateIds      : ["candidate-1"],
        firstTimeSortKey         : 42,
        totalEventCount          : 3,
        totalRelationCount       : 1,
        totalTimeClaimCount      : 2
      }
    ],
    timeGroups: [
      {
        timeType        : "NAMED_EVENT",
        label           : "事件节点",
        defaultCollapsed: false,
        slices          : [
          {
            timeKey          : "event-1",
            timeType         : "NAMED_EVENT",
            normalizedLabel  : "赤壁之战前",
            rawLabels        : ["赤壁之前", "建安十三年冬"],
            timeSortKey      : 42,
            chapterRangeStart: 42,
            chapterRangeEnd  : 43,
            linkedChapters   : [
              {
                chapterId: "chapter-42",
                chapterNo: 42,
                label    : "第42回 赤壁战前"
              },
              {
                chapterId: "chapter-43",
                chapterNo: 43,
                label    : "第43回 孔明借东风"
              }
            ],
            sourceTimeClaimIds: ["claim-time-1"]
          }
        ]
      }
    ],
    cells: [
      {
        bookId            : BOOK_ID,
        personaId         : "persona-1",
        timeKey           : "event-1",
        normalizedLabel   : "赤壁之战前",
        eventCount        : 2,
        relationCount     : 1,
        timeClaimCount    : 1,
        sourceTimeClaimIds: ["claim-time-1"],
        latestUpdatedAt   : "2026-04-23T10:30:00.000Z"
      }
    ],
    ...overrides
  };
}

function buildClaim(
  overrides: Partial<ReviewClaimListItem> = {}
): ReviewClaimListItem {
  return {
    claimKind          : "EVENT",
    claimId            : "claim-event-1",
    bookId             : BOOK_ID,
    chapterId          : "chapter-42",
    reviewState        : "PENDING",
    source             : "AI",
    conflictState      : "NONE",
    createdAt          : "2026-04-23T10:00:00.000Z",
    updatedAt          : "2026-04-23T10:05:00.000Z",
    personaCandidateIds: ["candidate-1"],
    personaIds         : ["persona-1"],
    timeLabel          : "赤壁之战前",
    relationTypeKey    : null,
    evidenceSpanIds    : ["evidence-1"],
    ...overrides
  };
}

function buildClaimDetailRecord(
  overrides: Partial<ReviewClaimDetailRecord> = {}
): ReviewClaimDetailRecord {
  const baseRecord: ReviewClaimDetailRecord = {
    id                 : "claim-event-1",
    claimId            : "claim-event-1",
    claimKind          : "EVENT",
    bookId             : BOOK_ID,
    chapterId          : "chapter-42",
    reviewState        : "PENDING",
    source             : "AI",
    conflictState      : "NONE",
    createdAt          : "2026-04-23T10:00:00.000Z",
    updatedAt          : "2026-04-23T10:05:00.000Z",
    personaCandidateIds: ["candidate-1"],
    personaIds         : ["persona-1"],
    timeLabel          : "赤壁之战前",
    relationTypeKey    : null,
    evidenceSpanIds    : ["evidence-1", "evidence-2"],
    runId              : "run-1",
    confidence         : 0.91,
    supersedesClaimId  : null,
    derivedFromClaimId : null
  };

  return {
    ...baseRecord,
    ...overrides,
    runId            : overrides.runId ?? baseRecord.runId,
    confidence       : overrides.confidence ?? baseRecord.confidence,
    supersedesClaimId: overrides.supersedesClaimId ?? baseRecord.supersedesClaimId
  };
}

function buildDetail(
  overrides: Partial<ReviewClaimDetailResponse> = {}
): ReviewClaimDetailResponse {
  return {
    claim   : buildClaimDetailRecord(),
    evidence: [
      {
        id                 : "evidence-1",
        chapterId          : "chapter-42",
        chapterLabel       : "第42回",
        startOffset        : 12,
        endOffset          : 28,
        quotedText         : "曹军连船，首尾相接。",
        normalizedText     : "曹军连船，首尾相接。",
        speakerHint        : "叙事",
        narrativeRegionType: "NARRATIVE",
        createdAt          : "2026-04-23T09:00:00.000Z"
      },
      {
        id                 : "evidence-2",
        chapterId          : "chapter-43",
        chapterLabel       : "第43回",
        startOffset        : 36,
        endOffset          : 52,
        quotedText         : "孔明舟师已动，只待东风。",
        normalizedText     : "孔明舟师已动，只待东风。",
        speakerHint        : "叙事",
        narrativeRegionType: "NARRATIVE",
        createdAt          : "2026-04-23T09:05:00.000Z"
      }
    ],
    basisClaim: buildClaimDetailRecord({
      id             : "claim-time-1",
      claimId        : "claim-time-1",
      claimKind      : "TIME",
      reviewState    : "ACCEPTED",
      relationTypeKey: null,
      evidenceSpanIds: ["evidence-1"]
    }),
    aiSummary: {
      basisClaimId  : "claim-time-1",
      basisClaimKind: "TIME",
      source        : "AI",
      runId         : "run-1",
      confidence    : 0.91,
      summaryLines  : ["时间归一化：赤壁之战前"],
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

async function renderTimeCellDrilldownSheet({
  open = true,
  matrix = buildMatrix(),
  selection = { personaId: "persona-1", timeKey: "event-1" },
  onOpenChange = vi.fn()
}: {
  open?        : boolean;
  matrix?      : PersonaTimeMatrixDto;
  selection?   : { personaId: string; timeKey: string } | null;
  onOpenChange?: (open: boolean) => void;
}) {
  const { TimeCellDrilldownSheet } = await import("./time-cell-drilldown-sheet");

  return render(
    <TimeCellDrilldownSheet
      open={open}
      matrix={matrix}
      selection={selection}
      onOpenChange={onOpenChange}
    />
  );
}

/**
 * 文件定位（T15 Task 6 时间单元格钻取抽屉单测）：
 * - 锁定时间矩阵对 T12/T16 共享契约的复用边界，避免再分叉一套 detail/evidence 面板。
 * - 测试聚焦 reviewer 行为：懒加载 claim/detail、显示原始时间标签、保留证据选中态。
 */
describe("TimeCellDrilldownSheet", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("loads time-cell claims lazily and surfaces time-specific labels plus linked chapter metadata", async () => {
    const fetchTimeCellClaimsSpy = vi
      .spyOn(reviewTimeMatrix, "fetchTimeCellClaims")
      .mockResolvedValueOnce({
        items: [
          buildClaim({ claimKind: "TIME", claimId: "claim-time-1" }),
          buildClaim({ claimKind: "EVENT", claimId: "claim-event-1" }),
          buildClaim({
            claimKind      : "RELATION",
            claimId        : "claim-relation-1",
            relationTypeKey: "ally_of",
            timeLabel      : null
          }),
          buildClaim({
            claimKind      : "CONFLICT_FLAG",
            claimId        : "claim-conflict-1",
            reviewState    : "CONFLICTED",
            conflictState  : "ACTIVE",
            relationTypeKey: null,
            timeLabel      : null
          })
        ],
        total: 4
      });
    const fetchReviewClaimDetailSpy = vi.spyOn(reviewTimeMatrix, "fetchReviewClaimDetail");
    const matrix = buildMatrix();
    const onOpenChange = vi.fn();
    const { TimeCellDrilldownSheet } = await import("./time-cell-drilldown-sheet");
    const { rerender } = render(
      <TimeCellDrilldownSheet
        open={false}
        matrix={matrix}
        selection={{ personaId: "persona-1", timeKey: "event-1" }}
        onOpenChange={onOpenChange}
      />
    );

    expect(fetchTimeCellClaimsSpy).not.toHaveBeenCalled();

    rerender(
      <TimeCellDrilldownSheet
        open
        matrix={matrix}
        selection={{ personaId: "persona-1", timeKey: "event-1" }}
        onOpenChange={onOpenChange}
      />
    );

    await waitFor(() => {
      expect(fetchTimeCellClaimsSpy).toHaveBeenCalledWith({
        bookId   : BOOK_ID,
        personaId: "persona-1",
        timeLabel: "赤壁之战前",
        limit    : 50
      });
    });

    expect(fetchReviewClaimDetailSpy).not.toHaveBeenCalled();
    expect(screen.getByText("诸葛亮 · 赤壁之战前")).toBeInTheDocument();
    expect(screen.getByText("赤壁之前")).toBeInTheDocument();
    expect(screen.getByText("建安十三年冬")).toBeInTheDocument();
    expect(screen.getByText("第42回 赤壁战前")).toBeInTheDocument();
    expect(screen.getByText("第43回 孔明借东风")).toBeInTheDocument();
    expect(screen.getByText("时间")).toBeInTheDocument();
    expect(screen.getByText("事迹")).toBeInTheDocument();
    expect(screen.getByText("关系")).toBeInTheDocument();
    expect(screen.getByText("冲突")).toBeInTheDocument();
  }, 15_000);

  it("renders linked chapters as deep links back to the selected chapter cell", async () => {
    vi
      .spyOn(reviewTimeMatrix, "fetchTimeCellClaims")
      .mockResolvedValueOnce({
        items: [buildClaim({ claimKind: "TIME", claimId: "claim-time-1" })],
        total: 1
      });

    await renderTimeCellDrilldownSheet({});

    const firstChapterLink = await screen.findByRole("link", { name: "第42回 赤壁战前" });
    expect(firstChapterLink).toHaveAttribute(
      "href",
      "/admin/review/book-1?personaId=persona-1&chapterId=chapter-42"
    );
    expect(
      screen.getByRole("link", { name: "第43回 孔明借东风" })
    ).toHaveAttribute(
      "href",
      "/admin/review/book-1?personaId=persona-1&chapterId=chapter-43"
    );
  });

  it("loads claim detail only after selection, renders the shared panel, and keeps evidence selection wired through", async () => {
    const fetchTimeCellClaimsSpy = vi
      .spyOn(reviewTimeMatrix, "fetchTimeCellClaims")
      .mockResolvedValueOnce({
        items: [
          buildClaim({
            claimKind: "EVENT",
            claimId  : "claim-event-1"
          })
        ],
        total: 1
      });
    const fetchReviewClaimDetailSpy = vi
      .spyOn(reviewTimeMatrix, "fetchReviewClaimDetail")
      .mockResolvedValueOnce(buildDetail());

    await renderTimeCellDrilldownSheet({});

    await waitFor(() => {
      expect(fetchTimeCellClaimsSpy).toHaveBeenCalledWith({
        bookId   : BOOK_ID,
        personaId: "persona-1",
        timeLabel: "赤壁之战前",
        limit    : 50
      });
    });

    expect(fetchReviewClaimDetailSpy).not.toHaveBeenCalled();

    const eventClaimButton = screen.getByText("事迹").closest("button");
    expect(eventClaimButton).not.toBeNull();

    if (eventClaimButton === null) {
      throw new Error("Expected the event claim row to render as a button.");
    }

    fireEvent.click(eventClaimButton);

    await waitFor(() => {
      expect(fetchReviewClaimDetailSpy).toHaveBeenCalledWith({
        bookId   : BOOK_ID,
        claimKind: "EVENT",
        claimId  : "claim-event-1"
      });
    });

    expect(screen.getByTestId("review-claim-detail-panel")).toBeInTheDocument();
    expect(screen.getByText("原文证据")).toBeInTheDocument();
    expect(screen.getByText("AI 提取依据")).toBeInTheDocument();

    const secondEvidenceButton = screen.getByRole("button", {
      name: /孔明舟师已动，只待东风。/
    });

    expect(secondEvidenceButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(secondEvidenceButton);

    expect(secondEvidenceButton).toHaveAttribute("aria-pressed", "true");
  });
});
