"use client";

import { useState } from "react";
import { Check, X as XIcon, ArrowRight, Loader2, Tag } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AliasMappingItem } from "@/lib/services/alias-mappings";
import {
  confirmAliasMapping,
  rejectAliasMapping
} from "@/lib/services/alias-mappings";

/* ------------------------------------------------
   Constants
   ------------------------------------------------ */

const ALIAS_TYPE_LABELS: Record<string, string> = {
  TITLE        : "称号/封号",
  POSITION     : "职位",
  KINSHIP      : "亲属称呼",
  NICKNAME     : "绰号",
  COURTESY_NAME: "字/号"
};

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  PENDING  : { label: "待审核", variant: "outline" },
  CONFIRMED: { label: "已确认", variant: "default" },
  REJECTED : { label: "已拒绝", variant: "destructive" }
};

/* ------------------------------------------------
   Props
   ------------------------------------------------ */

export interface AliasReviewTabProps {
  bookId       : string;
  aliasMappings: AliasMappingItem[];
  onRefresh    : () => void;
}

/* ------------------------------------------------
   Component
   ------------------------------------------------ */

export function AliasReviewTab({ bookId, aliasMappings, onRefresh }: AliasReviewTabProps) {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [typeFilter, setTypeFilter] = useState<string>("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const filtered = aliasMappings.filter(m => {
    if (statusFilter && m.status !== statusFilter) return false;
    if (typeFilter && m.aliasType !== typeFilter) return false;
    return true;
  });

  async function handleAction(mappingId: string, action: "confirm" | "reject") {
    setActionLoading(mappingId);
    try {
      if (action === "confirm") await confirmAliasMapping(bookId, mappingId);
      else await rejectAliasMapping(bookId, mappingId);
      onRefresh();
    } catch {
      // silent for now — the parent's error state can be extended
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Filter bar */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 rounded-md border border-border px-2 py-1">
          <Tag size={14} className="text-muted-foreground" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="bg-transparent text-xs text-foreground outline-none"
            aria-label="状态筛选"
          >
            <option value="">全部状态</option>
            <option value="PENDING">待审核</option>
            <option value="CONFIRMED">已确认</option>
            <option value="REJECTED">已拒绝</option>
          </select>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border px-2 py-1">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="bg-transparent text-xs text-foreground outline-none"
            aria-label="类型筛选"
          >
            <option value="">全部类型</option>
            {Object.entries(ALIAS_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length} 条记录
        </span>
      </div>

      {/* Empty state */}
      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-3 rounded-full bg-muted p-3">
            <Check size={20} className="text-success" />
          </div>
          <p className="text-sm text-muted-foreground">暂无别名映射记录</p>
        </div>
      )}

      {/* List */}
      {filtered.map(m => {
        const isLoading = actionLoading === m.id;
        const statusInfo = STATUS_LABELS[m.status] ?? { label: m.status, variant: "outline" as const };
        const typeLabel = ALIAS_TYPE_LABELS[m.aliasType] ?? m.aliasType;

        return (
          <div key={m.id} className="rounded-lg border border-border bg-card p-3 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              {/* Main content */}
              <div className="flex-1 min-w-0">
                {/* Alias → RealName */}
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="text-primary">&ldquo;{m.alias}&rdquo;</span>
                  <ArrowRight size={14} className="text-muted-foreground shrink-0" />
                  <span className={m.resolvedName ? "text-foreground" : "text-muted-foreground italic"}>
                    {m.resolvedName ?? "？待确认"}
                  </span>
                </div>
                {/* Badges */}
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Badge variant="secondary" className="text-[10px]">{typeLabel}</Badge>
                  <Badge variant={statusInfo.variant} className="text-[10px]">{statusInfo.label}</Badge>
                  <span className="text-[10px] text-muted-foreground">
                    置信度 {Math.round(m.confidence * 100)}%
                  </span>
                  {(m.chapterStart != null || m.chapterEnd != null) && (
                    <span className="text-[10px] text-muted-foreground">
                      第{m.chapterStart ?? "?"}–{m.chapterEnd ?? "?"}回
                    </span>
                  )}
                </div>
                {/* Evidence */}
                {m.evidence && (
                  <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">
                    依据：{m.evidence}
                  </p>
                )}
              </div>
              {/* Actions — only for PENDING */}
              {m.status === "PENDING" && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    disabled={isLoading}
                    onClick={() => { void handleAction(m.id, "confirm"); }}
                  >
                    {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    <span className="ml-1">确认</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                    disabled={isLoading}
                    onClick={() => { void handleAction(m.id, "reject"); }}
                  >
                    <XIcon size={12} />
                    <span className="ml-1">拒绝</span>
                  </Button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
