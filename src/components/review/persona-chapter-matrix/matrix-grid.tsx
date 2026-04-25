import { useEffect, useRef, useState } from "react";

import type { PersonaChapterMatrixDto } from "@/lib/services/review-matrix";
import { cn } from "@/lib/utils";

import { MatrixCell } from "./matrix-cell";
import { calculateMatrixWindow } from "./matrix-windowing";
import {
  PERSONA_CHAPTER_MATRIX_COLUMN_WIDTH,
  PERSONA_CHAPTER_MATRIX_ROW_HEIGHT,
  type MatrixCellSelection,
  toMatrixCellKey
} from "./types";

interface MatrixGridProps {
  matrix               : PersonaChapterMatrixDto;
  selectedCell         : MatrixCellSelection | null;
  onSelectCell       ? : (selection: MatrixCellSelection) => void;
  viewportHeight     ? : number;
  viewportWidth      ? : number;
  scrollTop          ? : number;
  scrollLeft         ? : number;
  highlightedPersonaId?: string | null;
  className          ? : string;
}

interface MatrixAxisItemSegment {
  type : "item";
  key  : string;
  index: number;
}

interface MatrixAxisSpacerSegment {
  type: "spacer";
  key : string;
  size: number;
}

type MatrixAxisSegment = MatrixAxisItemSegment | MatrixAxisSpacerSegment;

const MATRIX_ROW_HEADER_WIDTH = 192;

function findSelectedIndexes(
  matrix: PersonaChapterMatrixDto,
  selectedCell: MatrixCellSelection | null
): { selectedRowIndex: number | null; selectedColumnIndex: number | null } {
  if (selectedCell === null) {
    return {
      selectedRowIndex   : null,
      selectedColumnIndex: null
    };
  }

  return {
    selectedRowIndex: matrix.chapters.findIndex(
      (chapter) => chapter.chapterId === selectedCell.chapterId
    ),
    selectedColumnIndex: matrix.personas.findIndex(
      (persona) => persona.personaId === selectedCell.personaId
    )
  };
}

function buildCellMap(matrix: PersonaChapterMatrixDto): Map<string, PersonaChapterMatrixDto["cells"][number]> {
  return new Map(
    matrix.cells.map((cell) => [
      toMatrixCellKey({
        chapterId: cell.chapterId,
        personaId: cell.personaId
      }),
      cell
    ])
  );
}

function buildAxisSegments(
  indexes: number[],
  totalCount: number,
  itemSize: number,
  prefix: string
): MatrixAxisSegment[] {
  const segments: MatrixAxisSegment[] = [];
  const normalizedIndexes = Array.from(new Set(indexes)).sort((left, right) => left - right);
  let cursor = 0;

  normalizedIndexes.forEach((index) => {
    if (index > cursor) {
      segments.push({
        type: "spacer",
        key : `${prefix}-spacer-${cursor}-${index}`,
        size: (index - cursor) * itemSize
      });
    }

    segments.push({
      type: "item",
      key : `${prefix}-item-${index}`,
      index
    });
    cursor = index + 1;
  });

  if (cursor < totalCount) {
    segments.push({
      type: "spacer",
      key : `${prefix}-spacer-${cursor}-${totalCount}`,
      size: (totalCount - cursor) * itemSize
    });
  }

  return segments;
}

/**
 * 人物 x 章节矩阵骨架：
 * - 当前层只负责“如何把摘要 DTO 排成 reviewer 可扫读的网格”；
 * - 滚动状态暂由父层传入，避免在 Task 6 就把页面状态和窗口化计算耦死。
 */
export function MatrixGrid({
  matrix,
  selectedCell,
  onSelectCell,
  viewportHeight = PERSONA_CHAPTER_MATRIX_ROW_HEIGHT * 6,
  viewportWidth = PERSONA_CHAPTER_MATRIX_COLUMN_WIDTH * 4,
  scrollTop = 0,
  scrollLeft = 0,
  highlightedPersonaId = null,
  className
}: MatrixGridProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [scrollState, setScrollState] = useState(() => ({
    top : scrollTop,
    left: scrollLeft
  }));
  const cellMap = buildCellMap(matrix);
  const { selectedRowIndex, selectedColumnIndex } = findSelectedIndexes(
    matrix,
    selectedCell
  );
  const windowResult = calculateMatrixWindow({
    totalRows   : matrix.chapters.length,
    totalColumns: matrix.personas.length,
    viewportHeight,
    viewportWidth,
    scrollTop   : scrollState.top,
    scrollLeft  : scrollState.left,
    selectedRowIndex,
    selectedColumnIndex
  });
  const rowSegments = buildAxisSegments(
    windowResult.rowIndexes,
    matrix.chapters.length,
    windowResult.rowHeight,
    "row"
  );
  const columnSegments = buildAxisSegments(
    windowResult.columnIndexes,
    matrix.personas.length,
    windowResult.columnWidth,
    "column"
  );
  const renderedColumnCount = columnSegments.length + 1;

  useEffect(() => {
    setScrollState((current) => (
      current.top === scrollTop && current.left === scrollLeft
        ? current
        : {
          top : scrollTop,
          left: scrollLeft
        }
    ));
  }, [scrollLeft, scrollTop]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (node === null) {
      return;
    }

    if (node.scrollTop !== scrollTop) {
      node.scrollTop = scrollTop;
    }

    if (node.scrollLeft !== scrollLeft) {
      node.scrollLeft = scrollLeft;
    }
  }, [scrollLeft, scrollTop]);

  useEffect(() => {
    const node = scrollerRef.current;
    if (node === null || highlightedPersonaId === null) {
      return;
    }

    const highlightedIndex = matrix.personas.findIndex(
      (persona) => persona.personaId === highlightedPersonaId
    );

    if (highlightedIndex < 0) {
      return;
    }

    const viewportPadding = 32;
    const targetScrollLeft = highlightedIndex * PERSONA_CHAPTER_MATRIX_COLUMN_WIDTH - viewportPadding;

    if (targetScrollLeft >= 0) {
      node.scrollLeft = targetScrollLeft;
    }
  }, [highlightedPersonaId, matrix.personas]);

  return (
    <div
      ref={scrollerRef}
      className={cn("matrix-grid overflow-auto rounded-xl border bg-background", className)}
      style={{
        maxHeight: viewportHeight + PERSONA_CHAPTER_MATRIX_ROW_HEIGHT,
        maxWidth : viewportWidth + PERSONA_CHAPTER_MATRIX_COLUMN_WIDTH
      }}
      onScroll={(event) => {
        const { scrollTop: nextScrollTop, scrollLeft: nextScrollLeft } = event.currentTarget;

        setScrollState((current) => (
          current.top === nextScrollTop && current.left === nextScrollLeft
            ? current
            : {
              top : nextScrollTop,
              left: nextScrollLeft
            }
        ));
      }}
    >
      <table
        className="border-separate border-spacing-2"
        style={{
          minWidth: MATRIX_ROW_HEADER_WIDTH + windowResult.totalWidth
        }}
      >
        <thead className="sticky top-0 z-10 bg-background">
          <tr>
            <th
              scope="col"
              className="sticky left-0 z-20 min-w-48 rounded-lg bg-muted/40 p-3 text-left text-sm font-semibold text-foreground"
              style={{
                minWidth: MATRIX_ROW_HEADER_WIDTH,
                width   : MATRIX_ROW_HEADER_WIDTH
              }}
            >
              章节
            </th>
            {columnSegments.map((segment) => {
              if (segment.type === "spacer") {
                return (
                  <th
                    key={segment.key}
                    aria-hidden="true"
                    className="p-0"
                    style={{
                      minWidth: segment.size,
                      width   : segment.size
                    }}
                  />
                );
              }

              const persona = matrix.personas[segment.index];
              const isHighlighted = highlightedPersonaId === persona.personaId;

              return (
                <th
                  key={persona.personaId}
                  scope="col"
                  data-highlighted={isHighlighted ? "true" : undefined}
                  className={cn(
                    "min-w-56 rounded-lg bg-muted/40 p-3 text-left align-top",
                    isHighlighted && "bg-primary/10"
                  )}
                  style={{
                    minWidth: windowResult.columnWidth,
                    width   : windowResult.columnWidth
                  }}
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">
                      {persona.displayName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      事迹 {persona.totalEventCount} · 关系 {persona.totalRelationCount} · 冲突 {persona.totalConflictCount}
                    </p>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {rowSegments.map((segment) => {
            if (segment.type === "spacer") {
              return (
                <tr key={segment.key} aria-hidden="true">
                  <td
                    colSpan={renderedColumnCount}
                    className="p-0"
                    style={{ height: segment.size }}
                  />
                </tr>
              );
            }

            const chapter = matrix.chapters[segment.index];

            return (
              <tr key={chapter.chapterId}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 min-w-48 rounded-lg bg-muted/20 p-3 text-left align-top"
                  style={{
                    minWidth: MATRIX_ROW_HEADER_WIDTH,
                    width   : MATRIX_ROW_HEADER_WIDTH
                  }}
                >
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-foreground">{chapter.label}</p>
                    <p className="text-xs text-muted-foreground">{chapter.title}</p>
                  </div>
                </th>

                {columnSegments.map((columnSegment) => {
                  if (columnSegment.type === "spacer") {
                    return (
                      <td
                        key={columnSegment.key}
                        aria-hidden="true"
                        className="p-0"
                        style={{
                          minWidth: columnSegment.size,
                          width   : columnSegment.size
                        }}
                      />
                    );
                  }

                  const persona = matrix.personas[columnSegment.index];
                  const selection = {
                    personaId: persona.personaId,
                    chapterId: chapter.chapterId
                  };
                  const key = toMatrixCellKey(selection);
                  const cell = cellMap.get(key) ?? null;
                  const isSelected = selectedCell !== null
                    && selectedCell.personaId === selection.personaId
                    && selectedCell.chapterId === selection.chapterId;
                  const isCellInHighlightedColumn = highlightedPersonaId === persona.personaId;

                  return (
                    <td
                      key={key}
                      className={cn(
                        "min-w-56 align-top",
                        isCellInHighlightedColumn && "border-x border-primary/30"
                      )}
                      style={{
                        minWidth: windowResult.columnWidth,
                        width   : windowResult.columnWidth
                      }}
                    >
                      <MatrixCell
                        personaName={persona.displayName}
                        chapterLabel={chapter.label}
                        chapterTitle={chapter.title}
                        cell={cell}
                        selection={selection}
                        isSelected={isSelected}
                        onSelectCell={onSelectCell}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
