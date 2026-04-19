import { describe, expect, it } from "vitest";

import {
  STAGE_A_PIPELINE_STAGE,
  STAGE_A_PROMPT_VERSION,
  STAGE_A_STAGE_KEY,
  stageARawEnvelopeSchema,
  stageARelationItemSchema,
  summarizeStageADiscards
} from "@/server/modules/analysis/pipelines/evidence-review/stageA/types";
import { PipelineStage } from "@/types/pipeline";

describe("Stage A type contracts", () => {
  it("keeps the stage constants stable", () => {
    expect(STAGE_A_STAGE_KEY).toBe("stage_a_extraction");
    expect(STAGE_A_PIPELINE_STAGE).toBe(PipelineStage.INDEPENDENT_EXTRACTION);
    expect(STAGE_A_PROMPT_VERSION).toBe("2026-04-19-stage-a-v1");
  });

  it("defaults the raw envelope arrays to empty", () => {
    expect(stageARawEnvelopeSchema.parse({})).toEqual({
      mentions : [],
      times    : [],
      events   : [],
      relations: []
    });
  });

  it("keeps relationTypeKey open for custom strings", () => {
    const parsed = stageARelationItemSchema.parse({
      relationRef          : "relation-1",
      sourceMentionRef     : "mention-1",
      targetMentionRef     : "mention-2",
      relationTypeKey      : "political_patron_of",
      relationLabel        : "政治庇护",
      direction            : "FORWARD",
      effectiveChapterStart: null,
      effectiveChapterEnd  : null,
      confidence           : 0.72,
      evidence             : {
        segmentIndex: 3,
        quotedText  : "荐其为吏"
      }
    });

    expect(parsed.relationTypeKey).toBe("political_patron_of");
    expect(parsed.relationLabel).toBe("政治庇护");
  });

  it("summarizes discard codes deterministically", () => {
    expect(
      summarizeStageADiscards([
        { kind: "MENTION", ref: "m1", code: "QUOTE_NOT_FOUND", message: "missing" },
        {
          kind   : "EVENT",
          ref    : "e1",
          code   : "UNRESOLVED_MENTION_REF",
          message: "missing subject"
        },
        {
          kind   : "RELATION",
          ref    : "r1",
          code   : "QUOTE_NOT_FOUND",
          message: "missing relation quote"
        }
      ])
    ).toBe("QUOTE_NOT_FOUND:2, UNRESOLVED_MENTION_REF:1");
  });
});
