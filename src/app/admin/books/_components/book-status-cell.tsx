"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { fetchBookStatus, type BookStatusSnapshot } from "@/lib/services/books";

interface BookStatusCellProps {
  bookId       : string;
  initialStatus: string;
}

type UiBookStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "ERROR";

const STATUS_META_MAP: Record<UiBookStatus, { label: string; badgeVariant: "secondary" | "warning" | "success" | "destructive" }> = {
  PENDING: {
    label       : "待处理",
    badgeVariant: "secondary"
  },
  PROCESSING: {
    label       : "解析中",
    badgeVariant: "warning"
  },
  COMPLETED: {
    label       : "已完成",
    badgeVariant: "success"
  },
  ERROR: {
    label       : "失败",
    badgeVariant: "destructive"
  }
};

const POLLING_INTERVAL_MS = 3_000;

function toUiStatus(status: string): UiBookStatus {
  if (status === "PROCESSING" || status === "COMPLETED" || status === "ERROR") {
    return status;
  }
  return "PENDING";
}

function clampProgress(progress: number, status: UiBookStatus): number {
  if (!Number.isFinite(progress)) {
    return status === "COMPLETED" ? 100 : 0;
  }

  const rounded = Math.round(progress);
  if (rounded < 0) return 0;
  if (rounded > 100) return 100;
  return rounded;
}

function getDefaultProgress(status: UiBookStatus): number {
  if (status === "COMPLETED") return 100;
  return 0;
}

function getStageText(status: UiBookStatus, snapshot: BookStatusSnapshot | null): string {
  if (snapshot?.stage) {
    return snapshot.stage;
  }

  if (status === "ERROR" && snapshot?.errorLog) {
    return snapshot.errorLog;
  }

  if (status === "PROCESSING") {
    return "解析中";
  }

  if (status === "COMPLETED") {
    return "完成";
  }

  if (status === "ERROR") {
    return "解析失败";
  }

  return "待解析";
}

export function BookStatusCell({ bookId, initialStatus }: BookStatusCellProps) {
  const [snapshot, setSnapshot] = useState<BookStatusSnapshot | null>(null);
  const [isFetching, setIsFetching] = useState(false);

  const uiStatus = useMemo(() => toUiStatus(snapshot?.status ?? initialStatus), [initialStatus, snapshot?.status]);
  const progress = useMemo(
    () => clampProgress(snapshot?.progress ?? getDefaultProgress(uiStatus), uiStatus),
    [snapshot?.progress, uiStatus]
  );
  const stageText = useMemo(() => getStageText(uiStatus, snapshot), [snapshot, uiStatus]);

  const refreshStatus = useCallback(async () => {
    try {
      setIsFetching(true);
      const latest = await fetchBookStatus(bookId);
      setSnapshot(latest);
    } catch {
      // 保持静默失败：不打断页面操作，下一次轮询继续尝试。
    } finally {
      setIsFetching(false);
    }
  }, [bookId]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (uiStatus !== "PROCESSING") {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshStatus();
    }, POLLING_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [refreshStatus, uiStatus]);

  return (
    <div className="book-status-cell flex min-w-44 flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Badge variant={STATUS_META_MAP[uiStatus].badgeVariant}>
          {STATUS_META_MAP[uiStatus].label}
        </Badge>
        {uiStatus === "PROCESSING" && isFetching && (
          <Loader2 size={14} className="text-muted-foreground animate-spin" />
        )}
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="max-w-32 truncate">{stageText}</span>
        <span>{progress}%</span>
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full transition-[width] duration-300",
            uiStatus === "ERROR"
              ? "bg-destructive"
              : uiStatus === "COMPLETED"
                ? "bg-success"
                : "bg-(--color-warning)"
          )}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
