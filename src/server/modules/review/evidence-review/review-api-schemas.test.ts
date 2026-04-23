/**
 * 文件定位（review API DTO 单测）：
 * - 该文件约束 T12 review mutation API 的输入契约，防止 route/service 先各写一份字段解释。
 * - 这里优先锁定 claim-first 设计里的关键边界：`DEFER` 动作，以及 merge/split 使用 `personaCandidateIds` 而非 legacy 章节推断。
 */

import { describe, expect, it } from "vitest";

import {
  parseReviewManualClaimDraft,
  reviewClaimActionRequestSchema,
  reviewClaimListQuerySchema,
  reviewClaimRouteParamsSchema,
  reviewMergePersonasRequestSchema,
  reviewPersonaTimeMatrixQuerySchema,
  reviewRelationEditorQuerySchema,
  reviewPersonaChapterMatrixQuerySchema,
  reviewSplitPersonaRequestSchema
} from "./review-api-schemas";

const BOOK_ID = "22222222-2222-4222-8222-222222222222";
const CHAPTER_ID = "23232323-2323-4232-8232-232323232323";
const RUN_ID = "24242424-2424-4242-8242-242424242424";
const SOURCE_PERSONA_ID = "33333333-3333-4333-8333-333333333333";
const TARGET_PERSONA_ID = "44444444-4444-4444-8444-444444444444";
const CANDIDATE_ID_1 = "55555555-5555-4555-8555-555555555555";
const CANDIDATE_ID_2 = "66666666-6666-4666-8666-666666666666";
const CANDIDATE_ID_3 = "77777777-7777-4777-8777-777777777777";
const EVIDENCE_ID = "78787878-7878-4787-8787-787878787878";

describe("review api schemas", () => {
  it("requires bookId in claim action request schema", () => {
    expect(() => reviewClaimActionRequestSchema.parse({
      bookId: BOOK_ID,
      action: "DEFER",
      note  : "need more evidence"
    })).not.toThrow();

    expect(() => reviewClaimActionRequestSchema.parse({
      action: "DEFER",
      note  : "need more evidence"
    })).toThrow();
  });

  // 这里显式验证 personaCandidateIds，避免后续 API 又退回到依赖 legacy persona/chapter 推断的隐式输入。
  it("accepts merge and split persona payloads keyed by personaCandidateIds", () => {
    expect(reviewMergePersonasRequestSchema.parse({
      bookId             : BOOK_ID,
      sourcePersonaId    : SOURCE_PERSONA_ID,
      targetPersonaId    : TARGET_PERSONA_ID,
      personaCandidateIds: [CANDIDATE_ID_1, CANDIDATE_ID_2],
      note               : "same person"
    })).toMatchObject({ sourcePersonaId: SOURCE_PERSONA_ID });

    expect(reviewSplitPersonaRequestSchema.parse({
      bookId         : BOOK_ID,
      sourcePersonaId: SOURCE_PERSONA_ID,
      splitTargets   : [{
        targetPersonaName  : "新角色",
        personaCandidateIds: [CANDIDATE_ID_3]
      }],
      note: "separate identities"
    })).toMatchObject({ sourcePersonaId: SOURCE_PERSONA_ID });
  });

  it("accepts review claim list filters and route params", () => {
    expect(reviewClaimListQuerySchema.parse({
      bookId       : BOOK_ID,
      claimKinds   : ["EVENT", "RELATION"],
      reviewStates : ["PENDING", "DEFERRED"],
      sources      : ["AI", "MANUAL"],
      personaId    : SOURCE_PERSONA_ID,
      chapterId    : TARGET_PERSONA_ID,
      timeLabel    : "赤壁之战前",
      conflictState: "ACTIVE",
      limit        : 50,
      offset       : 0
    })).toMatchObject({
      bookId      : BOOK_ID,
      claimKinds  : ["EVENT", "RELATION"],
      reviewStates: ["PENDING", "DEFERRED"],
      sources     : ["AI", "MANUAL"]
    });

    expect(reviewClaimRouteParamsSchema.parse({
      claimKind: "EVENT",
      claimId  : CANDIDATE_ID_1
    })).toEqual({
      claimKind: "EVENT",
      claimId  : CANDIDATE_ID_1
    });
  });

  it("parses persona-chapter matrix query filters and coerces persona pagination", () => {
    expect(reviewPersonaChapterMatrixQuerySchema.parse({
      bookId        : BOOK_ID,
      personaId     : SOURCE_PERSONA_ID,
      chapterId     : CHAPTER_ID,
      reviewStates  : ["PENDING", "DEFERRED"],
      conflictState : "ACTIVE",
      limitPersonas : "25",
      offsetPersonas: "5"
    })).toEqual({
      bookId        : BOOK_ID,
      personaId     : SOURCE_PERSONA_ID,
      chapterId     : CHAPTER_ID,
      reviewStates  : ["PENDING", "DEFERRED"],
      conflictState : "ACTIVE",
      limitPersonas : 25,
      offsetPersonas: 5
    });
  });

  it("rejects invalid persona-chapter matrix identifiers and conflict states", () => {
    expect(() => reviewPersonaChapterMatrixQuerySchema.parse({
      personaId: SOURCE_PERSONA_ID
    })).toThrow();

    expect(() => reviewPersonaChapterMatrixQuerySchema.parse({
      bookId: "not-a-uuid"
    })).toThrow();

    expect(() => reviewPersonaChapterMatrixQuerySchema.parse({
      bookId       : BOOK_ID,
      chapterId    : "not-a-uuid",
      conflictState: "SOMETHING_ELSE"
    })).toThrow();
  });

  it("parses persona-time matrix query filters and coerces persona pagination", () => {
    expect(reviewPersonaTimeMatrixQuerySchema.parse({
      bookId        : BOOK_ID,
      personaId     : SOURCE_PERSONA_ID,
      timeTypes     : ["RELATIVE_PHASE", "NAMED_EVENT"],
      limitPersonas : "25",
      offsetPersonas: "5"
    })).toEqual({
      bookId        : BOOK_ID,
      personaId     : SOURCE_PERSONA_ID,
      timeTypes     : ["RELATIVE_PHASE", "NAMED_EVENT"],
      limitPersonas : 25,
      offsetPersonas: 5
    });
  });

  it("rejects invalid persona-time matrix identifiers and unsupported time types", () => {
    expect(() => reviewPersonaTimeMatrixQuerySchema.parse({
      personaId: SOURCE_PERSONA_ID
    })).toThrow();

    expect(() => reviewPersonaTimeMatrixQuerySchema.parse({
      bookId: "not-a-uuid"
    })).toThrow();

    expect(() => reviewPersonaTimeMatrixQuerySchema.parse({
      bookId       : BOOK_ID,
      personaId    : "not-a-uuid",
      timeTypes    : ["SPRING"],
      limitPersonas: -1
    })).toThrow();
  });

  it("parses relation editor query filters while keeping relationTypeKeys open", () => {
    expect(reviewRelationEditorQuerySchema.parse({
      bookId          : BOOK_ID,
      personaId       : SOURCE_PERSONA_ID,
      pairPersonaId   : TARGET_PERSONA_ID,
      relationTypeKeys: ["teacher_of", "custom_patron_of"],
      reviewStates    : ["PENDING", "EDITED"],
      conflictState   : "ACTIVE",
      limitPairs      : "25",
      offsetPairs     : "5"
    })).toEqual({
      bookId          : BOOK_ID,
      personaId       : SOURCE_PERSONA_ID,
      pairPersonaId   : TARGET_PERSONA_ID,
      relationTypeKeys: ["teacher_of", "custom_patron_of"],
      reviewStates    : ["PENDING", "EDITED"],
      conflictState   : "ACTIVE",
      limitPairs      : 25,
      offsetPairs     : 5
    });
  });

  it("rejects invalid relation editor queries", () => {
    expect(() => reviewRelationEditorQuerySchema.parse({
      personaId: SOURCE_PERSONA_ID
    })).toThrow();

    expect(() => reviewRelationEditorQuerySchema.parse({
      bookId   : "not-a-uuid",
      personaId: SOURCE_PERSONA_ID
    })).toThrow();

    expect(() => reviewRelationEditorQuerySchema.parse({
      bookId       : BOOK_ID,
      pairPersonaId: TARGET_PERSONA_ID
    })).toThrow();

    expect(() => reviewRelationEditorQuerySchema.parse({
      bookId       : BOOK_ID,
      personaId    : SOURCE_PERSONA_ID,
      pairPersonaId: "not-a-uuid"
    })).toThrow();
  });

  it("parses family-specific manual claim drafts for route handlers", () => {
    expect(parseReviewManualClaimDraft("RELATION", {
      bookId                  : BOOK_ID,
      chapterId               : CHAPTER_ID,
      confidence              : 0.88,
      runId                   : RUN_ID,
      evidenceSpanIds         : [EVIDENCE_ID],
      sourceMentionId         : null,
      targetMentionId         : null,
      sourcePersonaCandidateId: CANDIDATE_ID_1,
      targetPersonaCandidateId: CANDIDATE_ID_2,
      relationTypeKey         : "friend_of",
      relationLabel           : "朋友",
      relationTypeSource      : "PRESET",
      direction               : "FORWARD",
      effectiveChapterStart   : 1,
      effectiveChapterEnd     : 2,
      timeHintId              : null
    })).toMatchObject({
      bookId         : BOOK_ID,
      relationTypeKey: "friend_of",
      relationLabel  : "朋友"
    });
  });
});
