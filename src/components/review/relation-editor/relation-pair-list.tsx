"use client";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/states";
import type {
  ReviewRelationPairSummaryDto,
  ReviewRelationTypeOptionDto
} from "@/lib/services/relation-editor";
import { cn } from "@/lib/utils";

import { getRelationTypeLabel } from "./types";

interface RelationPairListProps {
  pairSummaries      : ReviewRelationPairSummaryDto[];
  relationTypeOptions: ReviewRelationTypeOptionDto[];
  selectedPairKey    : string | null;
  onSelectPair       : (pairKey: string) => void;
  className        ? : string;
}

function renderWarningBadges(pair: ReviewRelationPairSummaryDto) {
  return (
    <>
      {pair.warningFlags.directionConflict ? (
        <Badge variant="warning">进行方向复核</Badge>
      ) : null}
      {pair.warningFlags.intervalConflict ? (
        <Badge variant="warning">生效区间待复核</Badge>
      ) : null}
    </>
  );
}

/**
 * 人物关系编辑器的主导航列表。
 * 这里按 unordered pair 展示摘要，方向与具体 claim 仍保留在右侧 claim list 中。
 */
export function RelationPairList({
  pairSummaries,
  relationTypeOptions,
  selectedPairKey,
  onSelectPair,
  className
}: RelationPairListProps) {
  if (pairSummaries.length === 0) {
    return (
      <EmptyState
        title="当前筛选下暂无人物关系"
        description="可以调整人物、关系类型、审核状态或冲突筛选后重试。"
        className={cn("rounded-xl border bg-background", className)}
      />
    );
  }

  return (
    <section className={cn("relation-pair-list rounded-xl border bg-background p-3", className)}>
      <div className="mb-3 flex items-center justify-between gap-3 px-1">
        <h2 className="text-sm font-semibold text-foreground">人物关系对</h2>
        <span className="text-xs text-muted-foreground">{pairSummaries.length} 组</span>
      </div>

      <div className="space-y-2">
        {pairSummaries.map((pair) => {
          const isSelected = pair.pairKey === selectedPairKey;

          return (
            <button
              key={pair.pairKey}
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelectPair(pair.pairKey)}
              className={cn(
                "w-full rounded-lg border p-3 text-left transition-colors",
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-muted/50"
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {pair.leftPersonaName} ↔ {pair.rightPersonaName}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {pair.activeClaims} / {pair.totalClaims} 条有效关系
                  </p>
                </div>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {new Date(pair.latestUpdatedAt).toLocaleDateString("zh-CN")}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {pair.relationTypeKeys.map((relationTypeKey) => (
                  <Badge key={relationTypeKey} variant="outline">
                    {getRelationTypeLabel(relationTypeOptions, relationTypeKey)}
                  </Badge>
                ))}
                {renderWarningBadges(pair)}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
