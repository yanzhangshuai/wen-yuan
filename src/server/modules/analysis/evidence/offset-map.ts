/**
 * 文本证据层统一使用原始 chapter 文本 offset 作为权威坐标。
 * 这里允许把 CRLF、全角空格、Tab 归一化成单字符 lookup surface，
 * 但任何命中都必须能稳定映射回原文范围。
 */

export interface OriginalOffsetRange {
  startOffset: number;
  endOffset  : number;
}

export interface OffsetMapEntry {
  normalizedStart: number;
  normalizedEnd  : number;
  originalStart  : number;
  originalEnd    : number;
  normalizedValue: string;
  originalValue  : string;
}

export interface TextOffsetMap {
  originalText  : string;
  normalizedText: string;
  entries       : OffsetMapEntry[];
}

export type OffsetMapErrorCode =
  | "EMPTY_NEEDLE"
  | "INVALID_NORMALIZED_RANGE"
  | "NEEDLE_NOT_FOUND"
  | "NORMALIZED_RANGE_OUT_OF_BOUNDS";

export class OffsetMapError extends Error {
  readonly code: OffsetMapErrorCode;

  constructor(code: OffsetMapErrorCode, message: string) {
    super(message);
    this.name = "OffsetMapError";
    this.code = code;
  }
}

const FULL_WIDTH_SPACE = "　";

function readNormalizedUnit(text: string, originalStart: number): {
  normalizedValue: string;
  originalValue  : string;
  originalEnd    : number;
} {
  const current = text.charAt(originalStart);
  const next = text.charAt(originalStart + 1);

  if (current === "\r" && next === "\n") {
    return {
      normalizedValue: "\n",
      originalValue  : "\r\n",
      originalEnd    : originalStart + 2
    };
  }

  if (current === "\r") {
    return {
      normalizedValue: "\n",
      originalValue  : current,
      originalEnd    : originalStart + 1
    };
  }

  if (current === FULL_WIDTH_SPACE || current === "\t") {
    return {
      normalizedValue: " ",
      originalValue  : current,
      originalEnd    : originalStart + 1
    };
  }

  return {
    normalizedValue: current,
    originalValue  : current,
    originalEnd    : originalStart + 1
  };
}

export function buildOffsetMap(originalText: string): TextOffsetMap {
  const entries: OffsetMapEntry[] = [];
  let normalizedText = "";
  let originalStart = 0;

  while (originalStart < originalText.length) {
    const unit = readNormalizedUnit(originalText, originalStart);
    const normalizedStart = normalizedText.length;

    normalizedText += unit.normalizedValue;
    entries.push({
      normalizedStart,
      normalizedEnd  : normalizedText.length,
      originalStart,
      originalEnd    : unit.originalEnd,
      normalizedValue: unit.normalizedValue,
      originalValue  : unit.originalValue
    });

    originalStart = unit.originalEnd;
  }

  return {
    originalText,
    normalizedText,
    entries
  };
}

export function normalizeTextForEvidence(text: string): string {
  return buildOffsetMap(text).normalizedText;
}

export function mapNormalizedRangeToOriginalRange(
  map: TextOffsetMap,
  normalizedStart: number,
  normalizedEnd: number
): OriginalOffsetRange {
  if (
    !Number.isInteger(normalizedStart) ||
    !Number.isInteger(normalizedEnd) ||
    normalizedStart >= normalizedEnd
  ) {
    throw new OffsetMapError(
      "INVALID_NORMALIZED_RANGE",
      `Invalid normalized range: ${normalizedStart}-${normalizedEnd}`
    );
  }

  if (normalizedStart < 0 || normalizedEnd > map.normalizedText.length) {
    throw new OffsetMapError(
      "NORMALIZED_RANGE_OUT_OF_BOUNDS",
      `Normalized range is outside text bounds: ${normalizedStart}-${normalizedEnd}`
    );
  }

  const startEntry = map.entries[normalizedStart];
  const endEntry = map.entries[normalizedEnd - 1];

  if (!startEntry || !endEntry) {
    throw new OffsetMapError(
      "NORMALIZED_RANGE_OUT_OF_BOUNDS",
      `Normalized range does not map to original text: ${normalizedStart}-${normalizedEnd}`
    );
  }

  return {
    startOffset: startEntry.originalStart,
    endOffset  : endEntry.originalEnd
  };
}

export function findOriginalRangeByNormalizedNeedle(
  map: TextOffsetMap,
  needle: string
): OriginalOffsetRange {
  const normalizedNeedle = normalizeTextForEvidence(needle);

  if (normalizedNeedle.length === 0) {
    throw new OffsetMapError("EMPTY_NEEDLE", "Evidence lookup needle cannot be empty");
  }

  const normalizedStart = map.normalizedText.indexOf(normalizedNeedle);

  if (normalizedStart < 0) {
    throw new OffsetMapError("NEEDLE_NOT_FOUND", `Evidence lookup needle not found: ${needle}`);
  }

  return mapNormalizedRangeToOriginalRange(
    map,
    normalizedStart,
    normalizedStart + normalizedNeedle.length
  );
}

export function sliceOriginalByNormalizedRange(
  map: TextOffsetMap,
  normalizedStart: number,
  normalizedEnd: number
): string {
  const range = mapNormalizedRangeToOriginalRange(map, normalizedStart, normalizedEnd);

  return map.originalText.slice(range.startOffset, range.endOffset);
}
