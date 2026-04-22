import type {
  ClaimReviewState,
  ConflictState,
  PersonaChapterMatrixCellDto
} from "@/lib/services/review-matrix";
import { cn } from "@/lib/utils";

import { ReviewStateBadge } from "../shared/review-state-badge";

import type { MatrixCellSelection } from "./types";

interface MatrixCellProps {
  personaName  : string;
  chapterLabel : string;
  chapterTitle?: string;
  cell         : PersonaChapterMatrixCellDto | null;
  selection    : MatrixCellSelection;
  isSelected   : boolean;
  onSelectCell?: (selection: MatrixCellSelection) => void;
}

interface ReviewStateCount {
  reviewState  : ClaimReviewState;
  conflictState: ConflictState;
  count        : number;
}

const REVIEW_STATE_ORDER: ClaimReviewState[] = [
  "PENDING",
  "CONFLICTED",
  "EDITED",
  "ACCEPTED",
  "DEFERRED",
  "REJECTED"
];

function toUpdatedAtLabel(value: string): string | null {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString().replace("T", " ").slice(0, 16);
}

function readConflictState(value: string): ConflictState {
  return value === "ACTIVE" ? "ACTIVE" : "NONE";
}

function summarizeReviewStateCounts(
  reviewStateSummary: PersonaChapterMatrixCellDto["reviewStateSummary"]
): ReviewStateCount[] {
  const states = Object.entries(reviewStateSummary)
    .flatMap(([reviewStateKey, conflicts]) => {
      if (!REVIEW_STATE_ORDER.includes(reviewStateKey as ClaimReviewState)) {
        return [];
      }

      return Object.entries(conflicts).flatMap(([conflictStateKey, rawCount]) => {
        const count = Number(rawCount);
        if (!Number.isFinite(count) || count <= 0) {
          return [];
        }

        return [{
          reviewState  : reviewStateKey as ClaimReviewState,
          conflictState: readConflictState(conflictStateKey),
          count
        }];
      });
    });

  return states.sort((left, right) => {
    const reviewStateDelta = REVIEW_STATE_ORDER.indexOf(left.reviewState)
      - REVIEW_STATE_ORDER.indexOf(right.reviewState);

    if (reviewStateDelta !== 0) {
      return reviewStateDelta;
    }

    if (left.conflictState === right.conflictState) {
      return 0;
    }

    return left.conflictState === "ACTIVE" ? -1 : 1;
  });
}

/**
 * reviewer-facing 单元格：
 * - 兼顾“已有事实摘要”和“空格可补录”两种状态；
 * - 只展示计数、状态、更新时间，不泄漏 claim 表细节。
 */
export function MatrixCell({
  personaName,
  chapterLabel,
  chapterTitle,
  cell,
  selection,
  isSelected,
  onSelectCell
}: MatrixCellProps) {
  const eventCount = cell?.eventCount ?? 0;
  const relationCount = cell?.relationCount ?? 0;
  const conflictCount = cell?.conflictCount ?? 0;
  const reviewStateCounts = summarizeReviewStateCounts(cell?.reviewStateSummary ?? {});
  const updatedAtLabel = cell?.latestUpdatedAt
    ? toUpdatedAtLabel(cell.latestUpdatedAt)
    : null;
  const hasFacts = eventCount > 0 || relationCount > 0 || conflictCount > 0;
  const hasConflict = conflictCount > 0;

  return (
    <button
      type="button"
      className={cn(
        "matrix-cell flex min-h-28 w-full flex-col rounded-xl border p-3 text-left transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
        hasFacts ? "bg-card shadow-sm" : "border-dashed bg-muted/20",
        hasConflict ? "border-warning/40 bg-warning/10" : null,
        isSelected ? "ring-2 ring-primary/60" : null
      )}
      aria-label={`${chapterLabel} · ${personaName}`}
      aria-pressed={isSelected}
      data-has-conflict={hasConflict}
      onClick={() => onSelectCell?.(selection)}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-foreground">{personaName}</p>
          <p className="text-xs text-muted-foreground">
            {chapterLabel}
            {chapterTitle ? ` · ${chapterTitle}` : ""}
          </p>
        </div>
        {hasConflict ? (
          <span className="rounded-full bg-warning px-2 py-0.5 text-[11px] font-medium text-white">
            冲突
          </span>
        ) : null}
      </div>

      {hasFacts ? (
        <>
          <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>事迹 {eventCount}</span>
            <span>关系 {relationCount}</span>
            <span>冲突 {conflictCount}</span>
          </div>
          {reviewStateCounts.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {reviewStateCounts.map((item) => (
                <span
                  key={`${item.reviewState}-${item.conflictState}`}
                  className="inline-flex items-center gap-1"
                >
                  <ReviewStateBadge
                    reviewState={item.reviewState}
                    conflictState={item.conflictState}
                    className="text-[11px]"
                  />
                  <span className="text-xs text-muted-foreground">{item.count}</span>
                </span>
              ))}
            </div>
          ) : null}
          {updatedAtLabel ? (
            <p className="mt-auto pt-3 text-xs text-muted-foreground">
              更新 {updatedAtLabel}
            </p>
          ) : null}
        </>
      ) : (
        <div className="mt-4 flex flex-1 items-center">
          <p className="text-sm text-muted-foreground">待补录</p>
        </div>
      )}
    </button>
  );
}
