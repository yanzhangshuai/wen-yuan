import { Badge } from "@/components/ui/badge";
import type { ReviewClaimVersionDiffDto } from "@/lib/services/review-matrix";
import { cn } from "@/lib/utils";

import {
  formatNullableText,
  formatVersionSource
} from "./formatters";

interface ReviewClaimDiffCardProps {
  versionDiff: ReviewClaimVersionDiffDto | null;
  className? : string;
}

export function ReviewClaimDiffCard({
  versionDiff,
  className
}: ReviewClaimDiffCardProps) {
  const hasDiffs = versionDiff !== null
    && versionDiff.versionSource !== "NONE"
    && versionDiff.fieldDiffs.length > 0;

  return (
    <section className={cn("review-claim-diff-card rounded-xl border bg-card p-4 shadow-sm", className)}>
      <div>
        <h2 className="text-base font-semibold tracking-tight">版本差异</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          优先展示最近审核修订；没有审核修订时回退到手工 lineage 差异。
        </p>
      </div>

      {!hasDiffs || versionDiff === null ? (
        <p className="mt-3 text-sm text-muted-foreground">当前 claim 暂无版本差异</p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{formatVersionSource(versionDiff.versionSource)}</Badge>
            {versionDiff.supersedesClaimId ? (
              <Badge variant="outline">supersedes: {versionDiff.supersedesClaimId}</Badge>
            ) : null}
            {versionDiff.derivedFromClaimId ? (
              <Badge variant="outline">derived: {versionDiff.derivedFromClaimId}</Badge>
            ) : null}
          </div>

          <dl className="space-y-2">
            {versionDiff.fieldDiffs.map((fieldDiff) => (
              <div
                key={`${versionDiff.versionSource}:${fieldDiff.fieldKey}`}
                className="rounded-md border bg-muted/20 px-3 py-2"
              >
                <dt className="text-xs font-medium text-muted-foreground">
                  {fieldDiff.fieldLabel}
                </dt>
                <dd className="mt-1 grid gap-2 text-sm md:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">变更前</p>
                    <p className="text-foreground">{formatNullableText(fieldDiff.beforeText)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">变更后</p>
                    <p className="text-foreground">{formatNullableText(fieldDiff.afterText)}</p>
                  </div>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
