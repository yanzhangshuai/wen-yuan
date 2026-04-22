"use client";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import type {
  RelationDirection,
  ReviewRelationClaimListItemDto,
  ReviewRelationSelectedPairDto,
  ReviewRelationTypeOptionDto
} from "@/lib/services/relation-editor";
import { cn } from "@/lib/utils";

import { ReviewStateBadge } from "../shared/review-state-badge";
import { getRelationTypeLabel } from "./types";

interface RelationClaimListProps {
  selectedPair       : ReviewRelationSelectedPairDto | null;
  relationTypeOptions: ReviewRelationTypeOptionDto[];
  selectedClaimId    : string | null;
  onSelectClaim      : (claimId: string) => void;
  className        ? : string;
}

const RELATION_DIRECTION_LABELS: Record<string, string> = {
  FORWARD      : "正向",
  REVERSE      : "反向",
  BIDIRECTIONAL: "双向",
  UNDIRECTED   : "无方向",
  OUTGOING     : "正向",
  INCOMING     : "反向"
};

function getRelationDirectionLabel(direction: RelationDirection): string {
  return RELATION_DIRECTION_LABELS[direction] ?? direction;
}

function formatChapterInterval(claim: ReviewRelationClaimListItemDto): string {
  const start = claim.effectiveChapterStart;
  const end = claim.effectiveChapterEnd;

  if (start !== null && end !== null) {
    return start === end ? `第 ${start} 回` : `第 ${start} 回 - 第 ${end} 回`;
  }

  if (start !== null) {
    return `第 ${start} 回起`;
  }

  if (end !== null) {
    return `至第 ${end} 回`;
  }

  return "生效区间待定";
}

function formatEvidenceCount(claim: ReviewRelationClaimListItemDto): string {
  return claim.evidenceSpanIds.length > 0
    ? `${claim.evidenceSpanIds.length} 条证据`
    : "未绑定证据";
}

function formatSource(source: ReviewRelationClaimListItemDto["source"]): string {
  return source === "MANUAL" ? "人工" : "AI";
}

function getClaimRelationLabel(
  relationTypeOptions: readonly ReviewRelationTypeOptionDto[],
  claim: ReviewRelationClaimListItemDto
): string {
  return getRelationTypeLabel(
    relationTypeOptions,
    claim.relationTypeKey,
    claim.relationLabel
  );
}

/**
 * 选中人物关系对后的 claim 摘要列表。
 * 列表层只展示已在 DTO 中携带的字段，详情与编辑交互交给后续 sheet 懒加载。
 */
export function RelationClaimList({
  selectedPair,
  relationTypeOptions,
  selectedClaimId,
  onSelectClaim,
  className
}: RelationClaimListProps) {
  if (selectedPair === null) {
    return (
      <EmptyState
        title="先选择一组人物关系"
        description="从左侧人物关系对列表选择后，这里会显示该组合下的所有关系 claim。"
        className={cn("rounded-xl border bg-background", className)}
      />
    );
  }

  if (selectedPair.claims.length === 0) {
    return (
      <EmptyState
        title="该人物关系对暂无 claim"
        description="可以调整筛选条件，或在后续详情面板中新增人工关系。"
        className={cn("rounded-xl border bg-background", className)}
      />
    );
  }

  return (
    <section className={cn("relation-claim-list rounded-xl border bg-background p-3", className)}>
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            {selectedPair.leftPersona.displayName} ↔ {selectedPair.rightPersona.displayName}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {selectedPair.claims.length} 条关系 claim
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {selectedPair.claims.map((claim) => {
          const isSelected = claim.claimId === selectedClaimId;
          const relationLabel = claim.relationLabel
            || getClaimRelationLabel(relationTypeOptions, claim);

          return (
            <button
              key={claim.claimId}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelectClaim(claim.claimId)}
              className={cn(
                "w-full rounded-lg border p-3 text-left transition-colors",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-muted/50"
              )}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {claim.claimId} · {relationLabel}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {claim.chapterLabel ?? "来源章节待定"} · {formatChapterInterval(claim)}
                  </p>
                </div>
                <ReviewStateBadge
                  reviewState={claim.reviewState}
                  conflictState={claim.conflictState}
                />
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge variant="outline">
                  {getRelationDirectionLabel(claim.direction)}
                </Badge>
                <Badge variant="outline">{formatSource(claim.source)}</Badge>
                <Badge variant="outline">{formatEvidenceCount(claim)}</Badge>
                {claim.timeLabel ? (
                  <Badge variant="secondary">{claim.timeLabel}</Badge>
                ) : null}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
