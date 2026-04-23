"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import {
  fetchPersonaTimeMatrix,
  type PersonaTimeMatrixDto
} from "@/lib/services/review-time-matrix";

import {
  buildExpandedTimeGroupState,
  findNextTimeSliceKey
} from "./time-axis";
import { TimeMatrixGrid } from "./time-matrix-grid";
import { TimeToolbar } from "./time-toolbar";
import {
  type PersonaTimeSelection
} from "./types";
import {
  applyLocalFilters,
  buildInitialViewState,
  buildRefreshQuery,
  countVisibleSlices,
  findGroupByTimeKey,
  resolveJumpPersonaId,
  selectionExists,
  toLoadErrorMessage
} from "./view-helpers";

export interface PersonaTimeReviewBookOption {
  id          : string;
  title       : string;
  personaCount: number;
}

export interface PersonaTimeReviewPageProps {
  bookId              : string;
  bookTitle           : string;
  allBooks            : PersonaTimeReviewBookOption[];
  initialMatrix       : PersonaTimeMatrixDto;
  initialSelectedCell?: PersonaTimeSelection | null;
}

/**
 * 人物 x 时间审核页在 Task 5 先停留在“摘要矩阵”阶段：
 * - 首屏使用 server DTO；
 * - 人物/时间类型/标签搜索全部本地过滤；
 * - 只有显式刷新才带着远端筛选回源，不把 label 搜索带进 API。
 */
export function PersonaTimeReviewPage({
  bookId,
  bookTitle,
  allBooks,
  initialMatrix,
  initialSelectedCell = null
}: PersonaTimeReviewPageProps) {
  const initialViewState = buildInitialViewState(initialMatrix, initialSelectedCell);
  const [matrix, setMatrix] = useState(initialMatrix);
  const [filters, setFilters] = useState(() => initialViewState.filters);
  const [selectedCell, setSelectedCell] = useState<PersonaTimeSelection | null>(() => initialViewState.selectedCell);
  const [expandedGroups, setExpandedGroups] = useState(() => initialViewState.expandedGroups);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const nextViewState = buildInitialViewState(initialMatrix, initialSelectedCell);

    setMatrix(initialMatrix);
    setFilters(nextViewState.filters);
    setSelectedCell(nextViewState.selectedCell);
    setExpandedGroups(nextViewState.expandedGroups);
    setIsLoading(false);
    setLoadError(null);
  }, [bookId, initialMatrix, initialSelectedCell]);

  const visibleMatrix = applyLocalFilters(matrix, filters);
  const visibleSliceCount = countVisibleSlices(visibleMatrix.timeGroups);
  const canJumpNext = findNextTimeSliceKey({
    timeGroups     : visibleMatrix.timeGroups,
    selectedTimeKey: selectedCell?.timeKey ?? null
  }) !== null;
  const hasVisibleMatrix = visibleMatrix.personas.length > 0
    && visibleSliceCount > 0
    && visibleMatrix.cells.length > 0;

  async function refreshMatrix() {
    setIsLoading(true);
    setLoadError(null);
    const currentSelection = selectedCell;

    try {
      const nextMatrix = await fetchPersonaTimeMatrix(buildRefreshQuery(bookId, filters));
      const nextVisibleMatrix = applyLocalFilters(nextMatrix, filters);
      const nextSelection = selectionExists(nextVisibleMatrix, currentSelection)
        ? currentSelection
        : null;

      setMatrix(nextMatrix);
      setSelectedCell(nextSelection);
      setExpandedGroups(buildExpandedTimeGroupState({
        timeGroups     : nextMatrix.timeGroups,
        selectedTimeKey: nextSelection?.timeKey ?? null
      }));
    } catch (error) {
      setLoadError(toLoadErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  function handleReset() {
    const nextViewState = buildInitialViewState(matrix, initialSelectedCell);

    setFilters(nextViewState.filters);
    setSelectedCell(nextViewState.selectedCell);
    setExpandedGroups(nextViewState.expandedGroups);
    setLoadError(null);
  }

  function handleJumpNext() {
    const nextTimeKey = findNextTimeSliceKey({
      timeGroups     : visibleMatrix.timeGroups,
      selectedTimeKey: selectedCell?.timeKey ?? null
    });
    const nextPersonaId = resolveJumpPersonaId(visibleMatrix, filters, selectedCell);

    if (!nextTimeKey || !nextPersonaId) {
      return;
    }

    setSelectedCell({
      personaId: nextPersonaId,
      timeKey  : nextTimeKey
    });
    setExpandedGroups((current) => {
      const nextGroups = { ...current };
      const group = findGroupByTimeKey(visibleMatrix.timeGroups, nextTimeKey);

      if (group) {
        nextGroups[group.timeType] = true;
      }

      return nextGroups;
    });
  }

  return (
    <section className="persona-time-review-page rounded-xl border bg-card p-6 shadow-sm">
      <header className="border-b pb-4">
        <p className="text-sm font-medium text-muted-foreground">审核矩阵</p>
        <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">{bookTitle}</h1>
            <p className="text-sm text-muted-foreground">
              当前书籍 {bookId}，可切换 {allBooks.length} 本书。时间标签搜索只做本地筛选，显式刷新才会回源。
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>{visibleMatrix.personas.length} 名人物列</span>
            <span>{visibleSliceCount} 个时间片行</span>
            <span>{visibleMatrix.cells.length} 个事实单元格</span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isLoading}
              onClick={() => {
                void refreshMatrix();
              }}
            >
              刷新矩阵
            </Button>
          </div>
        </div>
      </header>

      <div className="mt-4 space-y-4">
        <TimeToolbar
          filters={filters}
          personas={matrix.personas}
          timeGroups={matrix.timeGroups}
          canJumpNext={canJumpNext}
          isLoading={isLoading}
          onFiltersChange={(nextFilters) => {
            setFilters(nextFilters);
            setLoadError(null);
          }}
          onJumpNext={handleJumpNext}
          onReset={handleReset}
        />

        {loadError ? (
          <ErrorState title="矩阵加载失败" description={loadError} onRetry={() => void refreshMatrix()} />
        ) : hasVisibleMatrix ? (
          <TimeMatrixGrid
            personas={visibleMatrix.personas}
            timeGroups={visibleMatrix.timeGroups}
            cells={visibleMatrix.cells}
            selectedCell={selectionExists(visibleMatrix, selectedCell) ? selectedCell : null}
            expandedGroups={expandedGroups}
            onSelectCell={(selection) => {
              setSelectedCell(selection);
              setExpandedGroups((current) => {
                const nextGroups = { ...current };
                const group = findGroupByTimeKey(visibleMatrix.timeGroups, selection.timeKey);

                if (group) {
                  nextGroups[group.timeType] = true;
                }

                return nextGroups;
              });
            }}
            onToggleGroup={(timeType) => {
              setExpandedGroups((current) => ({
                ...current,
                [timeType]: !current[timeType]
              }));
            }}
          />
        ) : (
          <EmptyState
            title="当前筛选下暂无人物时间矩阵"
            description="可以调整人物、时间类型或时间标签搜索后再试。"
          />
        )}
      </div>
    </section>
  );
}
