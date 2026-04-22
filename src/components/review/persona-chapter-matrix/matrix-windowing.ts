import {
  PERSONA_CHAPTER_MATRIX_COLUMN_WIDTH,
  PERSONA_CHAPTER_MATRIX_OVERSCAN_COLUMNS,
  PERSONA_CHAPTER_MATRIX_OVERSCAN_ROWS,
  PERSONA_CHAPTER_MATRIX_ROW_HEIGHT,
  type MatrixWindowInput,
  type MatrixWindowResult
} from "./types";

function toNonNegativeInteger(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.floor(value));
}

function toPositiveInteger(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.max(1, Math.floor(value));
}

function toViewportItemCount(viewportSize: number, itemSize: number): number {
  const normalizedViewportSize = toNonNegativeInteger(viewportSize);
  return Math.max(1, Math.ceil(normalizedViewportSize / itemSize));
}

function clampIndex(index: number | null | undefined, totalCount: number): number | null {
  if (index === null || index === undefined || !Number.isInteger(index)) {
    return null;
  }

  if (index < 0 || index >= totalCount) {
    return null;
  }

  return index;
}

function buildVisibleRange(
  totalCount: number,
  scrollOffset: number,
  itemSize: number,
  viewportSize: number,
  overscan: number
): { start: number; end: number } {
  if (totalCount <= 0) {
    return { start: 0, end: 0 };
  }

  const visibleStart = Math.min(
    totalCount - 1,
    Math.floor(toNonNegativeInteger(scrollOffset) / itemSize)
  );
  const visibleCount = toViewportItemCount(viewportSize, itemSize);
  const visibleEnd = Math.min(totalCount, visibleStart + visibleCount);

  return {
    start: Math.max(0, visibleStart - overscan),
    end  : Math.min(totalCount, visibleEnd + overscan)
  };
}

function buildPinnedIndexes(
  selectedIndex: number | null,
  rangeStart: number,
  rangeEnd: number
): number[] {
  if (selectedIndex === null || (selectedIndex >= rangeStart && selectedIndex < rangeEnd)) {
    return [];
  }

  return [selectedIndex];
}

function buildIndexList(
  rangeStart: number,
  rangeEnd: number,
  pinnedIndexes: number[]
): number[] {
  const indexes = new Set<number>();

  for (let index = rangeStart; index < rangeEnd; index += 1) {
    indexes.add(index);
  }

  for (const pinnedIndex of pinnedIndexes) {
    indexes.add(pinnedIndex);
  }

  return Array.from(indexes).sort((left, right) => left - right);
}

/**
 * 纯窗口计算函数：
 * - 用于在大矩阵场景下只渲染当前视口附近的行列；
 * - 选中单元格若落在窗口外，会通过 pinned indexes 保持可寻址，避免 drill-down 失联。
 */
export function calculateMatrixWindow(input: MatrixWindowInput): MatrixWindowResult {
  const totalRows = toNonNegativeInteger(input.totalRows);
  const totalColumns = toNonNegativeInteger(input.totalColumns);
  const rowHeight = toPositiveInteger(
    input.rowHeight,
    PERSONA_CHAPTER_MATRIX_ROW_HEIGHT
  );
  const columnWidth = toPositiveInteger(
    input.columnWidth,
    PERSONA_CHAPTER_MATRIX_COLUMN_WIDTH
  );
  const overscanRows = toNonNegativeInteger(
    input.overscanRows ?? PERSONA_CHAPTER_MATRIX_OVERSCAN_ROWS
  );
  const overscanColumns = toNonNegativeInteger(
    input.overscanColumns ?? PERSONA_CHAPTER_MATRIX_OVERSCAN_COLUMNS
  );

  const rowRange = buildVisibleRange(
    totalRows,
    input.scrollTop,
    rowHeight,
    input.viewportHeight,
    overscanRows
  );
  const columnRange = buildVisibleRange(
    totalColumns,
    input.scrollLeft,
    columnWidth,
    input.viewportWidth,
    overscanColumns
  );

  const selectedRowIndex = clampIndex(input.selectedRowIndex, totalRows);
  const selectedColumnIndex = clampIndex(input.selectedColumnIndex, totalColumns);
  const pinnedRowIndexes = buildPinnedIndexes(
    selectedRowIndex,
    rowRange.start,
    rowRange.end
  );
  const pinnedColumnIndexes = buildPinnedIndexes(
    selectedColumnIndex,
    columnRange.start,
    columnRange.end
  );

  return {
    rowStart     : rowRange.start,
    rowEnd       : rowRange.end,
    columnStart  : columnRange.start,
    columnEnd    : columnRange.end,
    rowIndexes   : buildIndexList(rowRange.start, rowRange.end, pinnedRowIndexes),
    columnIndexes: buildIndexList(columnRange.start, columnRange.end, pinnedColumnIndexes),
    pinnedRowIndexes,
    pinnedColumnIndexes,
    rowHeight,
    columnWidth,
    totalHeight  : totalRows * rowHeight,
    totalWidth   : totalColumns * columnWidth
  };
}
