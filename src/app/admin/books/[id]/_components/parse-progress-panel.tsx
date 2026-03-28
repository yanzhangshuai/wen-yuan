"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { fetchBookStatus, type BookStatusSnapshot } from "@/lib/services/books";

interface ParseProgressPanelProps {
  bookId       : string;
  initialStatus: string;
}

function ChapterStatusBadge({ status }: { status: string }) {
  if (status === "SUCCEEDED") {
    return (
      <span className="inline-flex items-center gap-1 text-green-600 text-xs font-medium">
        <CheckCircle2 className="w-3.5 h-3.5" /> 完成
      </span>
    );
  }
  if (status === "PROCESSING") {
    return (
      <span className="inline-flex items-center gap-1 text-blue-500 text-xs font-medium">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> 解析中
      </span>
    );
  }
  if (status === "FAILED") {
    return (
      <span className="inline-flex items-center gap-1 text-destructive text-xs font-medium">
        <XCircle className="w-3.5 h-3.5" /> 失败
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
      <span className="w-3.5 h-3.5 inline-flex items-center justify-center">○</span> 等待中
    </span>
  );
}

export function ParseProgressPanel({ bookId, initialStatus }: ParseProgressPanelProps) {
  const [snapshot, setSnapshot] = useState<BookStatusSnapshot | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const currentStatus = snapshot?.status ?? initialStatus;
  const isDone = currentStatus === "COMPLETED" || currentStatus === "ERROR";

  const poll = useCallback(async () => {
    try {
      const data = await fetchBookStatus(bookId);
      setSnapshot(data);
    } catch {
      // 静默忽略轮询错误
    }
  }, [bookId]);

  useEffect(() => {
    void poll();
  }, [poll]);

  useEffect(() => {
    if (isDone) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    pollingRef.current = setInterval(() => { void poll(); }, 3000);
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [isDone, poll]);

  const progress = snapshot?.progress ?? (currentStatus === "COMPLETED" ? 100 : 0);

  return (
    <div className="space-y-4">
      {/* 总体进度卡片 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {currentStatus === "COMPLETED" ? (
              <CheckCircle2 className="text-green-500 w-5 h-5" />
            ) : currentStatus === "ERROR" ? (
              <XCircle className="text-destructive w-5 h-5" />
            ) : (
              <Loader2 className="animate-spin w-5 h-5" />
            )}
            {currentStatus === "COMPLETED"
              ? "解析完成"
              : currentStatus === "ERROR"
                ? "解析出错"
                : currentStatus === "PROCESSING"
                  ? "解析进行中"
                  : "待解析"}
          </CardTitle>
          {snapshot && (
            <CardDescription>
              {snapshot.stage ?? "等待任务启动..."}{" "}
              — {progress}%
            </CardDescription>
          )}
        </CardHeader>
        {snapshot && (
          <CardContent className="space-y-3">
            <div className="w-full bg-muted rounded-full h-2">
              <div
                className={cn(
                  "h-2 rounded-full transition-all duration-700",
                  currentStatus === "ERROR" ? "bg-destructive" : "bg-primary"
                )}
                style={{ width: `${progress}%` }}
              />
            </div>
            {snapshot.errorLog && (
              <p className="text-xs text-destructive">{snapshot.errorLog}</p>
            )}
          </CardContent>
        )}
      </Card>

      {/* 章节解析状态表 */}
      {(snapshot?.chapters?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">章节解析状态</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/10 sticky top-0 backdrop-blur">
                  <tr>
                    <th className="px-4 py-2 text-left w-12">章</th>
                    <th className="px-4 py-2 text-left">标题</th>
                    <th className="px-4 py-2 text-right">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot!.chapters!.map((ch) => (
                    <tr key={ch.no} className="border-t border-border">
                      <td className="px-4 py-2 text-muted-foreground">{ch.no}</td>
                      <td className="px-4 py-2 font-medium">{ch.title}</td>
                      <td className="px-4 py-2 text-right">
                        <ChapterStatusBadge status={ch.parseStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
