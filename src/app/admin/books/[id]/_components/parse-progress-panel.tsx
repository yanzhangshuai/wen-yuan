"use client";

/**
 * ============================================================================
 * 文件定位：`src/app/admin/books/[id]/_components/parse-progress-panel.tsx`
 * ----------------------------------------------------------------------------
 * 这是书籍详情页“解析进度”面板（客户端组件）。
 *
 * 核心职责：
 * - 周期性拉取书籍解析状态快照；
 * - 展示总体进度条与阶段信息；
 * - 展示章节级解析状态，并支持对失败/成功/待复核章节触发“重新解析”。
 *
 * React / Next.js 语义：
 * - `"use client"` 必须保留：轮询、点击事件、局部重试均依赖浏览器运行时；
 * - 该组件在详情页 Tabs 内按需挂载，避免不在“进度”Tab 时仍持续轮询。
 *
 * 关键业务规则：
 * - 当书籍状态进入 `COMPLETED` 或 `ERROR` 时自动停止轮询，降低无效请求；
 * - 仅允许 `FAILED` / `SUCCEEDED` / `REVIEW_PENDING` 章节重跑：
 *   1) `FAILED` 需要修复；
 *   2) `SUCCEEDED` 允许人工复跑提升质量；
 *   3) `REVIEW_PENDING` 表示章节已解析但需人工复核，可直接重跑；
 *   4) `PROCESSING`/等待中的章节禁止重复触发，避免并发冲突。
 * ============================================================================
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchBookStatus, reanalyzeChapters, type BookStatusSnapshot } from "@/lib/services/books";

/**
 * 面板入参。
 */
interface ParseProgressPanelProps {
  /** 书籍 ID（轮询与重跑请求的主键）。 */
  bookId       : string;
  /** 服务端首屏状态（客户端第一次轮询完成前的展示兜底）。 */
  initialStatus: string;
}

/**
 * 章节状态徽标。
 *
 * @param status 章节解析状态字符串
 * @returns 对应状态文案与颜色
 */
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

  if (status === "REVIEW_PENDING") {
    return (
      <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-medium">
        <AlertCircle className="w-3.5 h-3.5" /> 待复核
      </span>
    );
  }

  // 未知或等待状态统一降级展示，避免因新枚举导致 UI 崩溃。
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
      <span className="w-3.5 h-3.5 inline-flex items-center justify-center">○</span> 等待中
    </span>
  );
}

/**
 * 解析进度面板组件（容器型客户端组件）。
 */
export function ParseProgressPanel({ bookId, initialStatus }: ParseProgressPanelProps) {
  /** 最近一次状态快照；null 表示尚未拿到接口结果。 */
  const [snapshot, setSnapshot] = useState<BookStatusSnapshot | null>(null);

  /** 正在触发“重新解析”的章节集合，用于按钮 loading 与防重复点击。 */
  const [reanalyzingChapters, setReanalyzingChapters] = useState<Set<number>>(new Set());

  /** 章节级重跑错误信息，key 为章节号。 */
  const [reanalyzeErrors, setReanalyzeErrors] = useState<Map<number, string>>(new Map());

  /**
   * 轮询定时器引用。
   * 使用 ref 是为了在 effect 清理阶段拿到同一个定时器实例。
   */
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 当前状态优先取最新快照，否则回退服务端首屏状态。 */
  const currentStatus = snapshot?.status ?? initialStatus;

  /**
   * 是否可停止轮询。
   * - COMPLETED：任务已结束，无需继续请求；
   * - ERROR：任务失败，等待人工处理，继续轮询价值很低。
   */
  const isDone = currentStatus === "COMPLETED" || currentStatus === "ERROR";

  /**
   * 单次轮询函数。
   * 通过 useCallback 固定引用，避免 effect 因函数重建而反复重启。
   */
  const poll = useCallback(async () => {
    try {
      const data = await fetchBookStatus(bookId);
      setSnapshot(data);
    } catch {
      // 轮询失败时静默：避免短暂网络抖动导致页面频繁弹错。
    }
  }, [bookId]);

  /**
   * 组件挂载后先立即拉取一次，减少用户等待下一个轮询周期。
   */
  useEffect(() => {
    void poll();
  }, [poll]);

  /**
   * 轮询生命周期管理。
   *
   * 设计目的：
   * - 在解析进行中每 3 秒刷新；
   * - 任务结束或组件卸载时及时清理定时器，避免内存泄漏和重复请求。
   */
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

  /**
   * 触发单章重跑。
   *
   * @param chapterNo 章节号
   */
  const handleReanalyzeChapter = useCallback(async (chapterNo: number) => {
    // 标记该章进入“启动中”，并清除旧错误。
    setReanalyzingChapters(prev => new Set(prev).add(chapterNo));
    setReanalyzeErrors(prev => {
      const next = new Map(prev);
      next.delete(chapterNo);
      return next;
    });

    try {
      await reanalyzeChapters(bookId, [chapterNo]);

      // 立即刷新一次：尽快把书籍状态切到 PROCESSING，确保用户看到“已受理”。
      await poll();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "请求失败，请重试";
      setReanalyzeErrors(prev => new Map(prev).set(chapterNo, msg));
    } finally {
      // 无论成功失败，都解除按钮 loading 状态。
      setReanalyzingChapters(prev => {
        const next = new Set(prev);
        next.delete(chapterNo);
        return next;
      });
    }
  }, [bookId, poll]);

  /**
   * 总体进度值。
   * - 有快照时使用服务端进度；
   * - 没快照但状态已完成时展示 100%，避免“完成却 0%”的认知冲突；
   * - 其余回退 0。
   */
  const progress = snapshot?.progress ?? (currentStatus === "COMPLETED" ? 100 : 0);

  return (
    <div className="space-y-4">
      {/* 总体进度卡片：反映全书解析阶段与错误摘要 */}
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

            {/* 错误日志是排障关键线索，保留原文展示。 */}
            {snapshot.errorLog && (
              <p className="text-xs text-destructive">{snapshot.errorLog}</p>
            )}
          </CardContent>
        )}
      </Card>

      {/*
        章节级状态表：
        - 仅在后端返回章节列表时展示；
        - 支持对可重跑章节执行单章重试。
      */}
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
                    <th className="px-4 py-2 text-center">状态</th>
                    <th className="px-4 py-2 text-right w-24">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {snapshot!.chapters!.map((ch) => {
                    const isPending = reanalyzingChapters.has(ch.no);
                    const errMsg = reanalyzeErrors.get(ch.no);

                    // 当前业务允许：失败重跑 + 已成功重跑 + 待复核重跑；处理中/等待中禁用。
                    const canReanalyze = ch.parseStatus === "FAILED"
                      || ch.parseStatus === "SUCCEEDED"
                      || ch.parseStatus === "REVIEW_PENDING";

                    return (
                      <tr key={ch.no} className="border-t border-border">
                        <td className="px-4 py-2 text-muted-foreground">{ch.no}</td>
                        <td className="px-4 py-2 font-medium">
                          <div>{ch.title}</div>
                          {errMsg && (
                            <div className="text-xs text-destructive mt-0.5">{errMsg}</div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-center">
                          <ChapterStatusBadge status={ch.parseStatus} />
                        </td>
                        <td className="px-4 py-2 text-right">
                          {canReanalyze && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={isPending}
                              onClick={() => void handleReanalyzeChapter(ch.no)}
                            >
                              {isPending
                                ? <Loader2 className="w-3 h-3 animate-spin" />
                                : <RefreshCw className="w-3 h-3" />
                              }
                              <span className="ml-1">{isPending ? "启动中" : "重新解析"}</span>
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
