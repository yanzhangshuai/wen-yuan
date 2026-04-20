import { describe, expect, it } from "vitest";

import { buildStageBResolutionDraftBundle } from "@/server/modules/analysis/pipelines/evidence-review/stageB/resolution-drafts";
import type {
  StageBCandidateCluster,
  StageBMentionRow
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

const BOOK_ID = "11111111-1111-1111-1111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";

function mention(overrides: Partial<StageBMentionRow> = {}): StageBMentionRow {
  return {
    id                 : "11111111-1111-4111-8111-111111111111",
    bookId             : BOOK_ID,
    chapterId          : "33333333-3333-4333-8333-333333333333",
    chapterNo          : 1,
    runId              : RUN_ID,
    surfaceText        : "范进",
    mentionKind        : "NAMED",
    identityClaim      : "SELF",
    aliasTypeHint      : null,
    suspectedResolvesTo: null,
    evidenceSpanId     : "44444444-4444-4444-8444-444444444444",
    confidence         : 0.9,
    source             : "AI",
    ...overrides
  };
}

function cluster(overrides: Partial<StageBCandidateCluster> = {}): StageBCandidateCluster {
  return {
    candidateRef          : "candidate-1",
    mentions              : [mention()],
    canonicalHints        : [],
    supportReasons        : ["EXACT_NAMED_SURFACE"],
    blockReasons          : [],
    supportEvidenceSpanIds: ["55555555-5555-4555-8555-555555555555"],
    mergeConfidence       : 0.88,
    ...overrides
  };
}

describe("buildStageBResolutionDraftBundle", () => {
  it("uses a unique canonical hint as the candidate label and emits RESOLVES_TO", () => {
    const result = buildStageBResolutionDraftBundle({
      bookId  : BOOK_ID,
      runId   : RUN_ID,
      clusters: [
        cluster({
          canonicalHints: ["范进"],
          supportReasons: ["KB_ALIAS_EQUIVALENCE"]
        })
      ]
    });

    expect(result.personaCandidates).toEqual([
      expect.objectContaining({
        candidateRef   : "candidate-1",
        canonicalLabel : "范进",
        candidateStatus: "OPEN"
      })
    ]);
    expect(result.identityResolutionDrafts[0]?.draft).toEqual(expect.objectContaining({
      resolutionKind    : "RESOLVES_TO",
      source            : "AI",
      reviewState       : "PENDING",
      personaCandidateId: null,
      resolvedPersonaId : null
    }));
  });

  it("falls back to MERGE_INTO for repeated named-surface evidence without a canonical hint", () => {
    const result = buildStageBResolutionDraftBundle({
      bookId  : BOOK_ID,
      runId   : RUN_ID,
      clusters: [
        cluster({
          mentions: [
            mention({
              id            : "11111111-1111-4111-8111-111111111112",
              chapterNo     : 1,
              evidenceSpanId: "44444444-4444-4444-8444-444444444445"
            }),
            mention({
              id            : "11111111-1111-4111-8111-111111111113",
              chapterId     : "33333333-3333-4333-8333-333333333334",
              chapterNo     : 4,
              evidenceSpanId: "44444444-4444-4444-8444-444444444446"
            })
          ],
          supportReasons : ["EXACT_NAMED_SURFACE"],
          mergeConfidence: 0.74
        })
      ]
    });

    expect(result.identityResolutionDrafts.every((item) => item.draft.resolutionKind === "MERGE_INTO")).toBe(true);
  });

  it("emits SPLIT_FROM for blocked merges", () => {
    const result = buildStageBResolutionDraftBundle({
      bookId  : BOOK_ID,
      runId   : RUN_ID,
      clusters: [
        cluster({
          blockReasons  : ["NEGATIVE_ALIAS_RULE"],
          supportReasons: ["KB_ALIAS_EQUIVALENCE"],
          canonicalHints: ["牛浦"],
          mentions      : [
            mention({
              surfaceText   : "牛布衣",
              evidenceSpanId: "44444444-4444-4444-8444-444444444447"
            })
          ]
        })
      ]
    });

    expect(result.identityResolutionDrafts[0]?.draft).toEqual(expect.objectContaining({
      resolutionKind: "SPLIT_FROM",
      reviewState   : "PENDING"
    }));
  });

  it("emits UNSURE and CONFLICTED for impersonation or misidentification", () => {
    const result = buildStageBResolutionDraftBundle({
      bookId  : BOOK_ID,
      runId   : RUN_ID,
      clusters: [
        cluster({
          blockReasons: ["IMPERSONATION"],
          mentions    : [
            mention({
              surfaceText   : "牛布衣",
              identityClaim : "IMPERSONATING",
              evidenceSpanId: "44444444-4444-4444-8444-444444444448"
            })
          ]
        }),
        cluster({
          candidateRef: "candidate-2",
          blockReasons: ["MISIDENTIFICATION"],
          mentions    : [
            mention({
              id            : "11111111-1111-4111-8111-111111111114",
              surfaceText   : "张老爷",
              mentionKind   : "TITLE_ONLY",
              evidenceSpanId: "44444444-4444-4444-8444-444444444449"
            })
          ]
        })
      ]
    });

    expect(result.identityResolutionDrafts.map((item) => item.draft.reviewState)).toEqual([
      "CONFLICTED",
      "CONFLICTED"
    ]);
    expect(result.identityResolutionDrafts.map((item) => item.draft.resolutionKind)).toEqual([
      "UNSURE",
      "UNSURE"
    ]);
  });

  it("emits UNSURE for unresolved title-only ambiguity instead of a hard split", () => {
    const result = buildStageBResolutionDraftBundle({
      bookId  : BOOK_ID,
      runId   : RUN_ID,
      clusters: [
        cluster({
          blockReasons   : ["TITLE_ONLY_AMBIGUITY"],
          supportReasons : [],
          canonicalHints : [],
          mergeConfidence: 0.41,
          mentions       : [
            mention({
              surfaceText   : "张老爷",
              mentionKind   : "TITLE_ONLY",
              identityClaim : null,
              evidenceSpanId: "44444444-4444-4444-8444-444444444450"
            })
          ]
        })
      ]
    });

    expect(result.identityResolutionDrafts[0]?.draft).toEqual(expect.objectContaining({
      resolutionKind: "UNSURE",
      reviewState   : "CONFLICTED"
    }));
  });

  it("carries mention evidence plus cluster support evidence into each claim", () => {
    const result = buildStageBResolutionDraftBundle({
      bookId  : BOOK_ID,
      runId   : RUN_ID,
      clusters: [
        cluster({
          supportReasons        : ["KB_ALIAS_EQUIVALENCE"],
          supportEvidenceSpanIds: [
            "55555555-5555-4555-8555-555555555555",
            "55555555-5555-4555-8555-555555555556"
          ]
        })
      ]
    });

    expect(result.identityResolutionDrafts[0]?.draft.evidenceSpanIds).toEqual([
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
      "55555555-5555-4555-8555-555555555556"
    ]);
  });
});
