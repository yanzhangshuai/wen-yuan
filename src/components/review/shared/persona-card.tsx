"use client";

import { AlertTriangle, Users } from "lucide-react";
import { memo } from "react";
import { type PersonaListItem } from "./persona-list-summary";
import { cn } from "@/lib/utils";

interface PersonaCardProps {
  item      : PersonaListItem;
  isSelected: boolean;
  onSelect  : (personaId: string) => void;
}

export const PersonaCard = memo(function PersonaCard({ item, isSelected, onSelect }: PersonaCardProps) {
  const showAliases    = item.aliases.slice(0, 2);
  const aliasOverflow  = item.aliases.length - showAliases.length;
  const hasConflict    = item.totalConflictCount > 0;
  const hasMultiCand   = item.personaCandidateIds.length > 1;
  const reviewedTotal  = item.totalEventCount + item.totalRelationCount;
  const reviewedCount  = Math.max(reviewedTotal - item.pendingClaimCount, 0);
  const progressRatio  = reviewedTotal === 0 ? 1 : reviewedCount / reviewedTotal;

  return (
    <button
      type         ="button"
      role         ="option"
      aria-selected={isSelected}
      onClick      ={() => onSelect(item.personaId)}
      className    ={cn(
        "w-full rounded-lg border bg-card p-3 text-left transition",
        "hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isSelected && "ring-2 ring-primary bg-primary/5"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{item.displayName}</div>
          {showAliases.length > 0 && (
            <div className="truncate text-xs text-muted-foreground">
              {showAliases.join(" · ")}
              {aliasOverflow > 0 && <span> +{aliasOverflow}</span>}
            </div>
          )}
          {item.firstChapterNo !== null && (
            <div className="mt-0.5 text-xs text-muted-foreground">首章 第{item.firstChapterNo}回</div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {hasMultiCand && (
            <span
              aria-label="存在未消解候选"
              className ="inline-flex h-5 items-center gap-0.5 rounded bg-purple-100 px-1.5 text-[10px] font-medium text-purple-700 dark:bg-purple-950 dark:text-purple-300"
            >
              <Users className="h-3 w-3" />
              {item.personaCandidateIds.length}
            </span>
          )}
          {hasConflict && (
            <span
              aria-label={`冲突 ${item.totalConflictCount}`}
              className ="inline-flex h-5 items-center gap-0.5 rounded bg-amber-100 px-1.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300"
            >
              <AlertTriangle className="h-3 w-3" />
              {item.totalConflictCount}
            </span>
          )}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs tabular-nums">
        <span className="text-muted-foreground">事迹 <span className="text-foreground">{item.totalEventCount}</span></span>
        <span className="text-muted-foreground">关系 <span className="text-foreground">{item.totalRelationCount}</span></span>
        <span className="text-muted-foreground">
          待审 <span className={cn("text-foreground", item.pendingClaimCount > 0 && "text-orange-600 dark:text-orange-400 font-medium")}>{item.pendingClaimCount}</span>
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full bg-primary/40"
          style    ={{ width: `${Math.round(progressRatio * 100)}%` }}
        />
      </div>
    </button>
  );
});
