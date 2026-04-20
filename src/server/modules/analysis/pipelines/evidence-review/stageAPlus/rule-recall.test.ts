import { describe, expect, it, vi } from "vitest";

import { createStageAPlusRuleRecall } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/rule-recall";
import type { StageAPlusCompiledKnowledge } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/types";
import type { PersistedStage0Segment } from "@/server/modules/analysis/pipelines/evidence-review/stage0/repository";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";

function buildSegment(rawText: string): PersistedStage0Segment {
  return {
    id            : "44444444-4444-4444-8444-444444444444",
    bookId        : BOOK_ID,
    chapterId     : CHAPTER_ID,
    runId         : RUN_ID,
    segmentIndex  : 0,
    segmentType   : "NARRATIVE",
    startOffset   : 0,
    endOffset     : rawText.length,
    rawText,
    normalizedText: rawText,
    confidence    : 0.95,
    speakerHint   : null
  };
}

function baseKnowledge(overrides: Partial<StageAPlusCompiledKnowledge>): StageAPlusCompiledKnowledge {
  return {
    aliasEquivalenceRules: [],
    aliasNegativeRules   : [],
    termRules            : [],
    surnameRules         : [],
    relationMappings     : [],
    relationTaxonomyRules: [],
    relationNegativeRules: [],
    ...overrides
  };
}

describe("Stage A+ rule recall", () => {
  it("creates verified alias mention and alias claims with evidence", async () => {
    const evidenceResolver = {
      findOrCreate: vi.fn().mockResolvedValue({
        id: "55555555-5555-4555-8555-555555555555"
      })
    };
    const recall = createStageAPlusRuleRecall({ evidenceResolver });

    const result = await recall.recallChapterClaims({
      bookId     : BOOK_ID,
      chapterId  : CHAPTER_ID,
      chapterNo  : 1,
      runId      : RUN_ID,
      chapterText: "范老爷进了学。",
      segments   : [buildSegment("范老爷进了学。")],
      knowledge  : baseKnowledge({
        aliasEquivalenceRules: [
          {
            id            : "alias-kb-1",
            reviewState   : "VERIFIED",
            confidence    : 0.91,
            canonicalName : "范进",
            aliasTexts    : ["范老爷"],
            aliasTypeHints: ["TITLE"],
            note          : null,
            item          : {} as never
          }
        ]
      })
    });

    expect(result.mentionDrafts[0]).toMatchObject({
      claimFamily  : "ENTITY_MENTION",
      surfaceText  : "范老爷",
      mentionKind  : "TITLE_ONLY",
      aliasTypeHint: "TITLE",
      source       : "RULE"
    });
    expect(result.aliasDrafts[0]).toMatchObject({
      claimFamily: "ALIAS",
      aliasText  : "范老爷",
      aliasType  : "TITLE",
      claimKind  : "TITLE_OF",
      source     : "RULE",
      reviewState: "PENDING"
    });
    expect(evidenceResolver.findOrCreate).toHaveBeenCalled();
  });

  it("turns pending alias knowledge into low-confidence hints", async () => {
    const recall = createStageAPlusRuleRecall({
      evidenceResolver: {
        findOrCreate: vi.fn().mockResolvedValue({ id: "55555555-5555-4555-8555-555555555555" })
      }
    });

    const result = await recall.recallChapterClaims({
      bookId     : BOOK_ID,
      chapterId  : CHAPTER_ID,
      chapterNo  : 1,
      runId      : RUN_ID,
      chapterText: "范贤婿来了。",
      segments   : [buildSegment("范贤婿来了。")],
      knowledge  : baseKnowledge({
        aliasEquivalenceRules: [
          {
            id            : "pending-alias",
            reviewState   : "PENDING",
            confidence    : 0.55,
            canonicalName : "范进",
            aliasTexts    : ["范贤婿"],
            aliasTypeHints: ["NICKNAME"],
            note          : null,
            item          : {} as never
          }
        ]
      })
    });

    expect(result.aliasDrafts[0]).toMatchObject({
      confidence: 0.55,
      reviewNote: expect.stringContaining("KB_PENDING_HINT")
    });
  });

  it("emits negative alias knowledge as a conflicted alias claim", async () => {
    const recall = createStageAPlusRuleRecall({
      evidenceResolver: {
        findOrCreate: vi.fn().mockResolvedValue({ id: "55555555-5555-4555-8555-555555555555" })
      }
    });

    const result = await recall.recallChapterClaims({
      bookId     : BOOK_ID,
      chapterId  : CHAPTER_ID,
      chapterNo  : 1,
      runId      : RUN_ID,
      chapterText: "牛布衣在庵中。",
      segments   : [buildSegment("牛布衣在庵中。")],
      knowledge  : baseKnowledge({
        aliasNegativeRules: [
          {
            id                   : "deny-alias",
            reviewState          : "VERIFIED",
            confidence           : 0.92,
            aliasText            : "牛布衣",
            blockedCanonicalNames: ["牛浦郎"],
            reason               : "冒名不是同人别名",
            item                 : {} as never
          }
        ]
      })
    });

    expect(result.aliasDrafts[0]).toMatchObject({
      aliasText  : "牛布衣",
      aliasType  : "UNSURE",
      claimKind  : "UNSURE",
      reviewState: "CONFLICTED",
      reviewNote : expect.stringContaining("KB_ALIAS_NEGATIVE")
    });
  });

  it("recalls conservative surname-title composed mentions", async () => {
    const recall = createStageAPlusRuleRecall({
      evidenceResolver: {
        findOrCreate: vi.fn().mockResolvedValue({ id: "55555555-5555-4555-8555-555555555555" })
      }
    });

    const result = await recall.recallChapterClaims({
      bookId     : BOOK_ID,
      chapterId  : CHAPTER_ID,
      chapterNo  : 1,
      runId      : RUN_ID,
      chapterText: "王老爷说道。",
      segments   : [buildSegment("王老爷说道。")],
      knowledge  : baseKnowledge({
        surnameRules: [
          {
            id             : "surname-wang",
            reviewState    : "VERIFIED",
            confidence     : 0.9,
            term           : "王",
            normalizedLabel: "王",
            aliasTypeHint  : "NAMED",
            mentionKind    : "NAMED",
            item           : {} as never
          }
        ],
        termRules: [
          {
            id             : "title-laoye",
            reviewState    : "VERIFIED",
            confidence     : 0.9,
            term           : "老爷",
            normalizedLabel: "老爷",
            aliasTypeHint  : "TITLE",
            mentionKind    : "TITLE_ONLY",
            item           : {} as never
          }
        ]
      })
    });

    expect(result.mentionDrafts[0]).toMatchObject({
      surfaceText  : "王老爷",
      mentionKind  : "TITLE_ONLY",
      aliasTypeHint: "TITLE"
    });
  });

  it("discards ambiguous exact evidence instead of creating unsupported claims", async () => {
    const recall = createStageAPlusRuleRecall({
      evidenceResolver: {
        findOrCreate: vi.fn()
      }
    });

    const result = await recall.recallChapterClaims({
      bookId     : BOOK_ID,
      chapterId  : CHAPTER_ID,
      chapterNo  : 1,
      runId      : RUN_ID,
      chapterText: "范老爷见范老爷。",
      segments   : [buildSegment("范老爷见范老爷。")],
      knowledge  : baseKnowledge({
        aliasEquivalenceRules: [
          {
            id            : "alias-kb-1",
            reviewState   : "VERIFIED",
            confidence    : 0.91,
            canonicalName : "范进",
            aliasTexts    : ["范老爷"],
            aliasTypeHints: ["TITLE"],
            note          : null,
            item          : {} as never
          }
        ]
      })
    });

    expect(result.mentionDrafts).toHaveLength(0);
    expect(result.discardRecords[0]).toMatchObject({
      code: "QUOTE_NOT_UNIQUE"
    });
  });
});
