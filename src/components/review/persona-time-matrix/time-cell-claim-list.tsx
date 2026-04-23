import type { ReviewClaimListItem } from "@/lib/services/review-time-matrix";
import { cn } from "@/lib/utils";

import { ReviewStateBadge } from "../shared/review-state-badge";

interface TimeCellClaimListProps {
  claims         : ReviewClaimListItem[];
  selectedClaimId: string | null;
  onSelectClaim  : (claim: ReviewClaimListItem) => void;
  className?     : string;
}

const CLAIM_KIND_LABELS: Record<ReviewClaimListItem["claimKind"], string> = {
  ALIAS              : "别名",
  EVENT              : "事迹",
  RELATION           : "关系",
  TIME               : "时间",
  IDENTITY_RESOLUTION: "身份归并",
  CONFLICT_FLAG      : "冲突"
};

const CLAIM_SOURCE_LABELS: Record<ReviewClaimListItem["source"], string> = {
  AI      : "AI 抽取",
  RULE    : "规则检测",
  MANUAL  : "人工创建",
  IMPORTED: "导入"
};

const TIME_CELL_CLAIM_PRIORITY: Record<ReviewClaimListItem["claimKind"], number> = {
  TIME               : 0,
  EVENT              : 1,
  RELATION           : 2,
  CONFLICT_FLAG      : 3,
  ALIAS              : 4,
  IDENTITY_RESOLUTION: 4
};

function toClaimKindLabel(claimKind: ReviewClaimListItem["claimKind"]): string {
  return CLAIM_KIND_LABELS[claimKind] ?? claimKind;
}

function toClaimSourceLabel(source: ReviewClaimListItem["source"]): string {
  return CLAIM_SOURCE_LABELS[source] ?? source;
}

function buildClaimSummary(claim: ReviewClaimListItem): string {
  if (claim.claimKind === "TIME") {
    return claim.timeLabel ? `时间：${claim.timeLabel}` : "时间归一化待核对";
  }

  if (claim.claimKind === "RELATION" && claim.relationTypeKey) {
    return `关系类型：${claim.relationTypeKey}`;
  }

  if (claim.claimKind === "CONFLICT_FLAG") {
    return claim.conflictState === "ACTIVE" ? "存在冲突待判" : "冲突已解除";
  }

  if (claim.timeLabel) {
    return `时间：${claim.timeLabel}`;
  }

  return "可查看原文证据与 AI 提取依据";
}

function sortClaimsForReview(claims: readonly ReviewClaimListItem[]): ReviewClaimListItem[] {
  return claims
    .map((claim, index) => ({ claim, index }))
    .sort((left, right) => {
      const priorityDiff = TIME_CELL_CLAIM_PRIORITY[left.claim.claimKind]
        - TIME_CELL_CLAIM_PRIORITY[right.claim.claimKind];

      return priorityDiff === 0 ? left.index - right.index : priorityDiff;
    })
    .map(({ claim }) => claim);
}

/**
 * 时间单元格的审核顺序不同于章节单元格：
 * reviewer 需要先确认时间归一化，再核对依附于该时间片的事迹、关系和冲突。
 */
export function TimeCellClaimList({
  claims,
  selectedClaimId,
  onSelectClaim,
  className
}: TimeCellClaimListProps) {
  const sortedClaims = sortClaimsForReview(claims);

  return (
    <div className={cn("time-cell-claim-list space-y-3", className)}>
      {sortedClaims.map((claim) => {
        const claimKindLabel = toClaimKindLabel(claim.claimKind);
        const isSelected = claim.claimId === selectedClaimId;

        return (
          <button
            key={`${claim.claimKind}-${claim.claimId}`}
            type="button"
            aria-label={`查看${claimKindLabel}`}
            className={cn(
              "flex w-full flex-col gap-3 rounded-xl border p-3 text-left transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
              isSelected ? "border-primary/60 bg-primary/5" : "bg-background hover:bg-muted/30"
            )}
            onClick={() => onSelectClaim(claim)}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">{claimKindLabel}</p>
                <p className="text-xs text-muted-foreground">{buildClaimSummary(claim)}</p>
              </div>
              <ReviewStateBadge
                reviewState={claim.reviewState}
                conflictState={claim.conflictState}
                className="shrink-0"
              />
            </div>

            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{toClaimSourceLabel(claim.source)}</span>
              <span>{claim.evidenceSpanIds.length} 条证据</span>
              <span>claimId: {claim.claimId}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
}
