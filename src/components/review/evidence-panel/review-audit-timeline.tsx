import { Badge } from "@/components/ui/badge";
import type { ReviewClaimAuditHistoryItemDto } from "@/lib/services/review-matrix";
import { cn } from "@/lib/utils";

import {
  formatAuditAction,
  formatDateTime,
  formatNullableText,
  sortAuditHistory
} from "./formatters";

interface ReviewAuditTimelineProps {
  auditHistory: ReviewClaimAuditHistoryItemDto[];
  className?  : string;
}

export function ReviewAuditTimeline({
  auditHistory,
  className
}: ReviewAuditTimelineProps) {
  const sortedAuditHistory = sortAuditHistory(auditHistory);

  return (
    <section className={cn("review-audit-timeline rounded-xl border bg-card p-4 shadow-sm", className)}>
      <div>
        <h2 className="text-base font-semibold tracking-tight">审核记录（最新在上）</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          展示审核动作、备注、关联证据和服务端整理后的关键字段差异。
        </p>
      </div>

      {sortedAuditHistory.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">暂无审核记录</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {sortedAuditHistory.map((item) => (
            <li
              key={item.id}
              data-testid="review-audit-item"
              className="rounded-lg border bg-muted/20 p-3"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{formatAuditAction(item.action)}</Badge>
                <p className="text-xs text-muted-foreground">{formatDateTime(item.createdAt)}</p>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                执行人：{formatNullableText(item.actorUserId, "系统")}
              </p>
              {item.note ? (
                <p className="mt-2 text-sm text-foreground">{item.note}</p>
              ) : null}
              {item.evidenceSpanIds.length > 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  关联证据：{item.evidenceSpanIds.join("、")}
                </p>
              ) : null}
              {item.fieldDiffs.length > 0 ? (
                <dl className="mt-3 space-y-2">
                  {item.fieldDiffs.map((fieldDiff) => (
                    <div
                      key={`${item.id}:${fieldDiff.fieldKey}`}
                      className="rounded-md border bg-background px-3 py-2"
                    >
                      <dt className="text-xs font-medium text-muted-foreground">
                        {fieldDiff.fieldLabel}
                      </dt>
                      <dd className="mt-1 grid gap-2 text-sm md:grid-cols-2">
                        <div>
                          <p className="text-xs text-muted-foreground">变更前</p>
                          <p className="text-foreground">
                            {formatNullableText(fieldDiff.beforeText)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs text-muted-foreground">变更后</p>
                          <p className="text-foreground">
                            {formatNullableText(fieldDiff.afterText)}
                          </p>
                        </div>
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
