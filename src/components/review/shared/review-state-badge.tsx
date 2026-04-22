import { Badge } from "@/components/ui/badge";
import type {
  ClaimReviewState,
  ConflictState
} from "@/lib/services/review-matrix";
import { cn } from "@/lib/utils";

interface ReviewStateBadgeProps {
  reviewState   : ClaimReviewState;
  conflictState?: ConflictState;
  className    ?: string;
}

type ReviewStateBadgeVariant =
  | "secondary"
  | "success"
  | "destructive"
  | "outline"
  | "warning";

/**
 * 审核状态中文标签需要在共享层统一维护，避免 reviewer 页面直接暴露英文枚举。
 * 这里故意不抽到更全局的常量文件，直到出现矩阵页以外的真实复用需求。
 */
const REVIEW_STATE_LABELS: Record<ClaimReviewState, string> = {
  PENDING   : "待审核",
  ACCEPTED  : "已接受",
  REJECTED  : "已拒绝",
  EDITED    : "已修订",
  DEFERRED  : "已暂缓",
  CONFLICTED: "冲突待判"
};

const REVIEW_STATE_VARIANTS: Record<ClaimReviewState, ReviewStateBadgeVariant> = {
  PENDING   : "secondary",
  ACCEPTED  : "success",
  REJECTED  : "destructive",
  EDITED    : "secondary",
  DEFERRED  : "outline",
  CONFLICTED: "warning"
};

export function ReviewStateBadge({
  reviewState,
  conflictState,
  className
}: ReviewStateBadgeProps) {
  const hasActiveConflict = conflictState === "ACTIVE";
  const label = reviewState === "CONFLICTED"
    ? REVIEW_STATE_LABELS[reviewState]
    : hasActiveConflict
      ? `${REVIEW_STATE_LABELS[reviewState]} · 冲突`
      : REVIEW_STATE_LABELS[reviewState];

  const variant = hasActiveConflict
    ? "warning"
    : REVIEW_STATE_VARIANTS[reviewState];

  return (
    <Badge
      variant={variant}
      className={cn(
        "review-state-badge",
        hasActiveConflict ? "ring-1 ring-warning/40" : null,
        className
      )}
      data-review-state={reviewState}
      data-conflict-state={conflictState ?? "NONE"}
    >
      {label}
    </Badge>
  );
}
