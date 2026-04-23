"use client";

import { Badge } from "@/components/ui/badge";
import type { ReviewClaimDetailResponse } from "@/lib/services/review-matrix";
import { cn } from "@/lib/utils";

import { ReviewStateBadge } from "../shared/review-state-badge";

import {
  formatChapterLabel,
  formatClaimKind,
  formatClaimSource
} from "./formatters";
import { ReviewAiBasisCard } from "./review-ai-basis-card";
import { ReviewAuditTimeline } from "./review-audit-timeline";
import { ReviewClaimDiffCard } from "./review-claim-diff-card";
import { ReviewEvidenceList } from "./review-evidence-list";

interface ReviewClaimDetailPanelProps {
  detail                 : ReviewClaimDetailResponse;
  selectedEvidenceSpanId?: string | null;
  onSelectEvidenceSpan ? : (evidenceSpanId: string) => void;
  className?             : string;
}

export function ReviewClaimDetailPanel({
  detail,
  selectedEvidenceSpanId = null,
  onSelectEvidenceSpan,
  className
}: ReviewClaimDetailPanelProps) {
  const claim = detail.claim;

  return (
    <section
      data-testid="review-claim-detail-panel"
      className={cn("review-claim-detail-panel space-y-4", className)}
    >
      <section className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-foreground">当前 claim 详情</p>
            <p className="mt-1 text-sm text-muted-foreground">
              claimId：{claim.claimId} · {formatChapterLabel(null, claim.chapterId ?? "章节未知")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">{formatClaimKind(claim.claimKind)}</Badge>
            <Badge variant="outline">{formatClaimSource(claim.source)}</Badge>
            <ReviewStateBadge
              reviewState={claim.reviewState}
              conflictState={claim.conflictState}
            />
          </div>
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <ReviewEvidenceList
          evidence={detail.evidence}
          selectedEvidenceSpanId={selectedEvidenceSpanId}
          onSelectEvidenceSpan={onSelectEvidenceSpan}
        />
        <div className="space-y-4">
          <ReviewAiBasisCard aiSummary={detail.aiSummary} basisClaim={detail.basisClaim} />
          <ReviewClaimDiffCard versionDiff={detail.versionDiff} />
        </div>
      </div>

      <ReviewAuditTimeline auditHistory={detail.auditHistory} />
    </section>
  );
}
