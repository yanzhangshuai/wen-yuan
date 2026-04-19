export const STAGE0_SEGMENT_TYPE_VALUES = [
  "TITLE",
  "NARRATIVE",
  "DIALOGUE_LEAD",
  "DIALOGUE_CONTENT",
  "POEM",
  "COMMENTARY",
  "UNKNOWN"
] as const;

export type Stage0SegmentType = (typeof STAGE0_SEGMENT_TYPE_VALUES)[number];

export type Stage0ChapterConfidence = "HIGH" | "LOW";

export interface Stage0ChapterInput {
  bookId : string;
  runId  : string;
  chapter: {
    id     : string;
    no     : number;
    title  : string;
    content: string;
  };
}

export interface Stage0SegmentDraft {
  bookId        : string;
  chapterId     : string;
  runId         : string;
  segmentIndex  : number;
  segmentType   : Stage0SegmentType;
  startOffset   : number;
  endOffset     : number;
  rawText       : string;
  normalizedText: string;
  confidence    : number;
  speakerHint   : string | null;
}

export interface Stage0LowConfidenceReason {
  code   : "UNKNOWN_RATIO_HIGH" | "OFFSET_VALIDATION_FAILED";
  message: string;
}

export interface Stage0ChapterSegmentationResult {
  bookId              : string;
  chapterId           : string;
  runId               : string;
  chapterNo           : number;
  segments            : Stage0SegmentDraft[];
  confidence          : Stage0ChapterConfidence;
  unknownRatio        : number;
  lowConfidenceReasons: Stage0LowConfidenceReason[];
}

export interface Stage0SegmentRunInput {
  bookId  : string;
  runId   : string | null;
  attempt?: number;
  chapters: Array<{
    id     : string;
    no     : number;
    title  : string;
    content: string;
  }>;
}

export interface Stage0SegmentRunResult {
  bookId        : string;
  runId         : string | null;
  stageRunId    : string | null;
  inputCount    : number;
  outputCount   : number;
  skippedCount  : number;
  chapterResults: Stage0ChapterSegmentationResult[];
}

export class Stage0SegmentOffsetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Stage0SegmentOffsetError";
  }
}

export function assertStage0SegmentOffsets(input: {
  chapterText: string;
  startOffset: number;
  endOffset  : number;
  rawText    : string;
}): void {
  if (
    !Number.isInteger(input.startOffset)
    || !Number.isInteger(input.endOffset)
    || input.startOffset < 0
    || input.endOffset <= input.startOffset
    || input.endOffset > input.chapterText.length
  ) {
    throw new Stage0SegmentOffsetError(
      `Invalid Stage 0 segment offsets: ${input.startOffset}-${input.endOffset}`
    );
  }

  const actual = input.chapterText.slice(input.startOffset, input.endOffset);
  if (actual !== input.rawText) {
    throw new Stage0SegmentOffsetError(
      `Stage 0 segment ${input.startOffset}-${input.endOffset} does not match chapter text`
    );
  }
}

export function calculateStage0ChapterConfidence(input: {
  unknownRatio: number;
}): Stage0ChapterConfidence {
  return input.unknownRatio > 0.10 ? "LOW" : "HIGH";
}
