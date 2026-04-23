/** @vitest-environment jsdom */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ReviewClaimDetailRecord,
  ReviewClaimDetailResponse
} from "@/lib/services/review-matrix";
import type {
  ReviewRelationSelectedPairDto,
  ReviewRelationTypeOptionDto
} from "@/lib/services/relation-editor";

import { RelationClaimSheet } from "./relation-claim-sheet";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CLAIM_ID = "claim-1";
const SOURCE_CANDIDATE_ID = "candidate-source";
const TARGET_CANDIDATE_ID = "candidate-target";

const relationTypeOptions: ReviewRelationTypeOptionDto[] = [
  {
    relationTypeKey   : "teacher_of",
    label             : "师生",
    direction         : "FORWARD",
    relationTypeSource: "PRESET",
    aliasLabels       : ["授业"],
    systemPreset      : true
  },
  {
    relationTypeKey   : "enemy_of",
    label             : "敌对",
    direction         : "BIDIRECTIONAL",
    relationTypeSource: "PRESET",
    aliasLabels       : [],
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

vi.mock("../evidence-panel", () => ({
  ReviewClaimDetailPanel: ({ detail }: { detail: { claim: { claimId: string } } }) => (
    <section data-testid="review-claim-detail-panel">
      <p>原文证据</p>
      <p>AI 提取依据</p>
      <p>版本差异</p>
      <p>审核记录（最新在上）</p>
      <p>{detail.claim.claimId}</p>
    </section>
  )
}));

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
        evidenceSpanIds      : ["evidence-1", "evidence-2"]
      }
    ],
    ...overrides
  };
}

function buildDetailRecord(
  overrides: Partial<ReviewClaimDetailRecord> = {}
): ReviewClaimDetailRecord {
  const baseRecord: ReviewClaimDetailRecord = {
    id                      : CLAIM_ID,
    claimId                 : CLAIM_ID,
    claimKind               : "RELATION",
    bookId                  : BOOK_ID,
    chapterId               : "chapter-1",
    reviewState             : "PENDING",
    source                  : "AI",
    conflictState           : "NONE",
    createdAt               : "2026-04-22T10:00:00.000Z",
    updatedAt               : "2026-04-22T10:05:00.000Z",
    personaCandidateIds     : [SOURCE_CANDIDATE_ID, TARGET_CANDIDATE_ID],
    personaIds              : ["persona-1", "persona-2"],
    timeLabel               : "乡试之前",
    relationTypeKey         : "teacher_of",
    evidenceSpanIds         : ["evidence-1", "evidence-2"],
    derivedFromClaimId      : null,
    runId                   : "run-1",
    confidence              : 0.92,
    sourceMentionId         : null,
    targetMentionId         : null,
    sourcePersonaCandidateId: SOURCE_CANDIDATE_ID,
    targetPersonaCandidateId: TARGET_CANDIDATE_ID,
    relationLabel           : "师生",
    relationTypeSource      : "PRESET",
    direction               : "FORWARD",
    effectiveChapterStart   : 1,
    effectiveChapterEnd     : 3,
    timeHintId              : null,
    supersedesClaimId       : null
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
    claim   : buildDetailRecord(),
    evidence: [
      {
        id                 : "evidence-1",
        chapterId          : "chapter-1",
        chapterLabel       : "第 1 回",
        startOffset        : 12,
        endOffset          : 24,
        quotedText         : "周进提拔范进，众人称善。",
        normalizedText     : "周进提拔范进，众人称善。",
        speakerHint        : "叙事",
        narrativeRegionType: "NARRATIVE",
        createdAt          : "2026-04-22T10:00:00.000Z"
      }
    ],
    basisClaim: buildDetailRecord({
      id                 : "basis-1",
      claimId            : "basis-1",
      relationTypeKey    : "teacher_of",
      relationLabel      : "周进提携范进",
      relationTypeSource : "PRESET",
      reviewState        : "ACCEPTED",
      effectiveChapterEnd: 2
    }),
    aiSummary: {
      basisClaimId  : "basis-1",
      basisClaimKind: "RELATION",
      source        : "AI",
      runId         : "run-1",
      confidence    : 0.92,
      summaryLines  : ["关系类型：teacher_of"],
      rawOutput     : null
    },
    projectionSummary: {
      personaChapterFacts: [],
      personaTimeFacts   : [],
      relationshipEdges  : [],
      timelineEvents     : []
    },
    auditHistory: [],
    versionDiff : {
      versionSource     : "AUDIT_EDIT",
      supersedesClaimId : null,
      derivedFromClaimId: null,
      fieldDiffs        : []
    },
    ...overrides
  };
}

function selectComboboxOption(label: string, optionLabel: string) {
  fireEvent.click(screen.getByRole("combobox", { name: label }));
  fireEvent.click(screen.getByRole("option", { name: optionLabel }));
}

describe("RelationClaimSheet", () => {
  beforeEach(() => {
    hoisted.fetchReviewClaimDetailMock.mockReset();
    hoisted.submitReviewClaimActionMock.mockReset();
    hoisted.createManualReviewClaimMock.mockReset();
  });

  it("loads relation detail lazily and shows normalized fields, basis text, and evidence/audit panel", async () => {
    hoisted.fetchReviewClaimDetailMock.mockResolvedValueOnce(buildDetail());

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

    expect(screen.getByText("关系冲突提示")).toBeInTheDocument();
    expect(screen.getByText("当前人物关系对存在方向冲突，请逐条核对关系方向。")).toBeInTheDocument();
    expect(screen.getByText("当前人物关系对存在生效区间冲突，请核对章节区间。")).toBeInTheDocument();
    expect(screen.getByText("当前关系类型 Key")).toBeInTheDocument();
    expect(screen.getByText("teacher_of")).toBeInTheDocument();
    expect(screen.getByText("原始抽取关系文本")).toBeInTheDocument();
    expect(screen.getByText("周进提携范进")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "关系模板" })).toHaveTextContent(/^师生$/);
    expect(screen.getByLabelText("关系显示名称")).toHaveValue("师生");
    expect(screen.getByText("原文证据")).toBeInTheDocument();
    expect(screen.getByText("AI 提取依据")).toBeInTheDocument();
    expect(screen.getByText("版本差异")).toBeInTheDocument();
    expect(screen.getByText("审核记录（最新在上）")).toBeInTheDocument();
  });

  it("switches between preset and custom edit input, then posts EDIT through the T12 action endpoint", async () => {
    const onMutationSuccess = vi.fn();
    hoisted.fetchReviewClaimDetailMock.mockResolvedValueOnce(buildDetail());
    hoisted.submitReviewClaimActionMock.mockResolvedValueOnce(undefined);

    render(
      <RelationClaimSheet
        open
        bookId={BOOK_ID}
        selectedPair={buildSelectedPair()}
        selectedClaimId={CLAIM_ID}
        relationTypeOptions={relationTypeOptions}
        onOpenChange={vi.fn()}
        onMutationSuccess={onMutationSuccess}
      />
    );

    await screen.findByLabelText("关系模板");

    selectComboboxOption("关系模板", "敌对");
    expect(screen.getByLabelText("关系显示名称")).toHaveValue("敌对");

    fireEvent.click(screen.getByRole("radio", { name: "编辑自定义输入" }));
    fireEvent.change(screen.getByRole("textbox", { name: "关系类型 Key" }), {
      target: { value: "fellow_townsman_of" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "关系显示名称" }), {
      target: { value: "同乡" }
    });
    selectComboboxOption("关系方向", "反向");
    fireEvent.change(screen.getByRole("textbox", { name: "生效起始章节" }), {
      target: { value: "4" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "生效结束章节" }), {
      target: { value: "8" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "证据 Span IDs" }), {
      target: { value: "evidence-3, evidence-4" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "编辑备注（可选）" }), {
      target: { value: "改为同乡关系" }
    });
    fireEvent.click(screen.getByRole("button", { name: "保存关系修改" }));

    await waitFor(() => {
      expect(hoisted.submitReviewClaimActionMock).toHaveBeenCalledWith({
        bookId   : BOOK_ID,
        claimKind: "RELATION",
        claimId  : CLAIM_ID,
        action   : "EDIT",
        note     : "改为同乡关系",
        draft    : expect.objectContaining({
          bookId                  : BOOK_ID,
          chapterId               : "chapter-1",
          runId                   : "run-1",
          sourcePersonaCandidateId: SOURCE_CANDIDATE_ID,
          targetPersonaCandidateId: TARGET_CANDIDATE_ID,
          relationTypeKey         : "fellow_townsman_of",
          relationLabel           : "同乡",
          relationTypeSource      : "CUSTOM",
          direction               : "REVERSE",
          effectiveChapterStart   : 4,
          effectiveChapterEnd     : 8,
          evidenceSpanIds         : ["evidence-3", "evidence-4"]
        })
      });
    });
    expect(onMutationSuccess).toHaveBeenCalledTimes(1);
  });

  it("creates a new manual relation claim for the selected pair through the existing T12 create endpoint", async () => {
    const onMutationSuccess = vi.fn();
    hoisted.fetchReviewClaimDetailMock.mockResolvedValueOnce(buildDetail());
    hoisted.createManualReviewClaimMock.mockResolvedValueOnce({
      id: "manual-claim-1"
    });

    render(
      <RelationClaimSheet
        open
        bookId={BOOK_ID}
        selectedPair={buildSelectedPair()}
        selectedClaimId={CLAIM_ID}
        relationTypeOptions={relationTypeOptions}
        onOpenChange={vi.fn()}
        onMutationSuccess={onMutationSuccess}
      />
    );

    await screen.findByRole("radio", { name: "新增自定义输入" });

    fireEvent.click(screen.getByRole("radio", { name: "新增自定义输入" }));
    fireEvent.change(screen.getByRole("textbox", { name: "新增运行 ID" }), {
      target: { value: "manual-run-1" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "新增关系类型 Key" }), {
      target: { value: "sworn_brother_of" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "新增关系显示名称" }), {
      target: { value: "结义" }
    });
    selectComboboxOption("新增关系方向", "双向");
    fireEvent.change(screen.getByRole("textbox", { name: "新增生效起始章节" }), {
      target: { value: "6" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "新增生效结束章节" }), {
      target: { value: "9" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "新增证据 Span IDs" }), {
      target: { value: "evidence-7\nevidence-8" }
    });
    fireEvent.change(screen.getByRole("textbox", { name: "新增备注（可选）" }), {
      target: { value: "补录双向结义关系" }
    });
    fireEvent.click(screen.getByRole("button", { name: "新增关系 claim" }));

    await waitFor(() => {
      expect(hoisted.createManualReviewClaimMock).toHaveBeenCalledWith({
        claimKind: "RELATION",
        note     : "补录双向结义关系",
        draft    : expect.objectContaining({
          bookId                  : BOOK_ID,
          chapterId               : "chapter-1",
          runId                   : "manual-run-1",
          sourcePersonaCandidateId: SOURCE_CANDIDATE_ID,
          targetPersonaCandidateId: TARGET_CANDIDATE_ID,
          relationTypeKey         : "sworn_brother_of",
          relationLabel           : "结义",
          relationTypeSource      : "CUSTOM",
          direction               : "BIDIRECTIONAL",
          effectiveChapterStart   : 6,
          effectiveChapterEnd     : 9,
          evidenceSpanIds         : ["evidence-7", "evidence-8"]
        })
      });
    });
    expect(onMutationSuccess).toHaveBeenCalledTimes(1);
  });
});
