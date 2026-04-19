import { normalizeTextForEvidence } from "@/server/modules/analysis/evidence/offset-map";
import {
  assertStage0SegmentOffsets,
  calculateStage0ChapterConfidence,
  type Stage0ChapterInput,
  type Stage0ChapterSegmentationResult,
  type Stage0LowConfidenceReason,
  type Stage0SegmentDraft,
  type Stage0SegmentType
} from "@/server/modules/analysis/pipelines/evidence-review/stage0/types";

const KNOWN_CONFIDENCE = 0.95;
const TITLE_CONFIDENCE = 0.85;
const UNKNOWN_CONFIDENCE = 0.30;
const TITLE_SEARCH_LIMIT = 200;
const POEM_TRIGGER_REGEX = /有诗为证|有词为证|诗曰|词曰/g;
const POEM_CLOSER_REGEX = /此诗|此词/;
const POEM_MAX_LENGTH = 500;
const BLANK_LINE_REGEX = /\n\s*\n/;
const QUOTE_PATTERN_REGEX = /[\u201c\u300c\u300e][^\u201d\u300d\u300f]*[\u201d\u300d\u300f]/g;
const INTRODUCER_REGEX =
  /([\u4e00-\u9fff]{2,4}?)(?:笑|怒|答|问|叹|喝|唤|吩|咐|回|又|便|忙|复|大){0,3}(?:道|说|言|曰)[：:]?\s*$/;
const INTRODUCER_LOOKBACK = 20;
const COMMENTARY_TRIGGERS = [
  "却说",
  "话说",
  "看官听说",
  "且说",
  "按",
  "诸君试看",
  "原来"
] as const;
const PARAGRAPH_MIN_CJK = 5;
const PARAGRAPH_MIN_CJK_DENSITY = 0.4;
const CJK_CHAR_REGEX = /[\u4e00-\u9fff]/g;

interface ClaimedRange {
  startOffset: number;
  endOffset: number;
  segmentType: Stage0SegmentType;
  confidence: number;
  speakerHint: string | null;
}

function createSegment(input: {
  source: Stage0ChapterInput;
  range: ClaimedRange;
  segmentIndex: number;
}): Stage0SegmentDraft {
  const rawText = input.source.chapter.content.slice(
    input.range.startOffset,
    input.range.endOffset
  );

  const segment: Stage0SegmentDraft = {
    bookId: input.source.bookId,
    chapterId: input.source.chapter.id,
    runId: input.source.runId,
    segmentIndex: input.segmentIndex,
    segmentType: input.range.segmentType,
    startOffset: input.range.startOffset,
    endOffset: input.range.endOffset,
    rawText,
    normalizedText: normalizeTextForEvidence(rawText),
    confidence: input.range.confidence,
    speakerHint: input.range.speakerHint
  };

  assertStage0SegmentOffsets({
    chapterText: input.source.chapter.content,
    startOffset: segment.startOffset,
    endOffset: segment.endOffset,
    rawText: segment.rawText
  });

  return segment;
}

function countCjk(text: string): number {
  return (text.match(CJK_CHAR_REGEX) ?? []).length;
}

function hasMeaningfulCjk(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return false;
  }

  const cjk = countCjk(trimmed);
  return cjk >= PARAGRAPH_MIN_CJK && cjk / trimmed.length >= PARAGRAPH_MIN_CJK_DENSITY;
}

function classifyText(text: string): Stage0SegmentType {
  const trimmed = text.trim();
  for (const trigger of COMMENTARY_TRIGGERS) {
    if (trimmed.startsWith(trigger)) {
      return "COMMENTARY";
    }
  }

  return hasMeaningfulCjk(trimmed) ? "NARRATIVE" : "UNKNOWN";
}

function overlaps(startOffset: number, endOffset: number, ranges: ClaimedRange[]): boolean {
  return ranges.some(
    (range) => startOffset < range.endOffset && endOffset > range.startOffset
  );
}

function findTitleRange(source: Stage0ChapterInput): ClaimedRange | null {
  const title = source.chapter.title.trim();
  if (title.length === 0) {
    return null;
  }

  const searchSurface = source.chapter.content.slice(0, TITLE_SEARCH_LIMIT);
  const startOffset = searchSurface.indexOf(title);
  if (startOffset < 0) {
    return null;
  }

  return {
    startOffset,
    endOffset: startOffset + title.length,
    segmentType: "TITLE",
    confidence: TITLE_CONFIDENCE,
    speakerHint: null
  };
}

function findPoemRanges(chapterText: string, protectedRanges: ClaimedRange[]): ClaimedRange[] {
  const ranges: ClaimedRange[] = [];
  let lastEnd = -1;

  for (const match of chapterText.matchAll(POEM_TRIGGER_REGEX)) {
    const startOffset = match.index;
    if (
      startOffset === undefined
      || startOffset < lastEnd
      || overlaps(startOffset, startOffset + match[0].length, protectedRanges)
    ) {
      continue;
    }

    const triggerEnd = startOffset + match[0].length;
    const tail = chapterText.slice(triggerEnd);
    const candidates: number[] = [];
    const closer = tail.match(POEM_CLOSER_REGEX);
    const blankLineIndex = tail.search(BLANK_LINE_REGEX);

    if (closer && closer.index !== undefined) {
      const afterCloser = closer.index + closer[0].length;
      const tailAfterCloser = tail.slice(afterCloser);
      const sentenceEnd = tailAfterCloser.search(/[\n。]/);
      candidates.push(sentenceEnd >= 0 ? afterCloser + sentenceEnd + 1 : afterCloser);
    }
    if (blankLineIndex >= 0) {
      candidates.push(blankLineIndex);
    }
    candidates.push(POEM_MAX_LENGTH);

    const relativeEnd = Math.min(...candidates, tail.length);
    const endOffset = triggerEnd + relativeEnd;

    ranges.push({
      startOffset,
      endOffset,
      segmentType: "POEM",
      confidence: KNOWN_CONFIDENCE,
      speakerHint: null
    });
    lastEnd = endOffset;
  }

  return ranges;
}

function findDialogueRanges(chapterText: string, protectedRanges: ClaimedRange[]): ClaimedRange[] {
  const ranges: ClaimedRange[] = [];

  for (const match of chapterText.matchAll(QUOTE_PATTERN_REGEX)) {
    const quoteStart = match.index;
    if (quoteStart === undefined) {
      continue;
    }

    const quoteEnd = quoteStart + match[0].length;
    if (overlaps(quoteStart, quoteEnd, protectedRanges)) {
      continue;
    }

    const lookbackFrom = Math.max(0, quoteStart - INTRODUCER_LOOKBACK);
    const lookback = chapterText.slice(lookbackFrom, quoteStart);
    const intro = lookback.match(INTRODUCER_REGEX);
    let speakerHint: string | null = null;

    if (intro && intro.index !== undefined) {
      const leadStart = lookbackFrom + intro.index;
      if (!overlaps(leadStart, quoteStart, protectedRanges)) {
        speakerHint = intro[1];
        ranges.push({
          startOffset: leadStart,
          endOffset: quoteStart,
          segmentType: "DIALOGUE_LEAD",
          confidence: KNOWN_CONFIDENCE,
          speakerHint
        });
      }
    }

    ranges.push({
      startOffset: quoteStart,
      endOffset: quoteEnd,
      segmentType: "DIALOGUE_CONTENT",
      confidence: KNOWN_CONFIDENCE,
      speakerHint
    });
  }

  return ranges;
}

function splitLineRanges(chapterText: string): Array<Pick<ClaimedRange, "startOffset" | "endOffset">> {
  const ranges: Array<Pick<ClaimedRange, "startOffset" | "endOffset">> = [];
  let lineStart = 0;
  let index = 0;

  while (index < chapterText.length) {
    const current = chapterText.charAt(index);
    if (current === "\r" && chapterText.charAt(index + 1) === "\n") {
      ranges.push({ startOffset: lineStart, endOffset: index + 2 });
      index += 2;
      lineStart = index;
      continue;
    }

    if (current === "\n" || current === "\r") {
      ranges.push({ startOffset: lineStart, endOffset: index + 1 });
      index += 1;
      lineStart = index;
      continue;
    }

    index += 1;
  }

  if (lineStart < chapterText.length) {
    ranges.push({ startOffset: lineStart, endOffset: chapterText.length });
  }

  return ranges;
}

function subtractClaimedRanges(
  lineRange: Pick<ClaimedRange, "startOffset" | "endOffset">,
  claimedRanges: ClaimedRange[]
): Array<Pick<ClaimedRange, "startOffset" | "endOffset">> {
  const leftovers: Array<Pick<ClaimedRange, "startOffset" | "endOffset">> = [];
  let cursor = lineRange.startOffset;

  for (const claimed of claimedRanges) {
    if (claimed.endOffset <= lineRange.startOffset) {
      continue;
    }
    if (claimed.startOffset >= lineRange.endOffset) {
      break;
    }

    if (claimed.startOffset > cursor) {
      leftovers.push({
        startOffset: cursor,
        endOffset: Math.min(claimed.startOffset, lineRange.endOffset)
      });
    }

    cursor = Math.max(cursor, Math.min(claimed.endOffset, lineRange.endOffset));
  }

  if (cursor < lineRange.endOffset) {
    leftovers.push({
      startOffset: cursor,
      endOffset: lineRange.endOffset
    });
  }

  return leftovers.filter((item) => item.endOffset > item.startOffset);
}

function findLeftoverRanges(chapterText: string, claimedRanges: ClaimedRange[]): ClaimedRange[] {
  const sortedClaims = [...claimedRanges].sort(
    (a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset
  );

  return splitLineRanges(chapterText).flatMap((lineRange) =>
    subtractClaimedRanges(lineRange, sortedClaims).map((range) => {
      const text = chapterText.slice(range.startOffset, range.endOffset);
      const segmentType = classifyText(text);

      return {
        ...range,
        segmentType,
        confidence: segmentType === "UNKNOWN" ? UNKNOWN_CONFIDENCE : KNOWN_CONFIDENCE,
        speakerHint: null
      };
    })
  );
}

export function segmentChapterText(input: Stage0ChapterInput): Stage0ChapterSegmentationResult {
  const ranges: ClaimedRange[] = [];
  const titleRange = findTitleRange(input);
  if (titleRange) {
    ranges.push(titleRange);
  }

  const poemRanges = findPoemRanges(input.chapter.content, ranges);
  ranges.push(...poemRanges);

  const dialogueRanges = findDialogueRanges(input.chapter.content, ranges);
  ranges.push(...dialogueRanges);

  ranges.sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);

  const leftoverRanges = findLeftoverRanges(input.chapter.content, ranges)
    .map((range) => {
      const text = input.chapter.content.slice(range.startOffset, range.endOffset);
      const segmentType = classifyText(text);

      return {
        ...range,
        segmentType,
        confidence: segmentType === "UNKNOWN" ? UNKNOWN_CONFIDENCE : KNOWN_CONFIDENCE,
        speakerHint: null
      } satisfies ClaimedRange;
    })
    .filter(
      (range) =>
        input.chapter.content.slice(range.startOffset, range.endOffset).trim().length > 0
    );

  const allRanges = [...ranges, ...leftoverRanges]
    .filter((range) => range.endOffset > range.startOffset)
    .sort((a, b) => a.startOffset - b.startOffset || a.endOffset - b.endOffset);

  const segments = allRanges.map((range, index) =>
    createSegment({
      source: input,
      range,
      segmentIndex: index
    })
  );

  const unknownChars = segments
    .filter((segment) => segment.segmentType === "UNKNOWN")
    .reduce((sum, segment) => sum + segment.rawText.length, 0);
  const unknownRatio =
    input.chapter.content.length === 0 ? 0 : unknownChars / input.chapter.content.length;
  const confidence = calculateStage0ChapterConfidence({ unknownRatio });
  const lowConfidenceReasons: Stage0LowConfidenceReason[] =
    confidence === "LOW"
      ? [
          {
            code: "UNKNOWN_RATIO_HIGH",
            message: `UNKNOWN segment ratio ${unknownRatio.toFixed(4)} exceeds 0.10`
          }
        ]
      : [];

  return {
    bookId: input.bookId,
    chapterId: input.chapter.id,
    runId: input.runId,
    chapterNo: input.chapter.no,
    segments,
    confidence,
    unknownRatio,
    lowConfidenceReasons
  };
}
