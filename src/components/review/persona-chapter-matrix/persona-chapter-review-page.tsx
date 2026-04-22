"use client";

import { useEffect, useState } from "react";

import { EmptyState, ErrorState } from "@/components/ui/states";
import {
  fetchPersonaChapterMatrix,
  type ClaimReviewState,
  type ConflictState,
  type FetchPersonaChapterMatrixInput,
  type PersonaChapterMatrixDto
} from "@/lib/services/review-matrix";

import { CellDrilldownSheet } from "./cell-drilldown-sheet";
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
  bookId       : string;
  bookTitle    : string;
  allBooks     : PersonaChapterReviewBookOption[];
  initialMatrix: PersonaChapterMatrixDto;
}

type ReviewStateFilterValue = ClaimReviewState | "";
type ConflictStateFilterValue = ConflictState | "";

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function isPersonaMatched(
  persona: PersonaChapterMatrixDto["personas"][number],
  keyword: string
): boolean {
  if (keyword.length === 0) {
    return true;
  }

  const searchableTexts = [persona.displayName, ...persona.aliases];
  return searchableTexts.some((text) => text.toLocaleLowerCase().includes(keyword));
}

function filterMatrixByPersonaKeyword(
  matrix: PersonaChapterMatrixDto,
  personaKeyword: string
): PersonaChapterMatrixDto {
  const normalizedKeyword = normalizeSearchText(personaKeyword);
  if (normalizedKeyword.length === 0) {
    return matrix;
  }

  const personas = matrix.personas.filter((persona) => isPersonaMatched(
    persona,
    normalizedKeyword
  ));
  const personaIds = new Set(personas.map((persona) => persona.personaId));

  return {
    ...matrix,
    personas,
    cells: matrix.cells.filter((cell) => personaIds.has(cell.personaId))
  };
}

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
  initialMatrix
}: PersonaChapterReviewPageProps) {
  const [matrix, setMatrix] = useState(initialMatrix);
  const [personaKeyword, setPersonaKeyword] = useState("");
  const [reviewStateFilter, setReviewStateFilter] = useState<ReviewStateFilterValue>("");
  const [conflictStateFilter, setConflictStateFilter] = useState<ConflictStateFilterValue>("");
  const [chapterJumpId, setChapterJumpId] = useState("");
  const [selectedCell, setSelectedCell] = useState<MatrixCellSelection | null>(null);
  const [openedCell, setOpenedCell] = useState<MatrixCellSelection | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setMatrix(initialMatrix);
    setPersonaKeyword("");
    setReviewStateFilter("");
    setConflictStateFilter("");
    setChapterJumpId("");
    setSelectedCell(null);
    setOpenedCell(null);
    setScrollTop(0);
    setLoadError(null);
    setIsLoading(false);
  }, [bookId, initialMatrix]);

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
    setPersonaKeyword("");
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

    const selection = findSelectionForChapter(visibleMatrix, chapterId);
    setSelectedCell(selection);
    setScrollTop(toChapterScrollTop(matrix, chapterId));
  }

  const visibleMatrix = filterMatrixByPersonaKeyword(matrix, personaKeyword);
  const visibleSelectedCell = selectionExists(visibleMatrix, selectedCell)
    ? selectedCell
    : null;
  const hasVisibleMatrix = visibleMatrix.chapters.length > 0 && visibleMatrix.personas.length > 0;

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
          personaKeyword={personaKeyword}
          reviewStateFilter={reviewStateFilter}
          conflictStateFilter={conflictStateFilter}
          chapterJumpId={chapterJumpId}
          chapters={matrix.chapters}
          visiblePersonaCount={visibleMatrix.personas.length}
          chapterCount={matrix.chapters.length}
          cellCount={visibleMatrix.cells.length}
          isLoading={isLoading}
          onPersonaKeywordChange={setPersonaKeyword}
          onReviewStateChange={handleReviewStateChange}
          onConflictStateChange={handleConflictStateChange}
          onChapterJump={handleChapterJump}
          onReset={handleReset}
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
            matrix={visibleMatrix}
            selectedCell={visibleSelectedCell}
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
