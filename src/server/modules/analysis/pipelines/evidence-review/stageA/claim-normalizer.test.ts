import { describe, expect, it } from "vitest";

import { createStageAClaimNormalizer } from "@/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer";
import type { StageARawEnvelope } from "@/server/modules/analysis/pipelines/evidence-review/stageA/types";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";

function createEvidenceResolver() {
  const rows: Array<Record<string, unknown>> = [];

  return {
    rows,
    resolver: {
      async findOrCreate(data: {
        bookId             : string;
        chapterId          : string;
        segmentId          : string;
        startOffset        : number;
        endOffset          : number;
        quotedText         : string;
        normalizedText     : string;
        speakerHint        : string | null;
        narrativeRegionType: string;
        createdByRunId     : string;
      }) {
        const existing = rows.find((row) =>
          row.segmentId === data.segmentId
          && row.startOffset === data.startOffset
          && row.endOffset === data.endOffset
          && row.createdByRunId === data.createdByRunId
        );

        if (existing) {
          return existing as {
            id                 : string;
            bookId             : string;
            chapterId          : string;
            segmentId          : string;
            startOffset        : number;
            endOffset          : number;
            quotedText         : string;
            normalizedText     : string;
            speakerHint        : string | null;
            narrativeRegionType: string;
            createdByRunId     : string;
          };
        }

        const created = {
          id: `00000000-0000-4000-8000-${String(rows.length + 1).padStart(12, "0")}`,
          ...data
        };
        rows.push(created);
        return created;
      }
    }
  };
}

describe("Stage A claim normalizer", () => {
  it("materializes unique evidence and produces validated drafts", async () => {
    const evidenceStore = createEvidenceResolver();
    const normalizer = createStageAClaimNormalizer({
      evidenceResolver: evidenceStore.resolver
    });

    const result = await normalizer.normalizeChapterExtraction({
      bookId     : BOOK_ID,
      chapterId  : CHAPTER_ID,
      chapterNo  : 1,
      runId      : RUN_ID,
      chapterText: "王冕道：“明日再谈。”次日秦老来访。",
      segments   : [
        {
          id            : "44444444-4444-4444-8444-444444444441",
          bookId        : BOOK_ID,
          chapterId     : CHAPTER_ID,
          runId         : RUN_ID,
          segmentIndex  : 0,
          segmentType   : "DIALOGUE_LEAD",
          startOffset   : 0,
          endOffset     : 4,
          rawText       : "王冕道：",
          normalizedText: "王冕道：",
          confidence    : 0.95,
          speakerHint   : "王冕"
        },
        {
          id            : "44444444-4444-4444-8444-444444444442",
          bookId        : BOOK_ID,
          chapterId     : CHAPTER_ID,
          runId         : RUN_ID,
          segmentIndex  : 1,
          segmentType   : "DIALOGUE_CONTENT",
          startOffset   : 4,
          endOffset     : 11,
          rawText       : "“明日再谈。”",
          normalizedText: "“明日再谈。”",
          confidence    : 0.95,
          speakerHint   : "王冕"
        },
        {
          id            : "44444444-4444-4444-8444-444444444443",
          bookId        : BOOK_ID,
          chapterId     : CHAPTER_ID,
          runId         : RUN_ID,
          segmentIndex  : 2,
          segmentType   : "NARRATIVE",
          startOffset   : 11,
          endOffset     : 18,
          rawText       : "次日秦老来访。",
          normalizedText: "次日秦老来访。",
          confidence    : 0.95,
          speakerHint   : null
        }
      ],
      envelope: {
        mentions: [
          {
            mentionRef : "m1",
            surfaceText: "王冕",
            mentionKind: "NAMED",
            confidence : 0.9,
            evidence   : { segmentIndex: 0, quotedText: "王冕" }
          },
          {
            mentionRef : "m2",
            surfaceText: "秦老",
            mentionKind: "NAMED",
            confidence : 0.85,
            evidence   : { segmentIndex: 2, quotedText: "秦老" }
          }
        ],
        times: [
          {
            timeRef        : "t1",
            rawTimeText    : "次日",
            timeType       : "RELATIVE_PHASE",
            normalizedLabel: "次日",
            confidence     : 0.7,
            evidence       : { segmentIndex: 2, quotedText: "次日" }
          }
        ],
        events: [
          {
            eventRef         : "e1",
            subjectMentionRef: "m1",
            predicate        : "发言",
            objectText       : "明日再谈",
            narrativeLens    : "QUOTED",
            eventCategory    : "EVENT",
            confidence       : 0.8,
            evidence         : { segmentIndex: 1, quotedText: "明日再谈" }
          }
        ],
        relations: [
          {
            relationRef     : "r1",
            sourceMentionRef: "m1",
            targetMentionRef: "m2",
            relationTypeKey : "host_of",
            relationLabel   : "接待",
            direction       : "FORWARD",
            confidence      : 0.65,
            evidence        : { segmentIndex: 2, quotedText: "秦老来访" }
          }
        ]
      } satisfies StageARawEnvelope
    });

    expect(result.mentionClaims).toHaveLength(2);
    expect(result.timeClaims).toHaveLength(1);
    expect(result.pendingEventClaims).toHaveLength(1);
    expect(result.pendingRelationClaims).toHaveLength(1);
    expect(result.pendingEventClaims[0].subjectMentionRef).toBe("m1");
    expect(result.pendingRelationClaims[0].draft.relationTypeSource).toBe("CUSTOM");
    expect(result.discardRecords).toEqual([]);
    expect(evidenceStore.rows).toHaveLength(5);
  });

  it("discards items when quotedText is not unique inside the selected segment", async () => {
    const normalizer = createStageAClaimNormalizer({
      evidenceResolver: createEvidenceResolver().resolver
    });

    const result = await normalizer.normalizeChapterExtraction({
      bookId     : BOOK_ID,
      chapterId  : CHAPTER_ID,
      chapterNo  : 1,
      runId      : RUN_ID,
      chapterText: "众人皆道：“好。”又道：“好。”",
      segments   : [
        {
          id            : "44444444-4444-4444-8444-444444444451",
          bookId        : BOOK_ID,
          chapterId     : CHAPTER_ID,
          runId         : RUN_ID,
          segmentIndex  : 0,
          segmentType   : "DIALOGUE_CONTENT",
          startOffset   : 0,
          endOffset     : 16,
          rawText       : "众人皆道：“好。”又道：“好。”",
          normalizedText: "众人皆道：“好。”又道：“好。”",
          confidence    : 0.95,
          speakerHint   : null
        }
      ],
      envelope: {
        mentions: [
          {
            mentionRef : "m1",
            surfaceText: "好",
            mentionKind: "UNKNOWN",
            confidence : 0.2,
            evidence   : { segmentIndex: 0, quotedText: "好" }
          }
        ],
        times    : [],
        events   : [],
        relations: []
      }
    });

    expect(result.mentionClaims).toEqual([]);
    expect(result.discardRecords).toEqual([
      {
        kind   : "MENTION",
        ref    : "m1",
        code   : "QUOTE_NOT_UNIQUE",
        message: expect.stringContaining("quotedText is not unique")
      }
    ]);
  });

  it("performs item-level schema validation without dropping the whole chapter", async () => {
    const normalizer = createStageAClaimNormalizer({
      evidenceResolver: createEvidenceResolver().resolver
    });

    const result = await normalizer.normalizeChapterExtraction({
      bookId     : BOOK_ID,
      chapterId  : CHAPTER_ID,
      chapterNo  : 1,
      runId      : RUN_ID,
      chapterText: "王冕道：“明日再谈。”",
      segments   : [
        {
          id            : "44444444-4444-4444-8444-444444444461",
          bookId        : BOOK_ID,
          chapterId     : CHAPTER_ID,
          runId         : RUN_ID,
          segmentIndex  : 0,
          segmentType   : "DIALOGUE_LEAD",
          startOffset   : 0,
          endOffset     : 4,
          rawText       : "王冕道：",
          normalizedText: "王冕道：",
          confidence    : 0.95,
          speakerHint   : "王冕"
        },
        {
          id            : "44444444-4444-4444-8444-444444444462",
          bookId        : BOOK_ID,
          chapterId     : CHAPTER_ID,
          runId         : RUN_ID,
          segmentIndex  : 1,
          segmentType   : "DIALOGUE_CONTENT",
          startOffset   : 4,
          endOffset     : 11,
          rawText       : "“明日再谈。”",
          normalizedText: "“明日再谈。”",
          confidence    : 0.95,
          speakerHint   : "王冕"
        }
      ],
      envelope: {
        mentions: [
          {
            mentionRef : "m1",
            surfaceText: "王冕",
            mentionKind: "NAMED",
            confidence : 0.9,
            evidence   : { segmentIndex: 0, quotedText: "王冕" }
          }
        ],
        times    : [],
        events   : [],
        relations: [
          {
            relationRef     : "r1",
            sourceMentionRef: "m1",
            targetMentionRef: "m2",
            relationTypeKey : "friend_of",
            direction       : "FORWARD",
            confidence      : 0.5,
            evidence        : { segmentIndex: 1, quotedText: "明日再谈" }
          }
        ]
      }
    });

    expect(result.mentionClaims).toHaveLength(1);
    expect(result.pendingRelationClaims).toEqual([]);
    expect(result.discardRecords).toEqual([
      {
        kind   : "RELATION",
        ref    : "r1",
        code   : "SCHEMA_VALIDATION",
        message: expect.stringContaining("relationLabel")
      }
    ]);
  });
});
