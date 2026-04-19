/**
 * 被测对象：analysis/claims/claim-schemas.ts。
 * 测试目标：
 *   - 覆盖各 claim family 的 DTO 校验入口
 *   - 锁定 evidence、manual lineage、custom relation key 等核心契约
 *   - 防止 manual override family 与 conflict/entity mention 语义漂移
 */

import { describe, expect, it } from "vitest";

import {
  AliasClaimKind,
  AliasType,
  BioCategory,
  ConflictType,
  IdentityClaim,
  MentionKind,
  NarrativeLens
} from "@/generated/prisma/enums";
import {
  assertReviewStateTransition,
  canTransitionReviewState,
  getNextReviewStates,
  isProjectionEligibleReviewState
} from "@/server/modules/review/evidence-review/review-state";
import {
  claimDraftSchema,
  claimFamilySchema,
  isManualOverrideFamily,
  manualOverrideFamilySchema,
  reviewableClaimFamilySchema,
  toClaimCreateData,
  validateClaimDraft,
  validateClaimDraftByFamily
} from "@/server/modules/analysis/claims/claim-schemas";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const EVIDENCE_ID = "44444444-4444-4444-8444-444444444444";
const USER_ID = "55555555-5555-4555-8555-555555555555";

describe("claim schema contracts", () => {
  it("parses an evidence-bound entity mention", () => {
    const parsed = validateClaimDraftByFamily("ENTITY_MENTION", {
      claimFamily               : "ENTITY_MENTION",
      bookId                    : BOOK_ID,
      chapterId                 : CHAPTER_ID,
      surfaceText               : "范进",
      mentionKind               : MentionKind.NAMED,
      identityClaim             : IdentityClaim.SELF,
      aliasTypeHint             : AliasType.NAMED,
      speakerPersonaCandidateId : null,
      suspectedResolvesTo       : null,
      evidenceSpanId            : EVIDENCE_ID,
      confidence                : 0.94,
      source                    : "AI",
      runId                     : RUN_ID
    });

    expect(parsed.claimFamily).toBe("ENTITY_MENTION");
    expect(parsed.evidenceSpanId).toBe(EVIDENCE_ID);
  });

  it("rejects reviewable claims without evidence spans", () => {
    const parsed = claimDraftSchema.safeParse({
      claimFamily              : "ALIAS",
      bookId                   : BOOK_ID,
      chapterId                : CHAPTER_ID,
      aliasText                : "范老爷",
      aliasType                : AliasType.TITLE,
      personaCandidateId       : null,
      targetPersonaCandidateId : null,
      claimKind                : AliasClaimKind.TITLE_OF,
      evidenceSpanIds          : [],
      confidence               : 0.81,
      reviewState              : "PENDING",
      source                   : "AI",
      runId                    : RUN_ID,
      supersedesClaimId        : null,
      derivedFromClaimId       : null,
      createdByUserId          : null,
      reviewedByUserId         : null,
      reviewNote               : null
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) {
      return;
    }

    expect(parsed.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path   : ["evidenceSpanIds"],
        code   : "too_small",
        minimum: 1
      })
    ]));
  });

  it("keeps relationTypeKey open while validating label and source", () => {
    const parsed = validateClaimDraft({
      claimFamily              : "RELATION",
      bookId                   : BOOK_ID,
      chapterId                : CHAPTER_ID,
      sourceMentionId          : null,
      targetMentionId          : null,
      sourcePersonaCandidateId : null,
      targetPersonaCandidateId : null,
      relationTypeKey          : "political_patron_of",
      relationLabel            : "政治庇护",
      relationTypeSource       : "CUSTOM",
      direction                : "FORWARD",
      effectiveChapterStart    : 12,
      effectiveChapterEnd      : 18,
      timeHintId               : null,
      evidenceSpanIds          : [EVIDENCE_ID],
      confidence               : 0.63,
      reviewState              : "PENDING",
      source                   : "RULE",
      runId                    : RUN_ID,
      supersedesClaimId        : null,
      derivedFromClaimId       : null,
      createdByUserId          : null,
      reviewedByUserId         : null,
      reviewNote               : null
    });

    expect(parsed.claimFamily).toBe("RELATION");
    if (parsed.claimFamily !== "RELATION") {
      return;
    }

    expect(parsed.relationTypeKey).toBe("political_patron_of");
  });

  it("disallows manual entity mentions and requires creators on manual lineage claims", () => {
    expect(() => validateClaimDraftByFamily("ENTITY_MENTION", {
      claimFamily               : "ENTITY_MENTION",
      bookId                    : BOOK_ID,
      chapterId                 : CHAPTER_ID,
      surfaceText               : "范进",
      mentionKind               : MentionKind.NAMED,
      identityClaim             : IdentityClaim.SELF,
      aliasTypeHint             : AliasType.NAMED,
      speakerPersonaCandidateId : null,
      suspectedResolvesTo       : null,
      evidenceSpanId            : EVIDENCE_ID,
      confidence                : 0.94,
      source                    : "MANUAL",
      runId                     : RUN_ID
    })).toThrowError("ENTITY_MENTION does not support manual claim writes");

    const parsed = claimDraftSchema.safeParse({
      claimFamily               : "EVENT",
      bookId                    : BOOK_ID,
      chapterId                 : CHAPTER_ID,
      subjectMentionId          : null,
      subjectPersonaCandidateId : null,
      predicate                 : "中举",
      objectText                : null,
      objectPersonaCandidateId  : null,
      locationText              : null,
      timeHintId                : null,
      eventCategory             : BioCategory.EXAM,
      narrativeLens             : NarrativeLens.SELF,
      evidenceSpanIds           : [EVIDENCE_ID],
      confidence                : 0.9,
      reviewState               : "ACCEPTED",
      source                    : "MANUAL",
      runId                     : RUN_ID,
      supersedesClaimId         : null,
      derivedFromClaimId        : null,
      createdByUserId           : null,
      reviewedByUserId          : USER_ID,
      reviewNote                : "人工新增"
    });

    expect(parsed.success).toBe(false);
    if (parsed.success) {
      return;
    }

    expect(parsed.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path   : ["createdByUserId"],
        message: "Manual claims must record createdByUserId"
      })
    ]));
  });

  it("treats conflict flags as reviewable but not manual override families", () => {
    const parsed = validateClaimDraftByFamily("CONFLICT_FLAG", {
      claimFamily      : "CONFLICT_FLAG",
      bookId           : BOOK_ID,
      chapterId        : CHAPTER_ID,
      runId            : RUN_ID,
      conflictType     : ConflictType.RELATION_DIRECTION_CONFLICT,
      relatedClaimKind : "RELATION",
      relatedClaimIds  : ["66666666-6666-4666-8666-666666666666"],
      summary          : "刘备与关羽的关系方向冲突",
      evidenceSpanIds  : [EVIDENCE_ID],
      reviewState      : "CONFLICTED",
      source           : "RULE",
      reviewedByUserId : null,
      reviewNote       : null
    });

    expect(parsed.claimFamily).toBe("CONFLICT_FLAG");
    expect(claimFamilySchema.parse("TIME")).toBe("TIME");
    expect(manualOverrideFamilySchema.parse("TIME")).toBe("TIME");
    expect(reviewableClaimFamilySchema.parse("CONFLICT_FLAG")).toBe("CONFLICT_FLAG");
    expect(isManualOverrideFamily("RELATION")).toBe(true);
    expect(isManualOverrideFamily("CONFLICT_FLAG")).toBe(false);
  });

  it("strips claimFamily when converting a valid alias draft into create data", () => {
    const draft = validateClaimDraftByFamily("ALIAS", {
      claimFamily              : "ALIAS",
      bookId                   : BOOK_ID,
      chapterId                : CHAPTER_ID,
      aliasText                : "范老爷",
      aliasType                : AliasType.TITLE,
      personaCandidateId       : null,
      targetPersonaCandidateId : null,
      claimKind                : AliasClaimKind.TITLE_OF,
      evidenceSpanIds          : [EVIDENCE_ID],
      confidence               : 0.72,
      reviewState              : "PENDING",
      source                   : "AI",
      runId                    : RUN_ID,
      supersedesClaimId        : null,
      derivedFromClaimId       : null,
      createdByUserId          : null,
      reviewedByUserId         : null,
      reviewNote               : null
    });

    expect(toClaimCreateData(draft)).toEqual({
      bookId                   : BOOK_ID,
      chapterId                : CHAPTER_ID,
      aliasText                : "范老爷",
      aliasType                : AliasType.TITLE,
      personaCandidateId       : null,
      targetPersonaCandidateId : null,
      claimKind                : AliasClaimKind.TITLE_OF,
      evidenceSpanIds          : [EVIDENCE_ID],
      confidence               : 0.72,
      reviewState              : "PENDING",
      source                   : "AI",
      runId                    : RUN_ID,
      supersedesClaimId        : null,
      derivedFromClaimId       : null,
      createdByUserId          : null,
      reviewedByUserId         : null,
      reviewNote               : null
    });
  });

  it("rejects invalid relation and time intervals plus manual conflict flags", () => {
    const relation = claimDraftSchema.safeParse({
      claimFamily              : "RELATION",
      bookId                   : BOOK_ID,
      chapterId                : CHAPTER_ID,
      sourceMentionId          : null,
      targetMentionId          : null,
      sourcePersonaCandidateId : null,
      targetPersonaCandidateId : null,
      relationTypeKey          : "sworn_brother_of",
      relationLabel            : "义兄弟",
      relationTypeSource       : "PRESET",
      direction                : "BIDIRECTIONAL",
      effectiveChapterStart    : 19,
      effectiveChapterEnd      : 12,
      timeHintId               : null,
      evidenceSpanIds          : [EVIDENCE_ID],
      confidence               : 0.8,
      reviewState              : "PENDING",
      source                   : "MANUAL",
      runId                    : RUN_ID,
      supersedesClaimId        : null,
      derivedFromClaimId       : null,
      createdByUserId          : USER_ID,
      reviewedByUserId         : USER_ID,
      reviewNote               : "人工修正关系"
    });

    const time = claimDraftSchema.safeParse({
      claimFamily         : "TIME",
      bookId              : BOOK_ID,
      chapterId           : CHAPTER_ID,
      rawTimeText         : "建安五年之后",
      timeType            : "RELATIVE_PHASE",
      normalizedLabel     : "建安五年后",
      relativeOrderWeight : 5,
      chapterRangeStart   : 9,
      chapterRangeEnd     : 3,
      evidenceSpanIds     : [EVIDENCE_ID],
      confidence          : 0.77,
      reviewState         : "PENDING",
      source              : "MANUAL",
      runId               : RUN_ID,
      supersedesClaimId   : null,
      derivedFromClaimId  : null,
      createdByUserId     : USER_ID,
      reviewedByUserId    : null,
      reviewNote          : "补充时间片段"
    });

    expect(relation.success).toBe(false);
    expect(time.success).toBe(false);
    if (!relation.success) {
      expect(relation.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          path   : ["effectiveChapterEnd"],
          message: "effectiveChapterEnd must be greater than or equal to effectiveChapterStart"
        })
      ]));
    }

    if (!time.success) {
      expect(time.error.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          path   : ["chapterRangeEnd"],
          message: "chapterRangeEnd must be greater than or equal to chapterRangeStart"
        })
      ]));
    }

    expect(() => validateClaimDraftByFamily("CONFLICT_FLAG", {
      claimFamily      : "CONFLICT_FLAG",
      bookId           : BOOK_ID,
      chapterId        : null,
      runId            : RUN_ID,
      conflictType     : ConflictType.ALIAS_CONFLICT,
      relatedClaimKind : "ALIAS",
      relatedClaimIds  : ["66666666-6666-4666-8666-666666666666"],
      summary          : "别名归并冲突",
      evidenceSpanIds  : [EVIDENCE_ID],
      reviewState      : "CONFLICTED",
      source           : "MANUAL",
      reviewedByUserId : USER_ID,
      reviewNote       : "人工复核"
    })).toThrowError("CONFLICT_FLAG does not support manual claim writes");
  });

  it("parses time and identity-resolution drafts through the shared union", () => {
    const timeDraft = validateClaimDraft({
      claimFamily         : "TIME",
      bookId              : BOOK_ID,
      chapterId           : CHAPTER_ID,
      rawTimeText         : "赤壁之战后",
      timeType            : "BATTLE_PHASE",
      normalizedLabel     : "赤壁战后",
      relativeOrderWeight : 12,
      chapterRangeStart   : 43,
      chapterRangeEnd     : 50,
      evidenceSpanIds     : [EVIDENCE_ID],
      confidence          : 0.73,
      reviewState         : "PENDING",
      source              : "AI",
      runId               : RUN_ID,
      supersedesClaimId   : null,
      derivedFromClaimId  : null,
      createdByUserId     : null,
      reviewedByUserId    : null,
      reviewNote          : null
    });

    const identityDraft = validateClaimDraftByFamily("IDENTITY_RESOLUTION", {
      claimFamily       : "IDENTITY_RESOLUTION",
      bookId            : BOOK_ID,
      chapterId         : null,
      mentionId         : "66666666-6666-4666-8666-666666666666",
      personaCandidateId: null,
      resolvedPersonaId : "77777777-7777-4777-8777-777777777777",
      resolutionKind    : "RESOLVES_TO",
      rationale         : "上下文与称谓一致",
      evidenceSpanIds   : [EVIDENCE_ID],
      confidence        : 0.88,
      reviewState       : "ACCEPTED",
      source            : "MANUAL",
      runId             : RUN_ID,
      supersedesClaimId : null,
      derivedFromClaimId: null,
      createdByUserId   : USER_ID,
      reviewedByUserId  : USER_ID,
      reviewNote        : "人工确认"
    });

    expect(timeDraft.claimFamily).toBe("TIME");
    expect(identityDraft.claimFamily).toBe("IDENTITY_RESOLUTION");
    expect(identityDraft.createdByUserId).toBe(USER_ID);
  });
});

describe("review-state helper coverage guard", () => {
  // claim-schemas 通过 base-types 间接导入 review-state；这里补齐 helper 触达，避免覆盖率误伤 Task 1 验证。
  it("covers review-state transitions and projection checks", () => {
    expect(getNextReviewStates("PENDING")).toContain("ACCEPTED");
    expect(canTransitionReviewState("PENDING", "ACCEPTED")).toBe(true);
    expect(canTransitionReviewState("REJECTED", "ACCEPTED")).toBe(false);
    expect(() => assertReviewStateTransition("PENDING", "ACCEPTED")).not.toThrowError();
    expect(() => assertReviewStateTransition("REJECTED", "ACCEPTED")).toThrowError();
    expect(isProjectionEligibleReviewState("ACCEPTED")).toBe(true);
    expect(isProjectionEligibleReviewState("DEFERRED")).toBe(false);
  });
});
