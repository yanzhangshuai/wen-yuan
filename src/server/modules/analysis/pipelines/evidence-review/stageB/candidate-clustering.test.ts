import { describe, expect, it } from "vitest";

import { buildStageBCandidateClusters } from "@/server/modules/analysis/pipelines/evidence-review/stageB/candidate-clustering";
import type {
  StageBAliasClaimRow,
  StageBMentionRow
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

const BOOK_ID = "11111111-1111-1111-1111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";

function mention(overrides: Partial<StageBMentionRow> = {}): StageBMentionRow {
  return {
    id                 : "mention-1",
    bookId             : BOOK_ID,
    chapterId          : "chapter-1",
    chapterNo          : 1,
    runId              : RUN_ID,
    surfaceText        : "范进",
    mentionKind        : "NAMED",
    identityClaim      : "SELF",
    aliasTypeHint      : null,
    suspectedResolvesTo: null,
    evidenceSpanId     : "evidence-1",
    confidence         : 0.88,
    source             : "AI",
    ...overrides
  };
}

function aliasClaim(overrides: Partial<StageBAliasClaimRow> = {}): StageBAliasClaimRow {
  return {
    id             : "alias-1",
    bookId         : BOOK_ID,
    chapterId      : "chapter-1",
    runId          : RUN_ID,
    aliasText      : "范老爷",
    aliasType      : "TITLE",
    claimKind      : "TITLE_OF",
    evidenceSpanIds: ["alias-evidence-1"],
    confidence     : 0.9,
    reviewState    : "PENDING",
    source         : "RULE",
    reviewNote     : "KB_VERIFIED: knowledgeId=knowledge-1; aliasText=范老爷; canonicalName=范进",
    ...overrides
  };
}

describe("buildStageBCandidateClusters", () => {
  it("merges repeated named mentions by exact surface", () => {
    const clusters = buildStageBCandidateClusters({
      mentions: [
        mention({ id: "mention-1", chapterNo: 1 }),
        mention({ id: "mention-2", chapterId: "chapter-2", chapterNo: 3, confidence: 0.91 })
      ],
      aliasClaims: []
    });

    expect(clusters).toHaveLength(1);
    expect(clusters[0]).toEqual(expect.objectContaining({
      supportReasons: ["EXACT_NAMED_SURFACE"]
    }));
    expect(clusters[0]?.mentions.map((item) => item.id)).toEqual(["mention-1", "mention-2"]);
  });

  it("uses positive alias hints to merge title-only mentions into a named candidate", () => {
    const clusters = buildStageBCandidateClusters({
      mentions: [
        mention({ id: "mention-1", surfaceText: "范进", mentionKind: "NAMED" }),
        mention({
          id            : "mention-2",
          surfaceText   : "范老爷",
          mentionKind   : "TITLE_ONLY",
          source        : "RULE",
          chapterId     : "chapter-2",
          chapterNo     : 4,
          evidenceSpanId: "evidence-2"
        })
      ],
      aliasClaims: [aliasClaim()]
    });

    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.canonicalHints).toEqual(["范进"]);
    expect(clusters[0]?.supportReasons).toContain("KB_ALIAS_EQUIVALENCE");
  });

  it("does not auto-merge title-only mentions by bare surface text", () => {
    const clusters = buildStageBCandidateClusters({
      mentions: [
        mention({ id: "mention-1", surfaceText: "张老爷", mentionKind: "TITLE_ONLY", source: "AI" }),
        mention({
          id            : "mention-2",
          surfaceText   : "张老爷",
          mentionKind   : "TITLE_ONLY",
          chapterId     : "chapter-2",
          chapterNo     : 6,
          evidenceSpanId: "evidence-2"
        })
      ],
      aliasClaims: []
    });

    expect(clusters).toHaveLength(2);
    expect(clusters.every((cluster) => cluster.blockReasons.includes("TITLE_ONLY_AMBIGUITY"))).toBe(true);
  });

  it("keeps separate when a negative alias rule blocks the canonical merge", () => {
    const clusters = buildStageBCandidateClusters({
      mentions: [
        mention({ id: "mention-1", surfaceText: "牛浦", chapterNo: 1 }),
        mention({
          id            : "mention-2",
          surfaceText   : "牛布衣",
          mentionKind   : "NAMED",
          chapterId     : "chapter-2",
          chapterNo     : 12,
          evidenceSpanId: "evidence-2"
        })
      ],
      aliasClaims: [
        aliasClaim({
          aliasText : "牛布衣",
          reviewNote: "KB_VERIFIED: knowledgeId=knowledge-2; aliasText=牛布衣; canonicalName=牛浦"
        }),
        aliasClaim({
          id         : "alias-2",
          aliasText  : "牛布衣",
          claimKind  : "UNSURE",
          reviewState: "CONFLICTED",
          reviewNote : "KB_ALIAS_NEGATIVE: knowledgeId=knowledge-3; aliasText=牛布衣; blockedCanonicalNames=牛浦; reason=冒名链路"
        })
      ]
    });

    expect(clusters).toHaveLength(2);
    expect(clusters[1]?.blockReasons).toContain("NEGATIVE_ALIAS_RULE");
  });

  it("isolates impersonation and misidentification instead of merging them", () => {
    const clusters = buildStageBCandidateClusters({
      mentions: [
        mention({ id: "mention-1", surfaceText: "牛浦", chapterNo: 1 }),
        mention({
          id            : "mention-2",
          surfaceText   : "牛布衣",
          chapterId     : "chapter-2",
          chapterNo     : 14,
          identityClaim : "IMPERSONATING",
          evidenceSpanId: "evidence-2"
        })
      ],
      aliasClaims: [
        aliasClaim({
          aliasText : "牛布衣",
          claimKind : "IMPERSONATES",
          reviewNote: "KB_VERIFIED: knowledgeId=knowledge-4; aliasText=牛布衣; canonicalName=牛浦"
        })
      ]
    });

    expect(clusters).toHaveLength(2);
    expect(clusters[1]?.blockReasons).toContain("IMPERSONATION");
  });

  it("isolates misidentification instead of turning it into a merge hint", () => {
    const clusters = buildStageBCandidateClusters({
      mentions: [
        mention({ id: "mention-1", surfaceText: "张静斋", chapterNo: 1 }),
        mention({
          id            : "mention-2",
          surfaceText   : "张老爷",
          mentionKind   : "TITLE_ONLY",
          chapterId     : "chapter-2",
          chapterNo     : 10,
          evidenceSpanId: "evidence-2"
        })
      ],
      aliasClaims: [
        aliasClaim({
          aliasText : "张老爷",
          claimKind : "MISIDENTIFIED_AS",
          reviewNote: "KB_VERIFIED: knowledgeId=knowledge-5; aliasText=张老爷; canonicalName=张静斋"
        })
      ]
    });

    expect(clusters).toHaveLength(2);
    expect(clusters[1]?.blockReasons).toContain("MISIDENTIFICATION");
    expect(clusters[1]?.supportReasons).not.toContain("KB_ALIAS_EQUIVALENCE");
  });
});
