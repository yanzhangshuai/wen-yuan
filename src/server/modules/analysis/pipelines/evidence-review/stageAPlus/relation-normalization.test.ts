import { describe, expect, it } from "vitest";

import { normalizeStageAPlusRelations } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization";
import type { StageAPlusRelationClaimRow } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/types";
import { buildRelationTypeCatalog } from "@/server/modules/knowledge-v2/relation-types";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const RELATION_ID = "44444444-4444-4444-8444-444444444444";
const EVIDENCE_ID = "55555555-5555-4555-8555-555555555555";

function baseRelation(
  overrides: Partial<StageAPlusRelationClaimRow> = {}
): StageAPlusRelationClaimRow {
  return {
    id                      : RELATION_ID,
    bookId                  : BOOK_ID,
    chapterId               : CHAPTER_ID,
    sourceMentionId         : "66666666-6666-4666-8666-666666666661",
    targetMentionId         : "66666666-6666-4666-8666-666666666662",
    sourcePersonaCandidateId: null,
    targetPersonaCandidateId: null,
    relationTypeKey         : "custom_relation",
    relationLabel           : "提携",
    relationTypeSource      : "CUSTOM",
    direction               : "FORWARD",
    effectiveChapterStart   : null,
    effectiveChapterEnd     : null,
    timeHintId              : null,
    evidenceSpanIds         : [EVIDENCE_ID],
    confidence              : 0.66,
    ...overrides
  };
}

function buildCatalog(items: unknown[] = []) {
  return buildRelationTypeCatalog({
    items: items as never
  });
}

describe("Stage A+ relation normalization", () => {
  it("creates a derived relation suggestion while preserving the raw observed label", () => {
    const result = normalizeStageAPlusRelations({
      bookId   : BOOK_ID,
      chapterId: CHAPTER_ID,
      runId    : RUN_ID,
      relations: [baseRelation()],
      relationCatalog: buildCatalog([
        {
          id           : "mapping-1",
          scopeType    : "BOOK",
          scopeId      : BOOK_ID,
          knowledgeType: "relation label mapping rule",
          reviewState  : "VERIFIED",
          confidence   : 0.9,
          payload      : {
            relationTypeKey   : "political_patron_of",
            observedLabel     : "提携",
            normalizedLabel   : "政治庇护",
            relationTypeSource: "NORMALIZED_FROM_CUSTOM"
          }
        }
      ])
    });

    expect(result.relationDrafts[0]).toMatchObject({
      relationLabel     : "提携",
      relationTypeKey   : "political_patron_of",
      relationTypeSource: "NORMALIZED_FROM_CUSTOM",
      derivedFromClaimId: RELATION_ID,
      source            : "RULE",
      reviewState       : "PENDING"
    });
  });

  it("uses taxonomy aliases as normalization candidates", () => {
    const result = normalizeStageAPlusRelations({
      bookId   : BOOK_ID,
      chapterId: CHAPTER_ID,
      runId    : RUN_ID,
      relations: [baseRelation({ relationLabel: "门生" })],
      relationCatalog: buildCatalog([
        {
          id           : "taxonomy-1",
          scopeType    : "BOOK",
          scopeId      : BOOK_ID,
          knowledgeType: "relation taxonomy rule",
          reviewState  : "VERIFIED",
          confidence   : 0.9,
          payload      : {
            relationTypeKey   : "teacher_of",
            displayLabel      : "师生",
            direction         : "FORWARD",
            relationTypeSource: "PRESET",
            aliasLabels       : ["门生"]
          }
        }
      ])
    });

    expect(result.relationDrafts[0]).toMatchObject({
      relationLabel     : "门生",
      relationTypeKey   : "teacher_of",
      relationTypeSource: "PRESET"
    });
  });

  it("marks pending mapping suggestions with low-confidence review notes", () => {
    const result = normalizeStageAPlusRelations({
      bookId   : BOOK_ID,
      chapterId: CHAPTER_ID,
      runId    : RUN_ID,
      relations: [baseRelation()],
      relationCatalog: buildCatalog([
        {
          id           : "pending-mapping",
          scopeType    : "BOOK",
          scopeId      : BOOK_ID,
          knowledgeType: "relation label mapping rule",
          reviewState  : "PENDING",
          confidence   : 0.55,
          payload      : {
            relationTypeKey   : "political_patron_of",
            observedLabel     : "提携",
            normalizedLabel   : "政治庇护",
            relationTypeSource: "NORMALIZED_FROM_CUSTOM"
          }
        }
      ])
    });

    expect(result.relationDrafts[0]).toMatchObject({
      confidence: 0.55,
      reviewNote: expect.stringContaining("KB_PENDING_HINT")
    });
  });

  it("turns negative relation knowledge into a conflicted derived relation claim", () => {
    const result = normalizeStageAPlusRelations({
      bookId   : BOOK_ID,
      chapterId: CHAPTER_ID,
      runId    : RUN_ID,
      relations: [baseRelation({ relationLabel: "结义兄弟", direction: "BIDIRECTIONAL" })],
      relationCatalog: buildCatalog([
        {
          id           : "relation-negative",
          scopeType    : "BOOK",
          scopeId      : BOOK_ID,
          knowledgeType: "relation negative rule",
          reviewState  : "VERIFIED",
          confidence   : 0.92,
          payload      : {
            relationTypeKey: "sworn_brother",
            blockedLabels  : ["结义兄弟"],
            denyDirection  : "BIDIRECTIONAL",
            reason         : "夸饰称谓"
          }
        }
      ])
    });

    expect(result.relationDrafts[0]).toMatchObject({
      relationLabel     : "结义兄弟",
      relationTypeKey   : "sworn_brother",
      reviewState       : "CONFLICTED",
      reviewNote        : expect.stringContaining("KB_RELATION_NEGATIVE"),
      derivedFromClaimId: RELATION_ID
    });
  });
});
