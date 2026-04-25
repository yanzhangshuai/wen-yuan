"use client";

import { useEffect, useMemo, useState } from "react";

import { EmptyState, ErrorState } from "@/components/ui/states";
import {
  fetchPersonaChapterMatrix,
  type ClaimReviewState,
  type ConflictState,
  type FetchPersonaChapterMatrixInput,
  type PersonaChapterMatrixDto
} from "@/lib/services/review-matrix";

import { CellDrilldownSheet } from "./cell-drilldown-sheet";
import { filterMatrixByPersonaId } from "./filter-by-persona";
import { MatrixGrid } from "./matrix-grid";
import { MatrixToolbar } from "./matrix-toolbar";
import {
  PERSONA_CHAPTER_MATRIX_ROW_HEIGHT,
  type MatrixCellSelection
} from "./types";

export interface PersonaChapterReviewBookOption {
  id          : string;
  title       : string;
  personaCount: number;
}

export interface PersonaChapterReviewPageProps {
  bookId              : string;
  bookTitle           : string;
  allBooks            : PersonaChapterReviewBookOption[];
  initialMatrix       : PersonaChapterMatrixDto;
  selectedPersonaId   : string | null;
  focusOnly           : boolean;
  onFocusOnlyChange  ?: (next: boolean) => void;
  initialSelectedCell?: MatrixCellSelection | null;
}

type ReviewStateFilterValue = ClaimReviewState | "";
type ConflictStateFilterValue = ConflictState | "";

function buildMatrixQuery(
  bookId: string,
  reviewStateFilter: ReviewStateFilterValue,
  conflictStateFilter: ConflictStateFilterValue
): FetchPersonaChapterMatrixInput {
  return {
    bookId,
    ...(reviewStateFilter ? { reviewStates: [reviewStateFilter] } : {}),
    ...(conflictStateFilter ? { conflictState: conflictStateFilter } : {})
  };
}

function toLoadErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "刷新矩阵失败，请稍后重试。";
}

function selectionExists(
  matrix: PersonaChapterMatrixDto,
  selection: MatrixCellSelection | null
): boolean {
  if (selection === null) {
    return false;
  }

  return matrix.chapters.some((chapter) => chapter.chapterId === selection.chapterId)
    && matrix.personas.some((persona) => persona.personaId === selection.personaId);
}

function findSelectionForChapter(
  matrix: PersonaChapterMatrixDto,
  chapterId: string
): MatrixCellSelection | null {
  const hasChapter = matrix.chapters.some((chapter) => chapter.chapterId === chapterId);
  if (!hasChapter || matrix.personas.length === 0) {
    return null;
  }

  const personaIds = new Set(matrix.personas.map((persona) => persona.personaId));
  const firstCell = matrix.cells.find((cell) => (
    cell.chapterId === chapterId && personaIds.has(cell.personaId)
  ));

  return {
    chapterId,
    personaId: firstCell?.personaId ?? matrix.personas[0].personaId
  };
}

function resolveInitialSelectedCell(
  matrix: PersonaChapterMatrixDto,
  initialSelectedCell?: MatrixCellSelection | null
): MatrixCellSelection | null {
  if (initialSelectedCell === undefined || initialSelectedCell === null) {
    return null;
  }

  return selectionExists(matrix, initialSelectedCell) ? initialSelectedCell : null;
}

function toChapterScrollTop(matrix: PersonaChapterMatrixDto, chapterId: string): number {
  const chapterIndex = matrix.chapters.findIndex((chapter) => chapter.chapterId === chapterId);
  if (chapterIndex < 0) {
    return 0;
  }

  return chapterIndex * PERSONA_CHAPTER_MATRIX_ROW_HEIGHT;
}

/**
 * 人物 x 章节审核矩阵主入口：
 * - 首屏只消费 server page 传入的矩阵摘要；
 * - 人物搜索在本地缩小列集合；
 * - 审核状态/冲突状态通过 T13 matrix API 回源刷新摘要；
 * - 点击单元格后才打开 claim-first 钻取抽屉，章节跳转仅做定位与选中，不误开抽屉。
 */
export function PersonaChapterReviewPage({
  bookId,
  bookTitle,
  allBooks,
  initialMatrix,
  selectedPersonaId,
  focusOnly,
  onFocusOnlyChange,
  initialSelectedCell = null
}: PersonaChapterReviewPageProps) {
  const seededSelection = resolveInitialSelectedCell(initialMatrix, initialSelectedCell);
  const [matrix, setMatrix] = useState(initialMatrix);
  const [reviewStateFilter, setReviewStateFilter] = useState<ReviewStateFilterValue>("");
  const [conflictStateFilter, setConflictStateFilter] = useState<ConflictStateFilterValue>("");
  const [chapterJumpId, setChapterJumpId] = useState(seededSelection?.chapterId ?? "");
  const [selectedCell, setSelectedCell] = useState<MatrixCellSelection | null>(seededSelection);
  const [openedCell, setOpenedCell] = useState<MatrixCellSelection | null>(null);
  const [scrollTop, setScrollTop] = useState(
    seededSelection === null ? 0 : toChapterScrollTop(initialMatrix, seededSelection.chapterId)
  );
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const nextSeededSelection = resolveInitialSelectedCell(initialMatrix, initialSelectedCell);

    setMatrix(initialMatrix);
    setReviewStateFilter("");
    setConflictStateFilter("");
    setChapterJumpId(nextSeededSelection?.chapterId ?? "");
    setSelectedCell(nextSeededSelection);
    setOpenedCell(null);
    setScrollTop(
      nextSeededSelection === null
        ? 0
        : toChapterScrollTop(initialMatrix, nextSeededSelection.chapterId)
    );
    setLoadError(null);
    setIsLoading(false);
  }, [bookId, initialMatrix, initialSelectedCell]);

  async function refreshMatrix(
    nextReviewStateFilter: ReviewStateFilterValue,
    nextConflictStateFilter: ConflictStateFilterValue
  ) {
    setReviewStateFilter(nextReviewStateFilter);
    setConflictStateFilter(nextConflictStateFilter);
    setIsLoading(true);
    setLoadError(null);

    try {
      const nextMatrix = await fetchPersonaChapterMatrix(buildMatrixQuery(
        bookId,
        nextReviewStateFilter,
        nextConflictStateFilter
      ));

      setMatrix(nextMatrix);
      setSelectedCell((previousSelection) => (
        selectionExists(nextMatrix, previousSelection) ? previousSelection : null
      ));
      setOpenedCell((previousSelection) => (
        selectionExists(nextMatrix, previousSelection) ? previousSelection : null
      ));
    } catch (error) {
      setLoadError(toLoadErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshCurrentMatrix() {
    await refreshMatrix(reviewStateFilter, conflictStateFilter);
  }

  function handleReviewStateChange(value: ReviewStateFilterValue) {
    void refreshMatrix(value, conflictStateFilter);
  }

  function handleConflictStateChange(value: ConflictStateFilterValue) {
    void refreshMatrix(reviewStateFilter, value);
  }

  function handleReset() {
    setChapterJumpId("");
    setSelectedCell(null);
    setOpenedCell(null);
    setScrollTop(0);
    void refreshMatrix("", "");
  }

  function handleChapterJump(chapterId: string) {
    setChapterJumpId(chapterId);
    if (chapterId.length === 0) {
      setSelectedCell(null);
      setScrollTop(0);
      return;
    }

    const selection = findSelectionForChapter(displayedMatrix, chapterId);
    setSelectedCell(selection);
    setScrollTop(toChapterScrollTop(matrix, chapterId));
  }

  function handleClearSelectedPersona() {
    onFocusOnlyChange?.(false);
  }

  const displayedMatrix = useMemo(
    () => focusOnly ? filterMatrixByPersonaId(matrix, selectedPersonaId) : matrix,
    [matrix, focusOnly, selectedPersonaId]
  );

  const selectedPersonaDisplayName = matrix.personas.find(
    (p) => p.personaId === selectedPersonaId
  )?.displayName ?? null;

  const visibleSelectedCell = selectionExists(displayedMatrix, selectedCell)
    ? selectedCell
    : null;
  const hasVisibleMatrix = displayedMatrix.chapters.length > 0 && displayedMatrix.personas.length > 0;

  return (
    <section className="persona-chapter-review-page rounded-xl border bg-card p-6 shadow-sm">
      <header className="flex flex-col gap-2 border-b pb-4">
        <p className="text-sm font-medium text-muted-foreground">审核矩阵</p>
        <h1 className="text-2xl font-semibold tracking-tight">{bookTitle}</h1>
        <p className="text-sm text-muted-foreground">
          当前书籍 {bookId}，可切换 {allBooks.length} 本书。矩阵摘要会按审核状态与冲突状态回源刷新。
        </p>
      </header>

      <div className="mt-4 space-y-4">
        <MatrixToolbar
          selectedPersonaId={selectedPersonaId}
          selectedPersonaDisplayName={selectedPersonaDisplayName}
          focusOnly={focusOnly}
          reviewStateFilter={reviewStateFilter}
          conflictStateFilter={conflictStateFilter}
          chapterJumpId={chapterJumpId}
          chapters={matrix.chapters}
          visiblePersonaCount={displayedMatrix.personas.length}
          chapterCount={matrix.chapters.length}
          cellCount={displayedMatrix.cells.length}
          isLoading={isLoading}
          onFocusOnlyChange={onFocusOnlyChange ?? (() => {})}
          onReviewStateChange={handleReviewStateChange}
          onConflictStateChange={handleConflictStateChange}
          onChapterJump={handleChapterJump}
          onReset={handleReset}
          onClearSelectedPersona={handleClearSelectedPersona}
        />

        {isLoading ? (
          <div
            role="status"
            aria-live="polite"
            className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground"
          >
            矩阵刷新中...
          </div>
        ) : null}

        {loadError ? (
          <ErrorState
            title="矩阵加载失败"
            description={loadError}
            onRetry={() => {
              void refreshMatrix(reviewStateFilter, conflictStateFilter);
            }}
            className="rounded-xl border bg-background"
          />
        ) : hasVisibleMatrix ? (
          <MatrixGrid
            matrix={displayedMatrix}
            selectedCell={visibleSelectedCell}
            highlightedPersonaId={!focusOnly ? selectedPersonaId : null}
            onSelectCell={(selection) => {
              setSelectedCell(selection);
              setOpenedCell(selection);
            }}
            scrollTop={scrollTop}
          />
        ) : (
          <EmptyState
            title="当前筛选下暂无人物章节矩阵"
            description="可以调整人物关键词、审核状态或冲突状态后重试。"
            className="rounded-xl border bg-background"
          />
        )}
      </div>

      <CellDrilldownSheet
        open={openedCell !== null}
        matrix={matrix}
        selection={openedCell}
        onOpenChange={(open) => {
          if (!open) {
            setOpenedCell(null);
          }
        }}
        onMutationSuccess={refreshCurrentMatrix}
      />
    </section>
  );
}
