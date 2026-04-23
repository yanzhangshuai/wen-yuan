import type {
  ReviewClaimAiBasisSummaryDto,
  ReviewClaimAuditHistoryItemDto,
  ReviewClaimDetailRecord,
  ReviewClaimDetailResponse,
  ReviewClaimEvidenceSpanDto,
  ReviewClaimFieldDiffDto,
  ReviewClaimVersionDiffDto
} from "@/lib/services/review-matrix";

export function buildClaimDetailRecord(
  overrides: Partial<ReviewClaimDetailRecord> = {}
): ReviewClaimDetailRecord {
  return {
    id                 : "claim-1",
    claimId            : "claim-1",
    claimKind          : "RELATION",
    bookId             : "book-1",
    chapterId          : "chapter-1",
    reviewState        : "PENDING",
    source             : "AI",
    conflictState      : "NONE",
    createdAt          : "2026-04-22T10:00:00.000Z",
    updatedAt          : "2026-04-22T10:05:00.000Z",
    personaCandidateIds: ["candidate-1", "candidate-2"],
    personaIds         : ["persona-1", "persona-2"],
    timeLabel          : "乡试之前",
    relationTypeKey    : "teacher_of",
    evidenceSpanIds    : ["evidence-1"],
    runId              : "run-1",
    confidence         : 0.92,
    supersedesClaimId  : null,
    derivedFromClaimId : null,
    relationLabel      : "师生",
    direction          : "FORWARD",
    ...overrides
  };
}

export function buildEvidenceSpan(
  overrides: Partial<ReviewClaimEvidenceSpanDto> = {}
): ReviewClaimEvidenceSpanDto {
  return {
    id                 : "evidence-1",
    chapterId          : "chapter-1",
    chapterLabel       : "第 1 回",
    startOffset        : 12,
    endOffset          : 24,
    quotedText         : "周进提拔范进，众人称善。",
    normalizedText     : "周进提拔范进，众人称善。",
    speakerHint        : "叙事",
    narrativeRegionType: "NARRATIVE",
    createdAt          : "2026-04-22T10:00:00.000Z",
    ...overrides
  };
}

export function buildFieldDiff(
  overrides: Partial<ReviewClaimFieldDiffDto> = {}
): ReviewClaimFieldDiffDto {
  return {
    fieldKey  : "relationLabel",
    fieldLabel: "关系显示名称",
    beforeText: "师友",
    afterText : "师生",
    ...overrides
  };
}

export function buildAuditHistoryItem(
  overrides: Partial<ReviewClaimAuditHistoryItemDto> = {}
): ReviewClaimAuditHistoryItemDto {
  return {
    id             : "audit-1",
    action         : "EDIT",
    actorUserId    : "reviewer-1",
    note           : "修订关系类型与区间",
    evidenceSpanIds: ["evidence-1"],
    createdAt      : "2026-04-22T10:10:00.000Z",
    beforeState    : null,
    afterState     : null,
    fieldDiffs     : [buildFieldDiff()],
    ...overrides
  };
}

export function buildAiSummary(
  overrides: Partial<ReviewClaimAiBasisSummaryDto> = {}
): ReviewClaimAiBasisSummaryDto {
  return {
    basisClaimId  : "claim-basis-1",
    basisClaimKind: "RELATION",
    source        : "AI",
    runId         : "run-1",
    confidence    : 0.92,
    summaryLines  : [
      "章节：chapter-1",
      "关系类型：teacher_of",
      "摘要：周进提拔范进"
    ],
    rawOutput: {
      stageKey         : "stage-2-relation",
      provider         : "openai",
      model            : "gpt-5.4",
      createdAt        : "2026-04-22T10:00:00.000Z",
      responseExcerpt  : "识别到周进与范进之间的师生关系。",
      hasStructuredJson: true,
      parseError       : null,
      schemaError      : null,
      discardReason    : null
    },
    ...overrides
  };
}

export function buildVersionDiff(
  overrides: Partial<ReviewClaimVersionDiffDto> = {}
): ReviewClaimVersionDiffDto {
  return {
    versionSource     : "AUDIT_EDIT",
    supersedesClaimId : "claim-legacy-1",
    derivedFromClaimId: "claim-origin-1",
    fieldDiffs        : [buildFieldDiff()],
    ...overrides
  };
}

export function buildClaimDetail(
  overrides: Partial<ReviewClaimDetailResponse> = {}
): ReviewClaimDetailResponse {
  return {
    claim     : buildClaimDetailRecord(),
    evidence  : [buildEvidenceSpan()],
    basisClaim: buildClaimDetailRecord({
      id           : "claim-basis-1",
      claimId      : "claim-basis-1",
      reviewState  : "ACCEPTED",
      relationLabel: "周进提拔范进"
    }),
    aiSummary        : buildAiSummary(),
    projectionSummary: {
      personaChapterFacts: [],
      personaTimeFacts   : [],
      relationshipEdges  : [],
      timelineEvents     : []
    },
    auditHistory: [buildAuditHistoryItem()],
    versionDiff : buildVersionDiff(),
    ...overrides
  };
}
