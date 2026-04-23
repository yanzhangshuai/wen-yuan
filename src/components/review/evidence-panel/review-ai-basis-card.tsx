import { Badge } from "@/components/ui/badge";
import type {
  ReviewClaimAiBasisSummaryDto,
  ReviewClaimDetailRecord
} from "@/lib/services/review-matrix";
import { cn } from "@/lib/utils";

import { ReviewStateBadge } from "../shared/review-state-badge";

import {
  buildBasisFallbackLines,
  collectRawOutputWarnings,
  formatClaimKind,
  formatClaimSource,
  formatConfidence,
  formatDateTime
} from "./formatters";

interface ReviewAiBasisCardProps {
  aiSummary : ReviewClaimAiBasisSummaryDto | null;
  basisClaim: ReviewClaimDetailRecord | null;
  className?: string;
}

export function ReviewAiBasisCard({
  aiSummary,
  basisClaim,
  className
}: ReviewAiBasisCardProps) {
  const summaryLines = aiSummary?.summaryLines.length
    ? aiSummary.summaryLines
    : buildBasisFallbackLines(basisClaim);
  const rawOutputWarnings = collectRawOutputWarnings(aiSummary?.rawOutput ?? null);
  const basisKind = basisClaim?.claimKind ?? aiSummary?.basisClaimKind ?? null;

  return (
    <section className={cn("review-ai-basis-card rounded-xl border bg-card p-4 shadow-sm", className)}>
      <div>
        <h2 className="text-base font-semibold tracking-tight">AI 提取依据</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          展示 lineage basis、运行信息，以及面向 reviewer 的模型输出摘要。
        </p>
      </div>

      {aiSummary === null && basisClaim === null ? (
        <p className="mt-3 text-sm text-muted-foreground">暂无 AI 依据</p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {basisKind !== null ? (
              <p className="text-sm font-medium text-foreground">
                {formatClaimKind(basisKind)}
              </p>
            ) : null}
            {basisClaim !== null ? (
              <ReviewStateBadge
                reviewState={basisClaim.reviewState}
                conflictState={basisClaim.conflictState}
              />
            ) : null}
            <Badge variant="outline">
              {formatClaimSource(aiSummary?.source ?? basisClaim?.source ?? null)}
            </Badge>
            {aiSummary?.runId ? (
              <Badge variant="outline">run: {aiSummary.runId}</Badge>
            ) : null}
            <Badge variant="outline">
              {formatConfidence(aiSummary?.confidence ?? basisClaim?.confidence ?? null)}
            </Badge>
          </div>

          {summaryLines.length > 0 ? (
            <ul className="space-y-1 text-sm text-muted-foreground">
              {summaryLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">当前依据未提供摘要字段。</p>
          )}

          {aiSummary?.rawOutput ? (
            <section className="rounded-lg border bg-muted/20 p-3">
              <h3 className="text-sm font-semibold text-foreground">模型输出摘要</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {aiSummary.rawOutput.stageKey ? (
                  <Badge variant="outline">{aiSummary.rawOutput.stageKey}</Badge>
                ) : null}
                {(aiSummary.rawOutput.provider || aiSummary.rawOutput.model) ? (
                  <Badge variant="outline">
                    {(aiSummary.rawOutput.provider ?? "provider unknown")}
                    {" / "}
                    {(aiSummary.rawOutput.model ?? "model unknown")}
                  </Badge>
                ) : null}
                <Badge variant={aiSummary.rawOutput.hasStructuredJson ? "success" : "outline"}>
                  {aiSummary.rawOutput.hasStructuredJson ? "含结构化 JSON" : "无结构化 JSON"}
                </Badge>
              </div>
              {aiSummary.rawOutput.responseExcerpt ? (
                <p className="mt-3 text-sm leading-6 text-foreground">
                  {aiSummary.rawOutput.responseExcerpt}
                </p>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">未提供模型输出摘录。</p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">
                生成时间：{formatDateTime(aiSummary.rawOutput.createdAt)}
              </p>
              {rawOutputWarnings.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-warning">
                  {rawOutputWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
        </div>
      )}
    </section>
  );
}
