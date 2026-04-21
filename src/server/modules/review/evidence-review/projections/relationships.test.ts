import { describe, expect, it } from "vitest";

import { buildRelationshipEdges } from "@/server/modules/review/evidence-review/projections/relationships";
import type { RelationClaimProjectionSourceRow } from "@/server/modules/review/evidence-review/projections/types";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const BOOK_ID_2 = "12111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const CANDIDATE_ID_1 = "33333333-3333-4333-8333-333333333333";
const CANDIDATE_ID_2 = "34333333-3333-4333-8333-333333333333";
const CANDIDATE_ID_3 = "35333333-3333-4333-8333-333333333333";
const CANDIDATE_ID_UNMAPPED = "36333333-3333-4333-8333-333333333333";
const PERSONA_ID_1 = "44444444-4444-4444-8444-444444444444";
const PERSONA_ID_2 = "45444444-4444-4444-8444-444444444444";
const PERSONA_ID_3 = "46444444-4444-4444-8444-444444444444";
const RUN_ID = "55555555-5555-4555-8555-555555555555";
const RELATION_ID_1 = "66666666-6666-4666-8666-666666666666";
const RELATION_ID_2 = "67666666-6666-4666-8666-666666666666";
const RELATION_ID_3 = "68666666-6666-4666-8666-666666666666";
const RELATION_ID_4 = "69666666-6666-4666-8666-666666666666";
const RELATION_ID_5 = "70666666-6666-4666-8666-666666666666";
const RELATION_ID_6 = "71666666-6666-4666-8666-666666666666";

const OLD_UPDATED_AT = new Date("2026-04-20T00:00:00.000Z");
const NEW_UPDATED_AT = new Date("2026-04-20T00:00:01.000Z");

function relationClaim(
  overrides: Partial<RelationClaimProjectionSourceRow> = {}
): RelationClaimProjectionSourceRow {
  return {
    id                      : RELATION_ID_1,
    bookId                  : BOOK_ID,
    chapterId               : CHAPTER_ID,
    sourcePersonaCandidateId: CANDIDATE_ID_1,
    targetPersonaCandidateId: CANDIDATE_ID_2,
    relationTypeKey         : "ally",
    relationLabel           : "同盟",
    relationTypeSource      : "CUSTOM",
    direction               : "BIDIRECTIONAL",
    effectiveChapterStart   : 43,
    effectiveChapterEnd     : 45,
    timeHintId              : null,
    evidenceSpanIds         : [],
    confidence              : 0.9,
    reviewState             : "ACCEPTED",
    source                  : "AI",
    runId                   : RUN_ID,
    createdAt               : OLD_UPDATED_AT,
    updatedAt               : OLD_UPDATED_AT,
    ...overrides
  };
}

describe("buildRelationshipEdges", () => {
  it("builds accepted relationship edges and merges matching claims", () => {
    const rows = buildRelationshipEdges({
      personaIdByCandidateId: new Map<string, string>([
        [CANDIDATE_ID_1, PERSONA_ID_1],
        [CANDIDATE_ID_2, PERSONA_ID_2]
      ]),
      relationClaims: [
        relationClaim({
          id       : RELATION_ID_1,
          updatedAt: OLD_UPDATED_AT
        }),
        relationClaim({
          id       : RELATION_ID_2,
          updatedAt: NEW_UPDATED_AT
        }),
        relationClaim({
          id         : RELATION_ID_3,
          reviewState: "PENDING"
        }),
        relationClaim({
          id                      : RELATION_ID_4,
          targetPersonaCandidateId: CANDIDATE_ID_UNMAPPED
        }),
        relationClaim({
          id         : RELATION_ID_5,
          reviewState: "REJECTED"
        })
      ]
    });

    expect(rows).toEqual([
      {
        bookId               : BOOK_ID,
        sourcePersonaId      : PERSONA_ID_1,
        targetPersonaId      : PERSONA_ID_2,
        relationTypeKey      : "ally",
        relationLabel        : "同盟",
        relationTypeSource   : "CUSTOM",
        direction            : "BIDIRECTIONAL",
        effectiveChapterStart: 43,
        effectiveChapterEnd  : 45,
        sourceClaimIds       : [RELATION_ID_1, RELATION_ID_2],
        latestClaimId        : RELATION_ID_2
      }
    ]);
  });

  it("skips claims when source or target persona candidate cannot map to final persona", () => {
    const rows = buildRelationshipEdges({
      personaIdByCandidateId: new Map<string, string>([
        [CANDIDATE_ID_1, PERSONA_ID_1],
        [CANDIDATE_ID_2, PERSONA_ID_2]
      ]),
      relationClaims: [
        relationClaim({
          id                      : RELATION_ID_1,
          sourcePersonaCandidateId: CANDIDATE_ID_UNMAPPED
        }),
        relationClaim({
          id                      : RELATION_ID_2,
          targetPersonaCandidateId: CANDIDATE_ID_UNMAPPED
        })
      ]
    });

    expect(rows).toEqual([]);
  });

  it("can select one relation edge by persona pair and relation type", () => {
    const rows = buildRelationshipEdges({
      personaIdByCandidateId: new Map<string, string>([
        [CANDIDATE_ID_1, PERSONA_ID_1],
        [CANDIDATE_ID_2, PERSONA_ID_2]
      ]),
      relationClaims: [
        relationClaim({ relationTypeKey: "ally", relationLabel: "同盟" }),
        relationClaim({
          id             : RELATION_ID_2,
          relationTypeKey: "rival",
          relationLabel  : "敌对"
        })
      ],
      selection: {
        sourcePersonaId: PERSONA_ID_1,
        targetPersonaId: PERSONA_ID_2,
        relationTypeKey: "rival"
      }
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].relationTypeKey).toBe("rival");
  });

  it("does not merge rows across distinct merge-key fields and returns stable sorted output", () => {
    const rows = buildRelationshipEdges({
      personaIdByCandidateId: new Map<string, string>([
        [CANDIDATE_ID_1, PERSONA_ID_1],
        [CANDIDATE_ID_2, PERSONA_ID_2],
        [CANDIDATE_ID_3, PERSONA_ID_3]
      ]),
      relationClaims: [
        relationClaim({
          id                      : RELATION_ID_1,
          bookId                  : BOOK_ID_2,
          sourcePersonaCandidateId: CANDIDATE_ID_2,
          targetPersonaCandidateId: CANDIDATE_ID_3,
          relationTypeKey         : "mentor",
          direction               : "FORWARD",
          effectiveChapterStart   : 10,
          effectiveChapterEnd     : 12
        }),
        relationClaim({
          id                      : RELATION_ID_2,
          bookId                  : BOOK_ID,
          sourcePersonaCandidateId: CANDIDATE_ID_1,
          targetPersonaCandidateId: CANDIDATE_ID_2,
          relationTypeKey         : "ally",
          direction               : "FORWARD",
          effectiveChapterStart   : 1,
          effectiveChapterEnd     : 3
        }),
        relationClaim({
          id                      : RELATION_ID_3,
          bookId                  : BOOK_ID,
          sourcePersonaCandidateId: CANDIDATE_ID_1,
          targetPersonaCandidateId: CANDIDATE_ID_2,
          relationTypeKey         : "ally",
          direction               : "REVERSE",
          effectiveChapterStart   : 1,
          effectiveChapterEnd     : 3
        }),
        relationClaim({
          id                      : RELATION_ID_6,
          bookId                  : BOOK_ID,
          sourcePersonaCandidateId: CANDIDATE_ID_1,
          targetPersonaCandidateId: CANDIDATE_ID_2,
          relationTypeKey         : "ally",
          direction               : "REVERSE",
          effectiveChapterStart   : 2,
          effectiveChapterEnd     : 3
        })
      ]
    });

    expect(rows).toEqual([
      {
        bookId               : BOOK_ID,
        sourcePersonaId      : PERSONA_ID_1,
        targetPersonaId      : PERSONA_ID_2,
        relationTypeKey      : "ally",
        relationLabel        : "同盟",
        relationTypeSource   : "CUSTOM",
        direction            : "FORWARD",
        effectiveChapterStart: 1,
        effectiveChapterEnd  : 3,
        sourceClaimIds       : [RELATION_ID_2],
        latestClaimId        : RELATION_ID_2
      },
      {
        bookId               : BOOK_ID,
        sourcePersonaId      : PERSONA_ID_1,
        targetPersonaId      : PERSONA_ID_2,
        relationTypeKey      : "ally",
        relationLabel        : "同盟",
        relationTypeSource   : "CUSTOM",
        direction            : "REVERSE",
        effectiveChapterStart: 1,
        effectiveChapterEnd  : 3,
        sourceClaimIds       : [RELATION_ID_3],
        latestClaimId        : RELATION_ID_3
      },
      {
        bookId               : BOOK_ID,
        sourcePersonaId      : PERSONA_ID_1,
        targetPersonaId      : PERSONA_ID_2,
        relationTypeKey      : "ally",
        relationLabel        : "同盟",
        relationTypeSource   : "CUSTOM",
        direction            : "REVERSE",
        effectiveChapterStart: 2,
        effectiveChapterEnd  : 3,
        sourceClaimIds       : [RELATION_ID_6],
        latestClaimId        : RELATION_ID_6
      },
      {
        bookId               : BOOK_ID_2,
        sourcePersonaId      : PERSONA_ID_2,
        targetPersonaId      : PERSONA_ID_3,
        relationTypeKey      : "mentor",
        relationLabel        : "同盟",
        relationTypeSource   : "CUSTOM",
        direction            : "FORWARD",
        effectiveChapterStart: 10,
        effectiveChapterEnd  : 12,
        sourceClaimIds       : [RELATION_ID_1],
        latestClaimId        : RELATION_ID_1
      }
    ]);
  });
});
