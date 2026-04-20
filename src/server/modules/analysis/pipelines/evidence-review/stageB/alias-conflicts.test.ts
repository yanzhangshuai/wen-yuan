import { describe, expect, it } from "vitest";

import { collectStageBAliasSignals } from "@/server/modules/analysis/pipelines/evidence-review/stageB/alias-conflicts";
import type { StageBAliasClaimRow } from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

const BOOK_ID = "11111111-1111-1111-1111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";
const CHAPTER_ID = "33333333-3333-3333-3333-333333333333";

function aliasClaim(overrides: Partial<StageBAliasClaimRow> = {}): StageBAliasClaimRow {
  return {
    id             : "44444444-4444-4444-4444-444444444444",
    bookId         : BOOK_ID,
    chapterId      : CHAPTER_ID,
    runId          : RUN_ID,
    aliasText      : "范老爷",
    aliasType      : "TITLE",
    claimKind      : "TITLE_OF",
    evidenceSpanIds: ["55555555-5555-5555-5555-555555555555"],
    confidence     : 0.9,
    reviewState    : "PENDING",
    source         : "RULE",
    reviewNote     : "KB_VERIFIED: knowledgeId=knowledge-1; aliasText=范老爷; canonicalName=范进",
    ...overrides
  };
}

describe("collectStageBAliasSignals", () => {
  it("extracts positive canonical signals from verified and pending notes", () => {
    const signals = collectStageBAliasSignals([
      aliasClaim(),
      aliasClaim({
        id        : "66666666-6666-6666-6666-666666666666",
        aliasText : "周学道",
        reviewNote: "KB_PENDING_HINT: knowledgeId=knowledge-2; aliasText=周学道; canonicalName=周进",
        confidence: 0.55
      })
    ]);

    expect(signals.positiveSignals).toEqual([
      expect.objectContaining({
        aliasText     : "范老爷",
        canonicalName : "范进",
        reviewStrength: "VERIFIED"
      }),
      expect.objectContaining({
        aliasText     : "周学道",
        canonicalName : "周进",
        reviewStrength: "PENDING"
      })
    ]);
  });

  it("extracts negative merge blocks from alias negative notes", () => {
    const signals = collectStageBAliasSignals([
      aliasClaim({
        id         : "77777777-7777-7777-7777-777777777777",
        aliasText  : "牛布衣",
        claimKind  : "UNSURE",
        reviewState: "CONFLICTED",
        reviewNote : "KB_ALIAS_NEGATIVE: knowledgeId=knowledge-3; aliasText=牛布衣; blockedCanonicalNames=牛浦|牛玉圃; reason=冒名链路"
      })
    ]);

    expect(signals.negativeSignals).toEqual([
      expect.objectContaining({
        aliasText            : "牛布衣",
        blockedCanonicalNames: ["牛浦", "牛玉圃"]
      })
    ]);
  });

  it("keeps impersonation and misidentification as conflict-only signals", () => {
    const signals = collectStageBAliasSignals([
      aliasClaim({
        id        : "88888888-8888-8888-8888-888888888888",
        aliasText : "牛布衣",
        claimKind : "IMPERSONATES",
        reviewNote: "KB_VERIFIED: knowledgeId=knowledge-4; aliasText=牛布衣; canonicalName=牛浦"
      }),
      aliasClaim({
        id        : "99999999-9999-9999-9999-999999999999",
        aliasText : "张老爷",
        claimKind : "MISIDENTIFIED_AS",
        reviewNote: "KB_VERIFIED: knowledgeId=knowledge-5; aliasText=张老爷; canonicalName=张静斋"
      })
    ]);

    expect(signals.impersonationAliasTexts).toEqual(new Set(["牛布衣"]));
    expect(signals.misidentifiedAliasTexts).toEqual(new Set(["张老爷"]));
    expect(signals.positiveSignals).toHaveLength(0);
  });

  it("ignores KB_VERIFIED positive signals when reviewState is REJECTED", () => {
    const signals = collectStageBAliasSignals([
      aliasClaim({
        id         : "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        reviewState: "REJECTED",
        reviewNote : "KB_VERIFIED: knowledgeId=knowledge-rejected; aliasText=范老爷; canonicalName=范进"
      })
    ]);

    expect(signals.positiveSignals).toHaveLength(0);
  });

  it("ignores KB_ALIAS_NEGATIVE when reviewState is DEFERRED", () => {
    const signals = collectStageBAliasSignals([
      aliasClaim({
        id         : "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
        aliasText  : "牛布衣",
        claimKind  : "UNSURE",
        reviewState: "DEFERRED",
        reviewNote : "KB_ALIAS_NEGATIVE: knowledgeId=knowledge-deferred; aliasText=牛布衣; blockedCanonicalNames=牛浦|牛玉圃; reason=冒名链路"
      })
    ]);

    expect(signals.negativeSignals).toHaveLength(0);
  });

  it("ignores IMPERSONATES conflict signals when reviewState is EDITED", () => {
    const signals = collectStageBAliasSignals([
      aliasClaim({
        id         : "cccccccc-cccc-cccc-cccc-cccccccccccc",
        aliasText  : "牛布衣",
        claimKind  : "IMPERSONATES",
        reviewState: "EDITED",
        reviewNote : "KB_VERIFIED: knowledgeId=knowledge-edited; aliasText=牛布衣; canonicalName=牛浦"
      })
    ]);

    expect(signals.impersonationAliasTexts).toEqual(new Set());
  });
});
