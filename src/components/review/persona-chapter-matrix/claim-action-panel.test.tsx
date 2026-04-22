/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  PersonaChapterRelationTypeOptionDto,
  ReviewClaimDetailRecord,
  ReviewClaimDetailResponse,
  ReviewClaimListItem
} from "@/lib/services/review-matrix";

import { ClaimActionPanel } from "./claim-action-panel";

const BOOK_ID = "book-1";
const CHAPTER_ID = "chapter-1";
const CLAIM_ID = "claim-1";
const RUN_ID = "run-1";
const EVIDENCE_ID = "evidence-1";
const SOURCE_CANDIDATE_ID = "candidate-1";
const TARGET_CANDIDATE_ID = "candidate-2";

const hoisted = vi.hoisted(() => ({
  submitReviewClaimActionMock: vi.fn()
}));

vi.mock("@/lib/services/review-matrix", async () => {
  const actual = await vi.importActual("@/lib/services/review-matrix");

  return {
    ...actual,
    submitReviewClaimAction: hoisted.submitReviewClaimActionMock
  };
});

function buildClaim(overrides: Partial<ReviewClaimListItem> = {}): ReviewClaimListItem {
  return {
    claimKind          : "EVENT",
    claimId            : CLAIM_ID,
    bookId             : BOOK_ID,
    chapterId          : CHAPTER_ID,
    reviewState        : "PENDING",
    source             : "AI",
    conflictState      : "NONE",
    createdAt          : "2026-04-21T10:00:00.000Z",
    updatedAt          : "2026-04-21T10:05:00.000Z",
    personaCandidateIds: [SOURCE_CANDIDATE_ID],
    personaIds         : ["persona-1"],
    timeLabel          : "乡试之后",
    relationTypeKey    : null,
    evidenceSpanIds    : [EVIDENCE_ID],
    ...overrides
  };
}

function buildDetailRecord(
  overrides: Partial<ReviewClaimDetailRecord> = {}
): ReviewClaimDetailRecord {
  return {
    ...buildClaim(),
    id                       : CLAIM_ID,
    derivedFromClaimId       : null,
    runId                    : RUN_ID,
    confidence               : 0.72,
    subjectMentionId         : null,
    subjectPersonaCandidateId: SOURCE_CANDIDATE_ID,
    predicate                : "赴试",
    objectText               : "乡试",
    objectPersonaCandidateId : null,
    locationText             : "省城",
    timeHintId               : null,
    eventCategory            : "EXAM",
    narrativeLens            : "SELF",
    sourceMentionId          : null,
    targetMentionId          : null,
    sourcePersonaCandidateId : SOURCE_CANDIDATE_ID,
    targetPersonaCandidateId : TARGET_CANDIDATE_ID,
    relationTypeKey          : "mentor_of",
    relationLabel            : "提携",
    relationTypeSource       : "PRESET",
    direction                : "FORWARD",
    effectiveChapterStart    : 1,
    effectiveChapterEnd      : 2,
    ...overrides
  };
}

function buildDetail(overrides: Partial<ReviewClaimDetailResponse> = {}): ReviewClaimDetailResponse {
  return {
    claim            : buildDetailRecord(),
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

const relationOptions: PersonaChapterRelationTypeOptionDto[] = [
  {
    relationTypeKey   : "mentor_of",
    label             : "提携",
    direction         : "FORWARD",
    relationTypeSource: "PRESET",
    aliasLabels       : ["举荐"],
    systemPreset      : true
  }
];

/**
 * 文件定位（T13 Task 9 审核动作面板单测）：
 * - 锁定抽屉内 claim-first 审核动作的 reviewer 行为；
 * - 所有写入都必须经由 T12 action service，组件只负责结构化表单和刷新回调。
 */
describe("ClaimActionPanel", () => {
  beforeEach(() => {
    hoisted.submitReviewClaimActionMock.mockReset();
  });

  it("shows valid next actions for pending, accepted, deferred, and rejected claims", () => {
    const { rerender } = render(
      <ClaimActionPanel
        bookId={BOOK_ID}
        claim={buildClaim({ reviewState: "PENDING" })}
        detail={buildDetail()}
        relationTypeOptions={relationOptions}
        onMutationSuccess={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "确认采纳" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除/驳回" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "暂缓处理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑记录" })).toBeInTheDocument();

    rerender(
      <ClaimActionPanel
        bookId={BOOK_ID}
        claim={buildClaim({ reviewState: "ACCEPTED" })}
        detail={buildDetail()}
        relationTypeOptions={relationOptions}
        onMutationSuccess={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: "确认采纳" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "删除/驳回" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "暂缓处理" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑记录" })).toBeInTheDocument();

    rerender(
      <ClaimActionPanel
        bookId={BOOK_ID}
        claim={buildClaim({ reviewState: "DEFERRED" })}
        detail={buildDetail()}
        relationTypeOptions={relationOptions}
        onMutationSuccess={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: "确认采纳" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除/驳回" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "编辑记录" })).toBeInTheDocument();

    rerender(
      <ClaimActionPanel
        bookId={BOOK_ID}
        claim={buildClaim({ reviewState: "REJECTED" })}
        detail={buildDetail()}
        relationTypeOptions={relationOptions}
        onMutationSuccess={vi.fn()}
      />
    );

    expect(screen.getByText("该记录已删除/驳回，暂无可执行动作。")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "确认采纳" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "编辑记录" })).not.toBeInTheDocument();
  });

  it("posts ACCEPT through submitReviewClaimAction and refreshes after success", async () => {
    const onMutationSuccess = vi.fn();
    hoisted.submitReviewClaimActionMock.mockResolvedValueOnce(undefined);

    render(
      <ClaimActionPanel
        bookId={BOOK_ID}
        claim={buildClaim()}
        detail={buildDetail()}
        relationTypeOptions={relationOptions}
        onMutationSuccess={onMutationSuccess}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "确认采纳" }));

    await waitFor(() => {
      expect(hoisted.submitReviewClaimActionMock).toHaveBeenCalledWith({
        bookId   : BOOK_ID,
        claimKind: "EVENT",
        claimId  : CLAIM_ID,
        action   : "ACCEPT",
        note     : null
      });
    });
    expect(onMutationSuccess).toHaveBeenCalledTimes(1);
  });

  it("labels reject as delete/reject but sends the REJECT action", async () => {
    hoisted.submitReviewClaimActionMock.mockResolvedValueOnce(undefined);

    render(
      <ClaimActionPanel
        bookId={BOOK_ID}
        claim={buildClaim()}
        detail={buildDetail()}
        relationTypeOptions={relationOptions}
        onMutationSuccess={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "删除/驳回" }));

    await waitFor(() => {
      expect(hoisted.submitReviewClaimActionMock).toHaveBeenCalledWith(expect.objectContaining({
        action: "REJECT"
      }));
    });
  });

  it("posts DEFER with the optional reviewer note", async () => {
    hoisted.submitReviewClaimActionMock.mockResolvedValueOnce(undefined);

    render(
      <ClaimActionPanel
        bookId={BOOK_ID}
        claim={buildClaim()}
        detail={buildDetail()}
        relationTypeOptions={relationOptions}
        onMutationSuccess={vi.fn()}
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: "审核备注（可选）" }), {
      target: { value: "证据范围需要复核" }
    });
    fireEvent.click(screen.getByRole("button", { name: "暂缓处理" }));

    await waitFor(() => {
      expect(hoisted.submitReviewClaimActionMock).toHaveBeenCalledWith({
        bookId   : BOOK_ID,
        claimKind: "EVENT",
        claimId  : CLAIM_ID,
        action   : "DEFER",
        note     : "证据范围需要复核"
      });
    });
  });

  it("opens a structured event editor and posts EDIT", async () => {
    hoisted.submitReviewClaimActionMock.mockResolvedValueOnce(undefined);

    render(
      <ClaimActionPanel
        bookId={BOOK_ID}
        claim={buildClaim({ claimKind: "EVENT" })}
        detail={buildDetail()}
        relationTypeOptions={relationOptions}
        onMutationSuccess={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑记录" }));
    fireEvent.change(screen.getByRole("textbox", { name: "事迹谓语" }), {
      target: { value: "中举" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存编辑" }));

    await waitFor(() => {
      expect(hoisted.submitReviewClaimActionMock).toHaveBeenCalledWith({
        bookId   : BOOK_ID,
        claimKind: "EVENT",
        claimId  : CLAIM_ID,
        action   : "EDIT",
        note     : null,
        draft    : expect.objectContaining({
          bookId                   : BOOK_ID,
          chapterId                : CHAPTER_ID,
          confidence               : 0.72,
          runId                    : RUN_ID,
          subjectPersonaCandidateId: SOURCE_CANDIDATE_ID,
          predicate                : "中举",
          eventCategory            : "EXAM",
          narrativeLens            : "SELF",
          evidenceSpanIds          : [EVIDENCE_ID]
        })
      });
    });
  });

  it("opens a structured relation editor and posts EDIT", async () => {
    hoisted.submitReviewClaimActionMock.mockResolvedValueOnce(undefined);

    render(
      <ClaimActionPanel
        bookId={BOOK_ID}
        claim={buildClaim({
          claimKind      : "RELATION",
          relationTypeKey: "mentor_of"
        })}
        detail={buildDetail({
          claim: buildDetailRecord({
            claimKind      : "RELATION",
            relationTypeKey: "mentor_of"
          })
        })}
        relationTypeOptions={relationOptions}
        onMutationSuccess={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑记录" }));
    fireEvent.change(screen.getByRole("textbox", { name: "关系类型 Key" }), {
      target: { value: "teacher_of" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "关系显示名称" }), {
      target: { value: "师徒" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存编辑" }));

    await waitFor(() => {
      expect(hoisted.submitReviewClaimActionMock).toHaveBeenCalledWith(expect.objectContaining({
        action: "EDIT",
        draft : expect.objectContaining({
          bookId                  : BOOK_ID,
          chapterId               : CHAPTER_ID,
          sourcePersonaCandidateId: SOURCE_CANDIDATE_ID,
          targetPersonaCandidateId: TARGET_CANDIDATE_ID,
          relationTypeKey         : "teacher_of",
          relationLabel           : "师徒",
          relationTypeSource      : "CUSTOM",
          direction               : "FORWARD",
          effectiveChapterStart   : 1,
          effectiveChapterEnd     : 2,
          evidenceSpanIds         : [EVIDENCE_ID]
        })
      }));
    });
  });

  it("keeps the editor open and shows an error when mutation fails", async () => {
    hoisted.submitReviewClaimActionMock.mockRejectedValueOnce(new Error("network failed"));

    render(
      <ClaimActionPanel
        bookId={BOOK_ID}
        claim={buildClaim()}
        detail={buildDetail()}
        relationTypeOptions={relationOptions}
        onMutationSuccess={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "编辑记录" }));
    fireEvent.click(screen.getByRole("button", { name: "保存编辑" }));

    expect(await screen.findByText("network failed")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "保存编辑" })).toBeInTheDocument();
  });
});
