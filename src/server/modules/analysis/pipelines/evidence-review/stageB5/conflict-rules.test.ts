import { describe, expect, it } from "vitest";

import {
  ConflictSeverity,
  ConflictType
} from "@/generated/prisma/enums";
import {
  detectAliasConflicts,
  detectLowEvidenceClaimConflicts,
  detectRelationDirectionConflicts
} from "@/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules";
import type {
  StageB5EventClaimRow,
  StageB5IdentityResolutionClaimRow,
  StageB5RelationClaimRow
} from "@/server/modules/analysis/pipelines/evidence-review/stageB5/types";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const CHAPTER_ID = "33333333-3333-4333-8333-333333333333";

function identityClaim(
  overrides: Partial<StageB5IdentityResolutionClaimRow> = {}
): StageB5IdentityResolutionClaimRow {
  return {
    id                : "identity-1",
    bookId            : BOOK_ID,
    chapterId         : CHAPTER_ID,
    chapterNo         : 10,
    runId             : RUN_ID,
    mentionId         : "mention-1",
    personaCandidateId: "candidate-1",
    resolutionKind    : "SPLIT_FROM",
    rationale         : "blocked alias chain",
    evidenceSpanIds   : ["evidence-1"],
    confidence        : 0.81,
    reviewState       : "CONFLICTED",
    source            : "AI",
    reviewNote        : "STAGE_B: blocks=NEGATIVE_ALIAS_RULE|MISIDENTIFICATION",
    ...overrides
  };
}

function relationClaim(
  overrides: Partial<StageB5RelationClaimRow> = {}
): StageB5RelationClaimRow {
  return {
    id                      : "relation-1",
    bookId                  : BOOK_ID,
    chapterId               : CHAPTER_ID,
    chapterNo               : 10,
    runId                   : RUN_ID,
    sourcePersonaCandidateId: "candidate-1",
    targetPersonaCandidateId: "candidate-2",
    relationTypeKey         : "teacher_of",
    relationLabel           : "师生",
    relationTypeSource      : "PRESET",
    direction               : "FORWARD",
    effectiveChapterStart   : 10,
    effectiveChapterEnd     : 12,
    timeHintId              : null,
    evidenceSpanIds         : ["evidence-2"],
    confidence              : 0.84,
    reviewState             : "PENDING",
    source                  : "AI",
    derivedFromClaimId      : null,
    reviewNote              : null,
    ...overrides
  };
}

function eventClaim(overrides: Partial<StageB5EventClaimRow> = {}): StageB5EventClaimRow {
  return {
    id                       : "event-1",
    bookId                   : BOOK_ID,
    chapterId                : CHAPTER_ID,
    chapterNo                : 10,
    runId                    : RUN_ID,
    subjectPersonaCandidateId: "candidate-1",
    objectPersonaCandidateId : null,
    predicate                : "赴宴",
    objectText               : null,
    locationText             : null,
    timeHintId               : null,
    eventCategory            : "EVENT",
    narrativeLens            : "SELF",
    evidenceSpanIds          : ["evidence-3"],
    confidence               : 0.42,
    reviewState              : "PENDING",
    source                   : "AI",
    derivedFromClaimId       : null,
    reviewNote               : null,
    ...overrides
  };
}

describe("stageB5/conflict-rules first pass", () => {
  it("emits ALIAS_CONFLICT from stage-b blocker tags", () => {
    const findings = detectAliasConflicts([
      identityClaim()
    ]);

    expect(findings).toEqual([
      expect.objectContaining({
        conflictType              : ConflictType.ALIAS_CONFLICT,
        severity                  : ConflictSeverity.HIGH,
        recommendedActionKey      : "VERIFY_IDENTITY_SPLIT",
        sourceStageKey            : "stage_b_identity_resolution",
        relatedPersonaCandidateIds: ["candidate-1"]
      })
    ]);
  });

  it("emits RELATION_DIRECTION_CONFLICT for reversed directional edges on the same pair", () => {
    const findings = detectRelationDirectionConflicts([
      relationClaim(),
      relationClaim({
        id                      : "relation-2",
        sourcePersonaCandidateId: "candidate-2",
        targetPersonaCandidateId: "candidate-1",
        direction               : "FORWARD",
        evidenceSpanIds         : ["evidence-4"]
      })
    ]);

    expect(findings).toEqual([
      expect.objectContaining({
        conflictType    : ConflictType.RELATION_DIRECTION_CONFLICT,
        relatedClaimIds : ["relation-1", "relation-2"],
        relatedClaimKind: "RELATION"
      })
    ]);
  });

  it("emits LOW_EVIDENCE_CLAIM for weak single-evidence reviewable rows", () => {
    const findings = detectLowEvidenceClaimConflicts({
      aliasClaims             : [],
      eventClaims             : [eventClaim()],
      relationClaims          : [],
      timeClaims              : [],
      identityResolutionClaims: []
    });

    expect(findings).toEqual([
      expect.objectContaining({
        conflictType        : ConflictType.LOW_EVIDENCE_CLAIM,
        severity            : ConflictSeverity.LOW,
        recommendedActionKey: "REQUEST_MORE_EVIDENCE",
        relatedClaimKind    : "EVENT",
        relatedClaimIds     : ["event-1"]
      })
    ]);
  });
});
