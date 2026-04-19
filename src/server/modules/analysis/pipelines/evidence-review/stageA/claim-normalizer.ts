import { type ZodError } from "zod";

import { prisma } from "@/server/db/prisma";
import type {
  EvidenceSpanFindOrCreateClient,
  EvidenceSpanRow,
  MaterializedEvidenceSpanData
} from "@/server/modules/analysis/evidence/evidence-spans";
import {
  findOrCreateEvidenceSpan,
  validateEvidenceSpanDraft
} from "@/server/modules/analysis/evidence/evidence-spans";
import {
  buildOffsetMap,
  mapNormalizedRangeToOriginalRange,
  normalizeTextForEvidence
} from "@/server/modules/analysis/evidence/offset-map";
import { validateClaimDraftByFamily } from "@/server/modules/analysis/claims/claim-schemas";
import type { PersistedStage0Segment } from "@/server/modules/analysis/pipelines/evidence-review/stage0/repository";
import {
  stageAEventItemSchema,
  stageAMentionItemSchema,
  stageARelationItemSchema,
  stageATimeItemSchema,
  type StageAClaimKind,
  type StageADiscardCode,
  type StageADiscardRecord,
  type StageANormalizedExtraction,
  type StageARawEnvelope
} from "@/server/modules/analysis/pipelines/evidence-review/stageA/types";

export interface StageAEvidenceResolver {
  findOrCreate(data: MaterializedEvidenceSpanData): Promise<EvidenceSpanRow>;
}

export interface NormalizeStageAChapterExtractionInput {
  bookId     : string;
  chapterId  : string;
  chapterNo  : number;
  runId      : string;
  chapterText: string;
  segments   : PersistedStage0Segment[];
  envelope   : StageARawEnvelope;
}

export function createStageAEvidenceResolver(
  client: EvidenceSpanFindOrCreateClient = prisma
): StageAEvidenceResolver {
  return {
    findOrCreate: async (data) => findOrCreateEvidenceSpan(client, data)
  };
}

function buildDiscard(
  kind: StageAClaimKind,
  ref: string,
  code: StageADiscardCode,
  message: string
): StageADiscardRecord {
  return { kind, ref, code, message };
}

function readLocalRef(
  kind: StageAClaimKind,
  index: number,
  raw: unknown,
  field: string
): string {
  if (
    typeof raw === "object"
    && raw !== null
    && field in raw
    && typeof (raw as Record<string, unknown>)[field] === "string"
    && (raw as Record<string, string>)[field].trim().length > 0
  ) {
    return (raw as Record<string, string>)[field].trim();
  }

  return `${kind.toLowerCase()}-${index + 1}`;
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
    .join("; ");
}

function findSegmentByIndex(
  segments: PersistedStage0Segment[],
  segmentIndex: number
): PersistedStage0Segment | null {
  return segments.find((segment) => segment.segmentIndex === segmentIndex) ?? null;
}

function findUniqueQuoteRangeInSegment(
  segmentText: string,
  quotedText: string
): { startOffset: number; endOffset: number } | "NOT_FOUND" | "NOT_UNIQUE" {
  const map = buildOffsetMap(segmentText);
  const normalizedNeedle = normalizeTextForEvidence(quotedText);

  if (normalizedNeedle.length === 0) {
    return "NOT_FOUND";
  }

  const matches: Array<{ startOffset: number; endOffset: number }> = [];
  let fromIndex = 0;

  while (fromIndex <= map.normalizedText.length - normalizedNeedle.length) {
    const normalizedStart = map.normalizedText.indexOf(normalizedNeedle, fromIndex);
    if (normalizedStart < 0) {
      break;
    }

    matches.push(
      mapNormalizedRangeToOriginalRange(
        map,
        normalizedStart,
        normalizedStart + normalizedNeedle.length
      )
    );

    fromIndex = normalizedStart + 1;
  }

  if (matches.length === 0) {
    return "NOT_FOUND";
  }

  if (matches.length > 1) {
    return "NOT_UNIQUE";
  }

  return matches[0];
}

function createEvidenceAnchor(segment: PersistedStage0Segment) {
  return {
    id            : segment.id,
    bookId        : segment.bookId,
    chapterId     : segment.chapterId,
    segmentType   : segment.segmentType,
    startOffset   : segment.startOffset,
    endOffset     : segment.endOffset,
    text          : segment.rawText,
    normalizedText: segment.normalizedText,
    speakerHint   : segment.speakerHint
  };
}

async function materializeEvidence(input: {
  resolver   : StageAEvidenceResolver;
  kind       : StageAClaimKind;
  ref        : string;
  bookId     : string;
  chapterId  : string;
  runId      : string;
  chapterText: string;
  segments   : PersistedStage0Segment[];
  evidence: {
    segmentIndex: number;
    quotedText  : string;
  };
}): Promise<{ evidenceSpanId: string } | StageADiscardRecord> {
  const segment = findSegmentByIndex(input.segments, input.evidence.segmentIndex);
  if (!segment) {
    return buildDiscard(
      input.kind,
      input.ref,
      "SEGMENT_INDEX_OUT_OF_RANGE",
      `segmentIndex ${input.evidence.segmentIndex} does not exist in persisted Stage 0 output`
    );
  }

  const localRange = findUniqueQuoteRangeInSegment(
    segment.rawText,
    input.evidence.quotedText
  );
  if (localRange === "NOT_FOUND") {
    return buildDiscard(
      input.kind,
      input.ref,
      "QUOTE_NOT_FOUND",
      `quotedText not found inside segment ${segment.segmentIndex}: ${input.evidence.quotedText}`
    );
  }

  if (localRange === "NOT_UNIQUE") {
    return buildDiscard(
      input.kind,
      input.ref,
      "QUOTE_NOT_UNIQUE",
      `quotedText is not unique inside segment ${segment.segmentIndex}: ${input.evidence.quotedText}`
    );
  }

  try {
    const materialized = validateEvidenceSpanDraft({
      chapterText: input.chapterText,
      segment    : createEvidenceAnchor(segment),
      draft      : {
        bookId             : input.bookId,
        chapterId          : input.chapterId,
        segmentId          : segment.id,
        startOffset        : segment.startOffset + localRange.startOffset,
        endOffset          : segment.startOffset + localRange.endOffset,
        expectedText       : segment.rawText.slice(localRange.startOffset, localRange.endOffset),
        speakerHint        : segment.speakerHint,
        narrativeRegionType: segment.segmentType,
        createdByRunId     : input.runId
      }
    });

    const evidenceSpan = await input.resolver.findOrCreate(materialized);
    return { evidenceSpanId: evidenceSpan.id };
  } catch (error) {
    return buildDiscard(
      input.kind,
      input.ref,
      "EVIDENCE_VALIDATION_FAILED",
      error instanceof Error ? error.message : String(error)
    );
  }
}

export interface StageAClaimNormalizerDependencies {
  evidenceResolver?: StageAEvidenceResolver;
}

export function createStageAClaimNormalizer(
  dependencies: StageAClaimNormalizerDependencies = {}
) {
  const evidenceResolver =
    dependencies.evidenceResolver ?? createStageAEvidenceResolver();

  async function normalizeChapterExtraction(
    input: NormalizeStageAChapterExtractionInput
  ): Promise<StageANormalizedExtraction> {
    const result: StageANormalizedExtraction = {
      mentionClaims        : [],
      timeClaims           : [],
      pendingEventClaims   : [],
      pendingRelationClaims: [],
      discardRecords       : []
    };

    for (const [index, rawMention] of input.envelope.mentions.entries()) {
      const ref = readLocalRef("MENTION", index, rawMention, "mentionRef");
      const parsed = stageAMentionItemSchema.safeParse(rawMention);
      if (!parsed.success) {
        result.discardRecords.push(
          buildDiscard("MENTION", ref, "SCHEMA_VALIDATION", formatZodError(parsed.error))
        );
        continue;
      }

      const evidence = await materializeEvidence({
        resolver   : evidenceResolver,
        kind       : "MENTION",
        ref,
        bookId     : input.bookId,
        chapterId  : input.chapterId,
        runId      : input.runId,
        chapterText: input.chapterText,
        segments   : input.segments,
        evidence   : parsed.data.evidence
      });

      if ("code" in evidence) {
        result.discardRecords.push(evidence);
        continue;
      }

      result.mentionClaims.push({
        ref,
        draft: validateClaimDraftByFamily("ENTITY_MENTION", {
          claimFamily              : "ENTITY_MENTION",
          bookId                   : input.bookId,
          chapterId                : input.chapterId,
          runId                    : input.runId,
          source                   : "AI",
          confidence               : parsed.data.confidence,
          surfaceText              : parsed.data.surfaceText,
          mentionKind              : parsed.data.mentionKind,
          identityClaim            : parsed.data.identityClaim,
          aliasTypeHint            : parsed.data.aliasTypeHint,
          speakerPersonaCandidateId: null,
          suspectedResolvesTo      : null,
          evidenceSpanId           : evidence.evidenceSpanId
        })
      });
    }

    for (const [index, rawTime] of input.envelope.times.entries()) {
      const ref = readLocalRef("TIME", index, rawTime, "timeRef");
      const parsed = stageATimeItemSchema.safeParse(rawTime);
      if (!parsed.success) {
        result.discardRecords.push(
          buildDiscard("TIME", ref, "SCHEMA_VALIDATION", formatZodError(parsed.error))
        );
        continue;
      }

      const evidence = await materializeEvidence({
        resolver   : evidenceResolver,
        kind       : "TIME",
        ref,
        bookId     : input.bookId,
        chapterId  : input.chapterId,
        runId      : input.runId,
        chapterText: input.chapterText,
        segments   : input.segments,
        evidence   : parsed.data.evidence
      });

      if ("code" in evidence) {
        result.discardRecords.push(evidence);
        continue;
      }

      result.timeClaims.push({
        ref,
        draft: validateClaimDraftByFamily("TIME", {
          claimFamily        : "TIME",
          bookId             : input.bookId,
          chapterId          : input.chapterId,
          runId              : input.runId,
          source             : "AI",
          reviewState        : "PENDING",
          createdByUserId    : null,
          reviewedByUserId   : null,
          reviewNote         : null,
          supersedesClaimId  : null,
          derivedFromClaimId : null,
          evidenceSpanIds    : [evidence.evidenceSpanId],
          confidence         : parsed.data.confidence,
          rawTimeText        : parsed.data.rawTimeText,
          timeType           : parsed.data.timeType,
          normalizedLabel    : parsed.data.normalizedLabel,
          relativeOrderWeight: parsed.data.relativeOrderWeight,
          chapterRangeStart  : parsed.data.chapterRangeStart,
          chapterRangeEnd    : parsed.data.chapterRangeEnd
        })
      });
    }

    for (const [index, rawEvent] of input.envelope.events.entries()) {
      const ref = readLocalRef("EVENT", index, rawEvent, "eventRef");
      const parsed = stageAEventItemSchema.safeParse(rawEvent);
      if (!parsed.success) {
        result.discardRecords.push(
          buildDiscard("EVENT", ref, "SCHEMA_VALIDATION", formatZodError(parsed.error))
        );
        continue;
      }

      const evidence = await materializeEvidence({
        resolver   : evidenceResolver,
        kind       : "EVENT",
        ref,
        bookId     : input.bookId,
        chapterId  : input.chapterId,
        runId      : input.runId,
        chapterText: input.chapterText,
        segments   : input.segments,
        evidence   : parsed.data.evidence
      });

      if ("code" in evidence) {
        result.discardRecords.push(evidence);
        continue;
      }

      result.pendingEventClaims.push({
        ref,
        subjectMentionRef: parsed.data.subjectMentionRef,
        timeRef          : parsed.data.timeRef,
        draft            : validateClaimDraftByFamily("EVENT", {
          claimFamily              : "EVENT",
          bookId                   : input.bookId,
          chapterId                : input.chapterId,
          runId                    : input.runId,
          source                   : "AI",
          reviewState              : "PENDING",
          createdByUserId          : null,
          reviewedByUserId         : null,
          reviewNote               : null,
          supersedesClaimId        : null,
          derivedFromClaimId       : null,
          evidenceSpanIds          : [evidence.evidenceSpanId],
          confidence               : parsed.data.confidence,
          subjectMentionId         : null,
          subjectPersonaCandidateId: null,
          predicate                : parsed.data.predicate,
          objectText               : parsed.data.objectText,
          objectPersonaCandidateId : null,
          locationText             : parsed.data.locationText,
          timeHintId               : null,
          eventCategory            : parsed.data.eventCategory,
          narrativeLens            : parsed.data.narrativeLens
        })
      });
    }

    for (const [index, rawRelation] of input.envelope.relations.entries()) {
      const ref = readLocalRef("RELATION", index, rawRelation, "relationRef");
      const parsed = stageARelationItemSchema.safeParse(rawRelation);
      if (!parsed.success) {
        result.discardRecords.push(
          buildDiscard("RELATION", ref, "SCHEMA_VALIDATION", formatZodError(parsed.error))
        );
        continue;
      }

      const evidence = await materializeEvidence({
        resolver   : evidenceResolver,
        kind       : "RELATION",
        ref,
        bookId     : input.bookId,
        chapterId  : input.chapterId,
        runId      : input.runId,
        chapterText: input.chapterText,
        segments   : input.segments,
        evidence   : parsed.data.evidence
      });

      if ("code" in evidence) {
        result.discardRecords.push(evidence);
        continue;
      }

      result.pendingRelationClaims.push({
        ref,
        sourceMentionRef: parsed.data.sourceMentionRef,
        targetMentionRef: parsed.data.targetMentionRef,
        timeRef         : parsed.data.timeRef,
        draft           : validateClaimDraftByFamily("RELATION", {
          claimFamily             : "RELATION",
          bookId                  : input.bookId,
          chapterId               : input.chapterId,
          runId                   : input.runId,
          source                  : "AI",
          reviewState             : "PENDING",
          createdByUserId         : null,
          reviewedByUserId        : null,
          reviewNote              : null,
          supersedesClaimId       : null,
          derivedFromClaimId      : null,
          evidenceSpanIds         : [evidence.evidenceSpanId],
          confidence              : parsed.data.confidence,
          sourceMentionId         : null,
          targetMentionId         : null,
          sourcePersonaCandidateId: null,
          targetPersonaCandidateId: null,
          relationTypeKey         : parsed.data.relationTypeKey,
          relationLabel           : parsed.data.relationLabel,
          relationTypeSource      : "CUSTOM",
          direction               : parsed.data.direction,
          effectiveChapterStart   : parsed.data.effectiveChapterStart,
          effectiveChapterEnd     : parsed.data.effectiveChapterEnd,
          timeHintId              : null
        })
      });
    }

    return result;
  }

  return {
    normalizeChapterExtraction
  };
}

export type StageAClaimNormalizer = ReturnType<typeof createStageAClaimNormalizer>;
