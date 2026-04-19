/**
 * EvidenceSpan 先在纯函数层完成校验与物化，避免后续 repository / review API
 * 把 segment 越界、expectedText 漂移等问题带入数据库。
 */

import { normalizeTextForEvidence } from "@/server/modules/analysis/evidence/offset-map";

export type EvidenceSpanValidationErrorCode =
  | "BOOK_MISMATCH"
  | "CHAPTER_MISMATCH"
  | "EXPECTED_TEXT_MISMATCH"
  | "INVALID_OFFSET_RANGE"
  | "SEGMENT_MISMATCH"
  | "SEGMENT_TEXT_MISMATCH"
  | "SPAN_OUT_OF_CHAPTER"
  | "SPAN_OUT_OF_SEGMENT";

export class EvidenceSpanValidationError extends Error {
  readonly code: EvidenceSpanValidationErrorCode;

  constructor(code: EvidenceSpanValidationErrorCode, message: string) {
    super(message);
    this.name = "EvidenceSpanValidationError";
    this.code = code;
  }
}

export interface EvidenceSegmentAnchor {
  id            : string;
  bookId        : string;
  chapterId     : string;
  segmentType   : string;
  startOffset   : number;
  endOffset     : number;
  text          : string;
  normalizedText: string;
  speakerHint?  : string | null;
}

export interface EvidenceSpanDraft {
  bookId              : string;
  chapterId           : string;
  segmentId           : string;
  startOffset         : number;
  endOffset           : number;
  expectedText?       : string;
  speakerHint?        : string | null;
  narrativeRegionType?: string;
  createdByRunId      : string;
}

export interface MaterializedEvidenceSpanData {
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
}

export interface ValidateEvidenceSpanInput {
  chapterText: string;
  segment    : EvidenceSegmentAnchor;
  draft      : EvidenceSpanDraft;
}

function assertIntegerOffsetRange(startOffset: number, endOffset: number): void {
  if (
    !Number.isInteger(startOffset) ||
    !Number.isInteger(endOffset) ||
    startOffset < 0 ||
    startOffset >= endOffset
  ) {
    throw new EvidenceSpanValidationError(
      "INVALID_OFFSET_RANGE",
      `Invalid evidence offset range: ${startOffset}-${endOffset}`
    );
  }
}

export function validateEvidenceSpanDraft(
  input: ValidateEvidenceSpanInput
): MaterializedEvidenceSpanData {
  const { chapterText, draft, segment } = input;

  assertIntegerOffsetRange(draft.startOffset, draft.endOffset);

  if (draft.bookId !== segment.bookId) {
    throw new EvidenceSpanValidationError(
      "BOOK_MISMATCH",
      `Evidence span book does not match segment book: ${draft.bookId}`
    );
  }

  if (draft.chapterId !== segment.chapterId) {
    throw new EvidenceSpanValidationError(
      "CHAPTER_MISMATCH",
      `Evidence span chapter does not match segment chapter: ${draft.chapterId}`
    );
  }

  if (draft.segmentId !== segment.id) {
    throw new EvidenceSpanValidationError(
      "SEGMENT_MISMATCH",
      `Evidence span segment does not match anchor segment: ${draft.segmentId}`
    );
  }

  if (draft.endOffset > chapterText.length) {
    throw new EvidenceSpanValidationError(
      "SPAN_OUT_OF_CHAPTER",
      `Evidence span exceeds chapter text length: ${draft.endOffset} > ${chapterText.length}`
    );
  }

  const segmentText = chapterText.slice(segment.startOffset, segment.endOffset);

  if (segmentText !== segment.text) {
    throw new EvidenceSpanValidationError(
      "SEGMENT_TEXT_MISMATCH",
      "Segment text does not match chapter text at segment offsets"
    );
  }

  if (draft.startOffset < segment.startOffset || draft.endOffset > segment.endOffset) {
    throw new EvidenceSpanValidationError(
      "SPAN_OUT_OF_SEGMENT",
      `Evidence span crosses segment bounds: ${draft.startOffset}-${draft.endOffset}`
    );
  }

  const quotedText = chapterText.slice(draft.startOffset, draft.endOffset);

  if (draft.expectedText !== undefined && quotedText !== draft.expectedText) {
    throw new EvidenceSpanValidationError(
      "EXPECTED_TEXT_MISMATCH",
      `Evidence span quote mismatch: expected ${draft.expectedText}, got ${quotedText}`
    );
  }

  return {
    bookId             : draft.bookId,
    chapterId          : draft.chapterId,
    segmentId          : draft.segmentId,
    startOffset        : draft.startOffset,
    endOffset          : draft.endOffset,
    quotedText,
    normalizedText     : normalizeTextForEvidence(quotedText),
    speakerHint        : draft.speakerHint ?? segment.speakerHint ?? null,
    narrativeRegionType: draft.narrativeRegionType ?? segment.segmentType,
    createdByRunId     : draft.createdByRunId
  };
}

export interface EvidenceSpanRow extends MaterializedEvidenceSpanData {
  id        : string;
  createdAt?: Date;
}

export interface EvidenceSpanNaturalKeyWhere {
  bookId        : string;
  chapterId     : string;
  segmentId     : string;
  startOffset   : number;
  endOffset     : number;
  createdByRunId: string;
}

export interface EvidenceSpanLookupInput {
  chapterId?     : string;
  segmentId?     : string;
  createdByRunId?: string;
}

export interface EvidenceSpanPersistenceClient {
  evidenceSpan: {
    create(args: { data: MaterializedEvidenceSpanData }): Promise<EvidenceSpanRow>;
    createMany(args: {
      data          : MaterializedEvidenceSpanData[];
      skipDuplicates: boolean;
    }): Promise<{ count: number }>;
    findFirst(args: { where: EvidenceSpanNaturalKeyWhere }): Promise<EvidenceSpanRow | null>;
    findMany(args: {
      where  : EvidenceSpanLookupInput;
      orderBy: Array<{ startOffset: "asc" } | { endOffset: "asc" }>;
    }): Promise<EvidenceSpanRow[]>;
  };
}

export interface EvidenceSpanCreateClient {
  evidenceSpan: Pick<EvidenceSpanPersistenceClient["evidenceSpan"], "create">;
}

export interface EvidenceSpanCreateManyClient {
  evidenceSpan: Pick<EvidenceSpanPersistenceClient["evidenceSpan"], "createMany">;
}

export interface EvidenceSpanFindOrCreateClient {
  evidenceSpan: Pick<EvidenceSpanPersistenceClient["evidenceSpan"], "create" | "findFirst">;
}

export interface EvidenceSpanListClient {
  evidenceSpan: Pick<EvidenceSpanPersistenceClient["evidenceSpan"], "findMany">;
}

export function toEvidenceSpanNaturalKey(
  data: MaterializedEvidenceSpanData
): EvidenceSpanNaturalKeyWhere {
  return {
    bookId        : data.bookId,
    chapterId     : data.chapterId,
    segmentId     : data.segmentId,
    startOffset   : data.startOffset,
    endOffset     : data.endOffset,
    createdByRunId: data.createdByRunId
  };
}

export async function writeEvidenceSpan(
  prisma: EvidenceSpanCreateClient,
  data: MaterializedEvidenceSpanData
): Promise<EvidenceSpanRow> {
  return prisma.evidenceSpan.create({ data });
}

export async function writeEvidenceSpans(
  prisma: EvidenceSpanCreateManyClient,
  data: MaterializedEvidenceSpanData[]
): Promise<{ count: number }> {
  if (data.length === 0) {
    return { count: 0 };
  }

  return prisma.evidenceSpan.createMany({
    data,
    skipDuplicates: true
  });
}

export async function findOrCreateEvidenceSpan(
  prisma: EvidenceSpanFindOrCreateClient,
  data: MaterializedEvidenceSpanData
): Promise<EvidenceSpanRow> {
  const existing = await prisma.evidenceSpan.findFirst({
    where: toEvidenceSpanNaturalKey(data)
  });

  if (existing) {
    return existing;
  }

  return prisma.evidenceSpan.create({ data });
}

export async function listEvidenceSpans(
  prisma: EvidenceSpanListClient,
  input: EvidenceSpanLookupInput
): Promise<EvidenceSpanRow[]> {
  return prisma.evidenceSpan.findMany({
    where  : input,
    orderBy: [
      { startOffset: "asc" },
      { endOffset: "asc" }
    ]
  });
}
