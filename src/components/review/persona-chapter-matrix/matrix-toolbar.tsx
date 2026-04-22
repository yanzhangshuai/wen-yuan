import type {
  ClaimReviewState,
  ConflictState,
  PersonaChapterMatrixChapterDto
} from "@/lib/services/review-matrix";
import { cn } from "@/lib/utils";

type ReviewStateFilterValue = ClaimReviewState | "";
type ConflictStateFilterValue = ConflictState | "";

const REVIEW_STATE_OPTIONS: Array<{ value: ReviewStateFilterValue; label: string }> = [
  { value: "", label: "全部状态" },
  { value: "PENDING", label: "待审核" },
  { value: "CONFLICTED", label: "冲突待判" },
  { value: "EDITED", label: "已编辑" },
  { value: "ACCEPTED", label: "已接受" },
  { value: "DEFERRED", label: "已暂缓" },
  { value: "REJECTED", label: "已拒绝" }
];

const CONFLICT_STATE_OPTIONS: Array<{ value: ConflictStateFilterValue; label: string }> = [
  { value: "", label: "全部冲突" },
  { value: "ACTIVE", label: "仅看冲突" },
  { value: "NONE", label: "无冲突" }
];

interface MatrixToolbarProps {
  personaKeyword        : string;
  reviewStateFilter     : ReviewStateFilterValue;
  conflictStateFilter   : ConflictStateFilterValue;
  chapterJumpId         : string;
  chapters              : PersonaChapterMatrixChapterDto[];
  visiblePersonaCount   : number;
  chapterCount          : number;
  cellCount             : number;
  isLoading             : boolean;
  onPersonaKeywordChange: (value: string) => void;
  onReviewStateChange   : (value: ReviewStateFilterValue) => void;
  onConflictStateChange : (value: ConflictStateFilterValue) => void;
  onChapterJump         : (chapterId: string) => void;
  onReset               : () => void;
  className           ? : string;
}

function toReviewStateFilterValue(value: string): ReviewStateFilterValue {
  const matched = REVIEW_STATE_OPTIONS.find((option) => option.value === value);
  return matched?.value ?? "";
}

function toConflictStateFilterValue(value: string): ConflictStateFilterValue {
  const matched = CONFLICT_STATE_OPTIONS.find((option) => option.value === value);
  return matched?.value ?? "";
}

/**
 * 矩阵工具栏：
 * - 本地人物检索只影响已加载列；
 * - 审核状态/冲突状态会回源刷新矩阵摘要；
 * - 章节跳转只更新页面定位与选中单元格，不提前加载 claim detail。
 */
export function MatrixToolbar({
  personaKeyword,
  reviewStateFilter,
  conflictStateFilter,
  chapterJumpId,
  chapters,
  visiblePersonaCount,
  chapterCount,
  cellCount,
  isLoading,
  onPersonaKeywordChange,
  onReviewStateChange,
  onConflictStateChange,
  onChapterJump,
  onReset,
  className
}: MatrixToolbarProps) {
  return (
    <div className={cn("rounded-xl border bg-background p-4", className)}>
      <div className="grid gap-3 lg:grid-cols-[minmax(12rem,1.4fr)_repeat(3,minmax(9rem,1fr))_auto]">
        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          搜索人物
          <input
            aria-label="搜索人物"
            value={personaKeyword}
            onChange={(event) => onPersonaKeywordChange(event.target.value)}
            placeholder="输入人物名、别名或字号"
            className="h-9 rounded-md border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
          />
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          审核状态
          <select
            aria-label="审核状态"
            value={reviewStateFilter}
            disabled={isLoading}
            onChange={(event) => onReviewStateChange(toReviewStateFilterValue(event.target.value))}
            className="h-9 rounded-md border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
          >
            {REVIEW_STATE_OPTIONS.map((option) => (
              <option key={option.value || "__ALL_REVIEW_STATES__"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          冲突状态
          <select
            aria-label="冲突状态"
            value={conflictStateFilter}
            disabled={isLoading}
            onChange={(event) => onConflictStateChange(toConflictStateFilterValue(event.target.value))}
            className="h-9 rounded-md border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
          >
            {CONFLICT_STATE_OPTIONS.map((option) => (
              <option key={option.value || "__ALL_CONFLICT_STATES__"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
          跳转章节
          <select
            aria-label="跳转章节"
            value={chapterJumpId}
            onChange={(event) => onChapterJump(event.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm text-foreground outline-none transition-colors focus:border-primary/60"
          >
            <option value="">选择章节</option>
            {chapters.map((chapter) => (
              <option key={chapter.chapterId} value={chapter.chapterId}>
                {chapter.label} · {chapter.title}
              </option>
            ))}
          </select>
        </label>

        <div className="flex items-end">
          <button
            type="button"
            className="h-9 rounded-md border px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isLoading}
            onClick={onReset}
          >
            重置筛选
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
        <span>{visiblePersonaCount} 名人物列</span>
        <span>{chapterCount} 个章节行</span>
        <span>{cellCount} 个事实单元格</span>
      </div>
    </div>
  );
}
