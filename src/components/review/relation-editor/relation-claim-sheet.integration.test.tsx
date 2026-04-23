/** @vitest-environment jsdom */
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildClaimDetail, buildClaimDetailRecord } from "../evidence-panel/test-fixtures";

import type {
  ReviewRelationSelectedPairDto,
  ReviewRelationTypeOptionDto
} from "@/lib/services/relation-editor";

import { RelationClaimSheet } from "./relation-claim-sheet";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CLAIM_ID = "claim-1";

const relationTypeOptions: ReviewRelationTypeOptionDto[] = [
  {
    relationTypeKey   : "teacher_of",
    label             : "师生",
    direction         : "FORWARD",
    relationTypeSource: "PRESET",
    aliasLabels       : ["授业"],
    systemPreset      : true
  }
];

const hoisted = vi.hoisted(() => ({
  fetchReviewClaimDetailMock : vi.fn(),
  submitReviewClaimActionMock: vi.fn(),
  createManualReviewClaimMock: vi.fn()
}));

vi.mock("@/lib/services/relation-editor", async () => {
  const actual = await vi.importActual("@/lib/services/relation-editor");

  return {
    ...actual,
    fetchReviewClaimDetail : hoisted.fetchReviewClaimDetailMock,
    submitReviewClaimAction: hoisted.submitReviewClaimActionMock,
    createManualReviewClaim: hoisted.createManualReviewClaimMock
  };
});

function buildSelectedPair(
  overrides: Partial<ReviewRelationSelectedPairDto> = {}
): ReviewRelationSelectedPairDto {
  return {
    pairKey    : "persona-1::persona-2",
    leftPersona: {
      personaId  : "persona-1",
      displayName: "范进",
      aliases    : ["范举人"]
    },
    rightPersona: {
      personaId  : "persona-2",
      displayName: "周进",
      aliases    : ["周老爷"]
    },
    warnings: {
      directionConflict: true,
      intervalConflict : true
    },
    claims: [
      {
        claimId              : CLAIM_ID,
        reviewState          : "PENDING",
        source               : "AI",
        conflictState        : "NONE",
        relationTypeKey      : "teacher_of",
        relationLabel        : "师生",
        relationTypeSource   : "PRESET",
        direction            : "FORWARD",
        effectiveChapterStart: 1,
        effectiveChapterEnd  : 3,
        chapterId            : "chapter-1",
        chapterLabel         : "第 1 回",
        timeLabel            : "乡试之前",
        evidenceSpanIds      : ["evidence-1"]
      }
    ],
    ...overrides
  };
}

describe("RelationClaimSheet shared panel integration", () => {
  beforeEach(() => {
    hoisted.fetchReviewClaimDetailMock.mockReset();
    hoisted.submitReviewClaimActionMock.mockReset();
    hoisted.createManualReviewClaimMock.mockReset();
  });

  it("renders the real shared ReviewClaimDetailPanel with evidence, AI basis, version diff, and audit history", async () => {
    hoisted.fetchReviewClaimDetailMock.mockResolvedValueOnce(buildClaimDetail({
      claim: buildClaimDetailRecord({
        id     : CLAIM_ID,
        claimId: CLAIM_ID
      })
    }));

    render(
      <RelationClaimSheet
        open
        bookId={BOOK_ID}
        selectedPair={buildSelectedPair()}
        selectedClaimId={CLAIM_ID}
        relationTypeOptions={relationTypeOptions}
        onOpenChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(hoisted.fetchReviewClaimDetailMock).toHaveBeenCalledWith({
        bookId   : BOOK_ID,
        claimKind: "RELATION",
        claimId  : CLAIM_ID
      });
    });

    expect(await screen.findByTestId("review-claim-detail-panel")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "原文证据" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "AI 提取依据" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "版本差异" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "审核记录（最新在上）" })).toBeInTheDocument();
    expect(screen.getByText("周进提拔范进，众人称善。")).toBeInTheDocument();
    expect(screen.getByText("识别到周进与范进之间的师生关系。")).toBeInTheDocument();
    expect(screen.getByText("修订关系类型与区间")).toBeInTheDocument();
  });
});
