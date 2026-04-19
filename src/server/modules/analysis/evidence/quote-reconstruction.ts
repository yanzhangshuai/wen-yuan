/**
 * Quote reconstruction 是审核台证据跳转的只读层：
 * 输入数据库保存的原始 offset，输出可展示文本、上下文和稳定 anchor。
 */

import { normalizeTextForEvidence } from "@/server/modules/analysis/evidence/offset-map";

export type QuoteReconstructionErrorCode =
  | "CHAPTER_NOT_FOUND"
  | "INVALID_QUOTE_RANGE"
  | "QUOTE_OUT_OF_CHAPTER";

export class QuoteReconstructionError extends Error {
  readonly code: QuoteReconstructionErrorCode;

  constructor(code: QuoteReconstructionErrorCode, message: string) {
    super(message);
    this.name = "QuoteReconstructionError";
    this.code = code;
  }
}

export interface ReconstructQuoteFromTextInput {
  chapterText : string;
  startOffset : number;
  endOffset   : number;
}

export interface ReconstructedQuote {
  startOffset   : number;
  endOffset     : number;
  quotedText    : string;
  normalizedText: string;
}

export interface ChapterTextRow {
  id     : string;
  bookId : string;
  content: string;
}

export type ChapterTextLoader = (chapterId: string) => Promise<ChapterTextRow | null>;

export interface ReconstructQuoteFromChapterInput {
  chapterId  : string;
  startOffset: number;
  endOffset  : number;
}

export interface ReconstructedChapterQuote extends ReconstructedQuote {
  bookId   : string;
  chapterId: string;
}

export interface HighlightedQuoteContextInput extends ReconstructQuoteFromTextInput {
  contextRadius?: number;
}

export interface HighlightedQuoteContext {
  before            : string;
  quote             : string;
  after             : string;
  contextText       : string;
  contextStartOffset: number;
  contextEndOffset  : number;
  highlightStart    : number;
  highlightEnd      : number;
  clippedBefore     : boolean;
  clippedAfter      : boolean;
}

export interface EvidenceJumpMetadataInput {
  bookId        : string;
  chapterId     : string;
  evidenceSpanId: string;
  startOffset   : number;
  endOffset     : number;
  quotedText    : string;
}

export interface EvidenceJumpMetadata {
  bookId        : string;
  chapterId     : string;
  evidenceSpanId: string;
  anchor        : string;
  startOffset   : number;
  endOffset     : number;
  highlightText : string;
}

function assertQuoteRange(chapterText: string, startOffset: number, endOffset: number): void {
  if (
    !Number.isInteger(startOffset) ||
    !Number.isInteger(endOffset) ||
    startOffset < 0 ||
    startOffset >= endOffset
  ) {
    throw new QuoteReconstructionError(
      "INVALID_QUOTE_RANGE",
      `Invalid quote range: ${startOffset}-${endOffset}`
    );
  }

  if (endOffset > chapterText.length) {
    throw new QuoteReconstructionError(
      "QUOTE_OUT_OF_CHAPTER",
      `Quote range exceeds chapter text length: ${endOffset} > ${chapterText.length}`
    );
  }
}

export function reconstructQuoteFromText(input: ReconstructQuoteFromTextInput): ReconstructedQuote {
  assertQuoteRange(input.chapterText, input.startOffset, input.endOffset);

  const quotedText = input.chapterText.slice(input.startOffset, input.endOffset);

  return {
    startOffset   : input.startOffset,
    endOffset     : input.endOffset,
    quotedText,
    normalizedText: normalizeTextForEvidence(quotedText)
  };
}

export async function reconstructQuoteFromChapter(
  input: ReconstructQuoteFromChapterInput,
  loadChapter: ChapterTextLoader
): Promise<ReconstructedChapterQuote> {
  const chapter = await loadChapter(input.chapterId);

  if (!chapter) {
    throw new QuoteReconstructionError(
      "CHAPTER_NOT_FOUND",
      `Chapter not found while reconstructing evidence quote: ${input.chapterId}`
    );
  }

  const quote = reconstructQuoteFromText({
    chapterText : chapter.content,
    startOffset : input.startOffset,
    endOffset   : input.endOffset
  });

  return {
    bookId   : chapter.bookId,
    chapterId: chapter.id,
    ...quote
  };
}

export function buildHighlightedQuoteContext(
  input: HighlightedQuoteContextInput
): HighlightedQuoteContext {
  assertQuoteRange(input.chapterText, input.startOffset, input.endOffset);

  const contextRadius = input.contextRadius ?? 24;
  const contextStartOffset = Math.max(0, input.startOffset - contextRadius);
  const contextEndOffset = Math.min(input.chapterText.length, input.endOffset + contextRadius);
  const before = input.chapterText.slice(contextStartOffset, input.startOffset);
  const quote = input.chapterText.slice(input.startOffset, input.endOffset);
  const after = input.chapterText.slice(input.endOffset, contextEndOffset);

  return {
    before,
    quote,
    after,
    contextText       : `${before}${quote}${after}`,
    contextStartOffset,
    contextEndOffset,
    highlightStart    : input.startOffset - contextStartOffset,
    highlightEnd      : input.endOffset - contextStartOffset,
    clippedBefore     : contextStartOffset > 0,
    clippedAfter      : contextEndOffset < input.chapterText.length
  };
}

export function buildEvidenceJumpMetadata(
  input: EvidenceJumpMetadataInput
): EvidenceJumpMetadata {
  return {
    bookId        : input.bookId,
    chapterId     : input.chapterId,
    evidenceSpanId: input.evidenceSpanId,
    anchor        : `evidence-${input.evidenceSpanId}`,
    startOffset   : input.startOffset,
    endOffset     : input.endOffset,
    highlightText : input.quotedText
  };
}
