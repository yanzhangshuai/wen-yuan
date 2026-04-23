import { Badge } from "@/components/ui/badge";
import type { ReviewClaimEvidenceSpanDto } from "@/lib/services/review-matrix";
import { cn } from "@/lib/utils";

import {
  formatChapterLabel,
  formatDateTime,
  formatNarrativeRegion,
  sortEvidence
} from "./formatters";

interface ReviewEvidenceListProps {
  evidence               : ReviewClaimEvidenceSpanDto[];
  selectedEvidenceSpanId?: string | null;
  onSelectEvidenceSpan?  : (evidenceSpanId: string) => void;
  className?             : string;
}

export function ReviewEvidenceList({
  evidence,
  selectedEvidenceSpanId = null,
  onSelectEvidenceSpan,
  className
}: ReviewEvidenceListProps) {
  const sortedEvidence = sortEvidence(evidence);

  return (
    <section className={cn("review-evidence-list rounded-xl border bg-card p-4 shadow-sm", className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">原文证据</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            保留章节、偏移、说话人和规范化文本，方便 reviewer 逐段核对。
          </p>
        </div>
        <Badge variant="outline">{sortedEvidence.length} 段证据</Badge>
      </div>

      {sortedEvidence.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">暂无原文证据</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {sortedEvidence.map((item) => {
            const regionLabel = formatNarrativeRegion(item.narrativeRegionType);
            const metaParts = [
              formatChapterLabel(item.chapterLabel, item.chapterId),
              regionLabel,
              item.startOffset !== null && item.endOffset !== null
                ? `偏移：${item.startOffset}-${item.endOffset}`
                : null,
              item.speakerHint ? `说话人：${item.speakerHint}` : null
            ].filter((part): part is string => part !== null);
            const isSelected = item.id === selectedEvidenceSpanId;

            return (
              <li
                key={item.id}
                data-testid="review-evidence-item"
                className="rounded-lg border bg-muted/20 p-3"
              >
                {onSelectEvidenceSpan ? (
                  <button
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onSelectEvidenceSpan(item.id)}
                    className={cn(
                      "flex w-full flex-col gap-2 rounded-md text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                      isSelected ? "bg-primary/5" : null
                    )}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={isSelected ? "secondary" : "outline"}>
                        {formatChapterLabel(item.chapterLabel, item.chapterId)}
                      </Badge>
                      {item.normalizedText !== item.quotedText ? (
                        <Badge variant="outline">含规范化文本</Badge>
                      ) : null}
                    </div>
                    <blockquote className="border-l-2 border-border pl-3 text-sm leading-6 text-foreground">
                      {item.quotedText}
                    </blockquote>
                  </button>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {formatChapterLabel(item.chapterLabel, item.chapterId)}
                      </Badge>
                      {item.normalizedText !== item.quotedText ? (
                        <Badge variant="outline">含规范化文本</Badge>
                      ) : null}
                    </div>
                    <blockquote className="mt-2 border-l-2 border-border pl-3 text-sm leading-6 text-foreground">
                      {item.quotedText}
                    </blockquote>
                  </>
                )}

                <p className="mt-2 text-xs text-muted-foreground">{metaParts.join(" · ")}</p>
                {item.normalizedText !== item.quotedText ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    规范化：{item.normalizedText}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  入库时间：{formatDateTime(item.createdAt)}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
