import type { ReviewClaimListItem } from "@/lib/services/review-matrix";
import { cn } from "@/lib/utils";

import { ReviewStateBadge } from "../shared/review-state-badge";

interface CellClaimListProps {
  claims          : ReviewClaimListItem[];
  selectedClaimId : string | null;
  onSelectClaim   : (claim: ReviewClaimListItem) => void;
  className      ?: string;
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

function toClaimKindLabel(claimKind: ReviewClaimListItem["claimKind"]): string {
  return CLAIM_KIND_LABELS[claimKind] ?? claimKind;
}

function toClaimSourceLabel(source: ReviewClaimListItem["source"]): string {
  return CLAIM_SOURCE_LABELS[source] ?? source;
}

function buildClaimSummary(claim: ReviewClaimListItem): string {
  if (claim.claimKind === "RELATION" && claim.relationTypeKey) {
    return `关系类型：${claim.relationTypeKey}`;
  }

  if (claim.claimKind === "EVENT" && claim.timeLabel) {
    return `时间：${claim.timeLabel}`;
  }

  if (claim.claimKind === "CONFLICT_FLAG") {
    return claim.conflictState === "ACTIVE" ? "存在冲突待判" : "冲突已解除";
  }

  if (claim.timeLabel) {
    return `时间：${claim.timeLabel}`;
  }

  return "可查看原文证据与 AI 提取依据";
}

/**
 * reviewer-facing claim 列表：
 * - 只展示审核所需的领域标签与摘要，不把 claim 表结构直接泄漏到主信息层；
 * - claim id 只保留为次级元数据，便于排障或和后端日志对照。
 */
export function CellClaimList({
  claims,
  selectedClaimId,
  onSelectClaim,
  className
}: CellClaimListProps) {
  return (
    <div className={cn("space-y-3", className)}>
      {claims.map((claim) => {
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
