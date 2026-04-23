/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PersonaChapterRelationTypeOptionDto } from "@/lib/services/review-matrix";
import type {
  ReviewClaimDetailRecord,
  ReviewClaimDetailResponse,
  ReviewClaimListItem
} from "@/lib/services/review-time-matrix";
import type * as reviewTimeMatrix from "@/lib/services/review-time-matrix";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "12121212-1212-4212-8212-121212121212";
const TIME_CLAIM_ID = "13131313-1313-4313-8313-131313131313";
const EVENT_CLAIM_ID = "14141414-1414-4414-8414-141414141414";
const RELATION_CLAIM_ID = "15151515-1515-4515-8515-151515151515";
const RUN_ID = "16161616-1616-4616-8616-161616161616";
const EVIDENCE_ID_1 = "17171717-1717-4717-8717-171717171717";
const EVIDENCE_ID_2 = "18181818-1818-4818-8818-181818181818";
const SOURCE_CANDIDATE_ID = "19191919-1919-4919-8919-191919191919";
const TARGET_CANDIDATE_ID = "20202020-2020-4020-8020-202020202020";

const hoisted = vi.hoisted(() => ({
  submitReviewClaimActionMock: vi.fn(),
  chapterClaimActionPanelMock: vi.fn()
}));

vi.mock("@/lib/services/review-time-matrix", async () => {
  const actual = await vi.importActual<typeof reviewTimeMatrix>("@/lib/services/review-time-matrix");

  return {
    ...actual,
    submitReviewClaimAction: hoisted.submitReviewClaimActionMock
  };
});

vi.mock("@/components/review/persona-chapter-matrix/claim-action-panel", () => ({
  ClaimActionPanel: (props: unknown) => {
    hoisted.chapterClaimActionPanelMock(props);

    const claimKind = readClaimKind(props);
    return <div data-testid="chapter-claim-action-panel">{claimKind}</div>;
  }
}));

interface MockClaimPanelProps {
  claim?: {
    claimKind?: string;
  };
}

function readClaimKind(props: unknown): string {
  if (typeof props !== "object" || props === null) {
    return "UNKNOWN";
  }

  const candidate = props as MockClaimPanelProps;
  return typeof candidate.claim?.claimKind === "string"
    ? candidate.claim.claimKind
    : "UNKNOWN";
}

function buildClaim(overrides: Partial<ReviewClaimListItem> = {}): ReviewClaimListItem {
  return {
    claimKind          : "TIME",
    claimId            : TIME_CLAIM_ID,
    bookId             : BOOK_ID,
    chapterId          : CHAPTER_ID,
    reviewState        : "PENDING",
    source             : "AI",
    conflictState      : "NONE",
    createdAt          : "2026-04-23T10:00:00.000Z",
    updatedAt          : "2026-04-23T10:05:00.000Z",
    personaCandidateIds: [SOURCE_CANDIDATE_ID],
    personaIds         : ["persona-1"],
    timeLabel          : "次日",
    relationTypeKey    : null,
    evidenceSpanIds    : [EVIDENCE_ID_1, EVIDENCE_ID_2],
    ...overrides
  };
}

function buildDetailRecord(
  overrides: Partial<ReviewClaimDetailRecord> = {}
): ReviewClaimDetailRecord {
  const baseRecord: ReviewClaimDetailRecord = {
    ...buildClaim(),
    id                 : TIME_CLAIM_ID,
    runId              : RUN_ID,
    confidence         : 0.82,
    rawTimeText        : "次日",
    timeType           : "RELATIVE_PHASE",
    normalizedLabel    : "次日",
    relativeOrderWeight: 2,
    chapterRangeStart  : 3,
    chapterRangeEnd    : 3,
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
    claim            : buildDetailRecord(),
    evidence         : [],
    basisClaim       : null,
    aiSummary        : null,
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

const relationTypeOptions: PersonaChapterRelationTypeOptionDto[] = [
  {
    relationTypeKey   : "ally_of",
    label             : "同盟",
    direction         : "BIDIRECTIONAL",
    relationTypeSource: "PRESET",
    aliasLabels       : ["结盟"],
    systemPreset      : true
  }
];

async function loadTimeClaimActionPanel() {
  return (await import("./time-claim-action-panel")).TimeClaimActionPanel;
}

/**
 * 文件定位（T15 Task 7 时间 claim 动作面板单测）：
 * - 锁定 TIME claim 专用编辑表单仍走 T12 `EDIT` action，不分叉写路径；
 * - 非 TIME claim 必须继续复用章节矩阵既有审核动作面板，避免时间视图重写一套 event/relation 编辑流。
 */
describe("TimeClaimActionPanel", () => {
  beforeEach(() => {
    hoisted.submitReviewClaimActionMock.mockReset();
    hoisted.chapterClaimActionPanelMock.mockReset();
  });

  it("posts TIME edits through T12 while keeping raw and normalized labels separate", async () => {
    hoisted.submitReviewClaimActionMock.mockResolvedValueOnce(undefined);
    const TimeClaimActionPanel = await loadTimeClaimActionPanel();

    render(
      <TimeClaimActionPanel
        bookId={BOOK_ID}
        claim={buildClaim()}
        detail={buildDetail()}
        relationTypeOptions={relationTypeOptions}
        onMutationSuccess={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑记录" }));
    fireEvent.change(screen.getByRole("textbox", { name: "原始时间表达" }), {
      target: { value: "次日" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "归一化时间标签" }), {
      target: { value: "赤壁之战后次日" }
    });
    fireEvent.change(screen.getByLabelText("相对顺序权重"), {
      target: { value: "5" }
    });
    fireEvent.change(screen.getByLabelText("起始章节回次"), {
      target: { value: "42" }
    });
    fireEvent.change(screen.getByLabelText("结束章节回次"), {
      target: { value: "43" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存编辑" }));

    await waitFor(() => {
      expect(hoisted.submitReviewClaimActionMock).toHaveBeenCalledWith({
        bookId   : BOOK_ID,
        claimKind: "TIME",
        claimId  : TIME_CLAIM_ID,
        action   : "EDIT",
        note     : null,
        draft    : {
          bookId             : BOOK_ID,
          chapterId          : CHAPTER_ID,
          confidence         : 0.82,
          runId              : RUN_ID,
          evidenceSpanIds    : [EVIDENCE_ID_1, EVIDENCE_ID_2],
          rawTimeText        : "次日",
          timeType           : "RELATIVE_PHASE",
          normalizedLabel    : "赤壁之战后次日",
          relativeOrderWeight: 5,
          chapterRangeStart  : 42,
          chapterRangeEnd    : 43
        }
      });
    });
  });

  it("blocks invalid time range and non-numeric order weight before mutation", async () => {
    const TimeClaimActionPanel = await loadTimeClaimActionPanel();

    render(
      <TimeClaimActionPanel
        bookId={BOOK_ID}
        claim={buildClaim()}
        detail={buildDetail()}
        relationTypeOptions={relationTypeOptions}
        onMutationSuccess={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑记录" }));
    fireEvent.change(screen.getByLabelText("相对顺序权重"), {
      target: { value: "abc" }
    });
    fireEvent.change(screen.getByLabelText("起始章节回次"), {
      target: { value: "43" }
    });
    fireEvent.change(screen.getByLabelText("结束章节回次"), {
      target: { value: "42" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存编辑" }));

    expect(await screen.findByText("相对顺序权重必须是数字")).toBeInTheDocument();
    expect(screen.getByText("结束章节回次不能小于起始章节回次")).toBeInTheDocument();
    expect(hoisted.submitReviewClaimActionMock).not.toHaveBeenCalled();
  });

  it("delegates EVENT and RELATION claims to the existing chapter claim action panel", async () => {
    const TimeClaimActionPanel = await loadTimeClaimActionPanel();
    const onMutationSuccess = vi.fn();
    const { rerender } = render(
      <TimeClaimActionPanel
        bookId={BOOK_ID}
        claim={buildClaim({
          claimKind      : "EVENT",
          claimId        : EVENT_CLAIM_ID,
          relationTypeKey: null
        })}
        detail={buildDetail({
          claim: buildDetailRecord({
            id                 : EVENT_CLAIM_ID,
            claimId            : EVENT_CLAIM_ID,
            claimKind          : "EVENT",
            rawTimeText        : undefined,
            timeType           : undefined,
            normalizedLabel    : undefined,
            relativeOrderWeight: undefined,
            chapterRangeStart  : undefined,
            chapterRangeEnd    : undefined
          })
        })}
        relationTypeOptions={relationTypeOptions}
        onMutationSuccess={onMutationSuccess}
      />
    );

    expect(screen.getByTestId("chapter-claim-action-panel")).toHaveTextContent("EVENT");
    expect(hoisted.chapterClaimActionPanelMock).toHaveBeenCalledTimes(1);
    expect(hoisted.chapterClaimActionPanelMock.mock.calls[0]?.[0]).toMatchObject({
      bookId: BOOK_ID,
      claim : expect.objectContaining({ claimKind: "EVENT", claimId: EVENT_CLAIM_ID }),
      relationTypeOptions,
      onMutationSuccess
    });

    rerender(
      <TimeClaimActionPanel
        bookId={BOOK_ID}
        claim={buildClaim({
          claimKind      : "RELATION",
          claimId        : RELATION_CLAIM_ID,
          relationTypeKey: "ally_of"
        })}
        detail={buildDetail({
          claim: buildDetailRecord({
            id                      : RELATION_CLAIM_ID,
            claimId                 : RELATION_CLAIM_ID,
            claimKind               : "RELATION",
            relationTypeKey         : "ally_of",
            sourcePersonaCandidateId: SOURCE_CANDIDATE_ID,
            targetPersonaCandidateId: TARGET_CANDIDATE_ID,
            rawTimeText             : undefined,
            timeType                : undefined,
            normalizedLabel         : undefined,
            relativeOrderWeight     : undefined,
            chapterRangeStart       : undefined,
            chapterRangeEnd         : undefined
          })
        })}
        relationTypeOptions={relationTypeOptions}
        onMutationSuccess={onMutationSuccess}
      />
    );

    expect(screen.getByTestId("chapter-claim-action-panel")).toHaveTextContent("RELATION");
    expect(hoisted.chapterClaimActionPanelMock).toHaveBeenCalledTimes(2);
    expect(hoisted.chapterClaimActionPanelMock.mock.calls[1]?.[0]).toMatchObject({
      bookId: BOOK_ID,
      claim : expect.objectContaining({ claimKind: "RELATION", claimId: RELATION_CLAIM_ID }),
      relationTypeOptions,
      onMutationSuccess
    });
  });
});
