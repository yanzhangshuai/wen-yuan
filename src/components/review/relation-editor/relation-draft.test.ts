import { describe, expect, it } from "vitest";

import type { PersonaChapterRelationTypeOptionDto } from "@/lib/services/review-matrix";

import {
  CUSTOM_RELATION_TYPE,
  buildManualRelationDraft,
  buildRelationEditPayload,
  parseEvidenceSpanIds,
  resolveRelationTypeSource,
  toNullableChapterNo
} from "./relation-draft";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const SOURCE_CANDIDATE_ID = "44444444-4444-4444-8444-444444444444";
const TARGET_CANDIDATE_ID = "55555555-5555-4555-8555-555555555555";

const relationTypeOptions: PersonaChapterRelationTypeOptionDto[] = [
  {
    relationTypeKey   : "mentor_of",
    label             : "提携",
    direction         : "FORWARD",
    relationTypeSource: "PRESET",
    aliasLabels       : ["举荐"],
    systemPreset      : true
  },
  {
    relationTypeKey   : "friend_of",
    label             : "朋友",
    direction         : "BIDIRECTIONAL",
    relationTypeSource: "PRESET",
    aliasLabels       : [],
    systemPreset      : true
  }
];

/**
 * Relation draft helper tests lock payload semantics shared by the matrix editor
 * and the dedicated relation editor, so custom relation support cannot drift by UI.
 */
describe("relation draft helpers", () => {
  it("builds a manual relation draft from a preset relation type", () => {
    const draft = buildManualRelationDraft({
      bookId                  : BOOK_ID,
      chapterId               : CHAPTER_ID,
      sourcePersonaCandidateId: SOURCE_CANDIDATE_ID,
      targetPersonaCandidateId: TARGET_CANDIDATE_ID,
      relationTypeOptions,
      draft                   : {
        runId                : ` ${RUN_ID} `,
        evidenceSpanIdsText  : "span-1, span-2\nspan-3",
        targetPersonaId      : "persona-target",
        relationTypeChoice   : "friend_of",
        customRelationTypeKey: "ignored_custom",
        customRelationLabel  : "ignored label",
        direction            : "REVERSE",
        effectiveChapterStart: " 2 ",
        effectiveChapterEnd  : "",
        timeHintId           : " time-1 "
      }
    });

    expect(draft).toEqual({
      bookId                  : BOOK_ID,
      chapterId               : CHAPTER_ID,
      confidence              : 1,
      runId                   : RUN_ID,
      sourceMentionId         : null,
      targetMentionId         : null,
      sourcePersonaCandidateId: SOURCE_CANDIDATE_ID,
      targetPersonaCandidateId: TARGET_CANDIDATE_ID,
      relationTypeKey         : "friend_of",
      relationLabel           : "朋友",
      relationTypeSource      : "PRESET",
      direction               : "BIDIRECTIONAL",
      effectiveChapterStart   : 2,
      effectiveChapterEnd     : null,
      timeHintId              : "time-1",
      evidenceSpanIds         : ["span-1", "span-2", "span-3"]
    });
  });

  it("builds a manual relation draft from reviewer-entered custom values", () => {
    const draft = buildManualRelationDraft({
      bookId                  : BOOK_ID,
      chapterId               : CHAPTER_ID,
      sourcePersonaCandidateId: SOURCE_CANDIDATE_ID,
      targetPersonaCandidateId: TARGET_CANDIDATE_ID,
      relationTypeOptions,
      draft                   : {
        runId                : RUN_ID,
        evidenceSpanIdsText  : "span-custom",
        targetPersonaId      : "persona-target",
        relationTypeChoice   : CUSTOM_RELATION_TYPE,
        customRelationTypeKey: " same_clan_of ",
        customRelationLabel  : " 同宗 ",
        direction            : "UNDIRECTED",
        effectiveChapterStart: "",
        effectiveChapterEnd  : "abc",
        timeHintId           : ""
      }
    });

    expect(draft).toMatchObject({
      relationTypeKey      : "same_clan_of",
      relationLabel        : "同宗",
      relationTypeSource   : "CUSTOM",
      direction            : "UNDIRECTED",
      effectiveChapterStart: null,
      effectiveChapterEnd  : null,
      timeHintId           : null,
      evidenceSpanIds      : ["span-custom"]
    });
  });

  it("resolves relation type source from open-string relation keys", () => {
    expect(resolveRelationTypeSource("mentor_of", relationTypeOptions)).toBe("PRESET");
    expect(resolveRelationTypeSource("same_clan_of", relationTypeOptions)).toBe("CUSTOM");
  });

  it("normalizes nullable chapter interval and evidence input values", () => {
    expect(toNullableChapterNo("")).toBeNull();
    expect(toNullableChapterNo("not-number")).toBeNull();
    expect(toNullableChapterNo(" 7 ")).toBe(7);
    expect(parseEvidenceSpanIds(" span-a, \nspan-b\n\n span-c ")).toEqual(["span-a", "span-b", "span-c"]);
  });

  it("builds a relation edit payload with normalized intervals and source", () => {
    const payload = buildRelationEditPayload({
      relationTypeOptions,
      draft: {
        chapterId               : CHAPTER_ID,
        confidence              : "0.82",
        runId                   : RUN_ID,
        sourceMentionId         : "",
        targetMentionId         : "target-mention-1",
        sourcePersonaCandidateId: SOURCE_CANDIDATE_ID,
        targetPersonaCandidateId: TARGET_CANDIDATE_ID,
        relationTypeKey         : " sworn_friend_of ",
        relationLabel           : " 结义 ",
        direction               : "BIDIRECTIONAL",
        effectiveChapterStart   : "",
        effectiveChapterEnd     : " 12 ",
        timeHintId              : "",
        evidenceSpanIdsText     : "span-1,span-2"
      }
    });

    expect(payload).toMatchObject({
      bookId                  : "",
      chapterId               : CHAPTER_ID,
      confidence              : 0.82,
      runId                   : RUN_ID,
      sourceMentionId         : null,
      targetMentionId         : "target-mention-1",
      sourcePersonaCandidateId: SOURCE_CANDIDATE_ID,
      targetPersonaCandidateId: TARGET_CANDIDATE_ID,
      relationTypeKey         : "sworn_friend_of",
      relationLabel           : "结义",
      relationTypeSource      : "CUSTOM",
      direction               : "BIDIRECTIONAL",
      effectiveChapterStart   : null,
      effectiveChapterEnd     : 12,
      timeHintId              : null,
      evidenceSpanIds         : ["span-1", "span-2"]
    });
  });
});
