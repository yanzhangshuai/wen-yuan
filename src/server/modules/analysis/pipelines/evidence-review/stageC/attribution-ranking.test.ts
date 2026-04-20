import { describe, expect, it } from "vitest";

import { rankFactAttributionCandidates } from "@/server/modules/analysis/pipelines/evidence-review/stageC/attribution-ranking";
import type {
  StageCConflictFlagRow,
  StageCPersonaCandidateRow
} from "@/server/modules/analysis/pipelines/evidence-review/stageC/types";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const CANDIDATE_ID_1 = "33333333-3333-4333-8333-333333333333";
const CANDIDATE_ID_2 = "44444444-4444-4444-8444-444444444444";
const EVIDENCE_ID_1 = "55555555-5555-4555-8555-555555555555";
const CONFLICT_ID_1 = "66666666-6666-4666-8666-666666666666";

function candidate(
  overrides: Partial<StageCPersonaCandidateRow> = {}
): StageCPersonaCandidateRow {
  return {
    id                : CANDIDATE_ID_1,
    bookId            : BOOK_ID,
    runId             : RUN_ID,
    canonicalLabel    : "范进",
    firstSeenChapterNo: 1,
    lastSeenChapterNo : 20,
    mentionCount      : 10,
    evidenceScore     : 0.9,
    ...overrides
  };
}

function conflictFlag(
  overrides: Partial<StageCConflictFlagRow> = {}
): StageCConflictFlagRow {
  return {
    id                        : CONFLICT_ID_1,
    bookId                    : BOOK_ID,
    chapterId                 : null,
    runId                     : RUN_ID,
    conflictType              : "ALIAS_CONFLICT",
    severity                  : "HIGH",
    relatedClaimKind          : "EVENT",
    relatedClaimIds           : [],
    relatedPersonaCandidateIds: [],
    relatedChapterIds         : [],
    evidenceSpanIds           : [EVIDENCE_ID_1],
    reviewState               : "CONFLICTED",
    source                    : "RULE",
    ...overrides
  };
}

describe("stageC/attribution-ranking", () => {
  it("keeps a direct persona candidate as the strongest attribution", () => {
    const ranked = rankFactAttributionCandidates({
      directPersonaCandidateId: CANDIDATE_ID_1,
      evidenceSpanIds         : [EVIDENCE_ID_1],
      personaCandidates       : [
        candidate({ id: CANDIDATE_ID_1 }),
        candidate({ id: CANDIDATE_ID_2, canonicalLabel: "张静斋" })
      ],
      conflictFlags: []
    });

    expect(ranked).toEqual([
      expect.objectContaining({
        personaCandidateId: CANDIDATE_ID_1,
        rank              : 1,
        reviewState       : "PENDING"
      })
    ]);
  });

  it("preserves multiple plausible alternatives when evidence overlaps conflict flags", () => {
    const ranked = rankFactAttributionCandidates({
      directPersonaCandidateId: CANDIDATE_ID_1,
      evidenceSpanIds         : [EVIDENCE_ID_1],
      personaCandidates       : [
        candidate({ id: CANDIDATE_ID_1 }),
        candidate({ id: CANDIDATE_ID_2, canonicalLabel: "张静斋" })
      ],
      conflictFlags: [
        conflictFlag({
          relatedPersonaCandidateIds: [CANDIDATE_ID_2],
          evidenceSpanIds           : [EVIDENCE_ID_1]
        })
      ]
    });

    expect(ranked.map((row) => row.personaCandidateId)).toEqual([
      CANDIDATE_ID_1,
      CANDIDATE_ID_2
    ]);
    expect(ranked[1]).toEqual(expect.objectContaining({
      reviewState    : "CONFLICTED",
      conflictFlagIds: [CONFLICT_ID_1]
    }));
  });

  it("returns a no-safe-candidate conflicted placeholder when no candidate is defensible", () => {
    const ranked = rankFactAttributionCandidates({
      directPersonaCandidateId: null,
      evidenceSpanIds         : [EVIDENCE_ID_1],
      personaCandidates       : [],
      conflictFlags           : []
    });

    expect(ranked).toEqual([
      expect.objectContaining({
        personaCandidateId: null,
        reviewState       : "CONFLICTED",
        reason            : expect.stringContaining("NO_SAFE_CANDIDATE")
      })
    ]);
  });
});
