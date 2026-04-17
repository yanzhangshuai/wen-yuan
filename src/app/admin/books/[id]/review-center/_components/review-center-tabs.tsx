"use client";

/**
 * ============================================================================
 * 文件定位：`src/app/admin/books/[id]/review-center/_components/review-center-tabs.tsx`
 * ----------------------------------------------------------------------------
 * 审核中心 Tab 容器（客户端组件）。
 *
 * 业务职责：
 * - 在 `merge` / `impersonation` / `done` 三个 Tab 间切换；
 * - 调用 `GET /api/admin/books/:id/merge-suggestions?tab=&page=` 拉取当前 Tab 数据；
 * - 处理 POST `.../accept` 与 `.../reject`，并在操作后刷新当前 Tab；
 * - 行级提供 evidence 折叠/展开（不做全局展开，避免长列表性能抖动）。
 *
 * 运行环境：
 * - 必须 `"use client"`：依赖 useState/useEffect、fetch 与点击事件；
 * - 接口响应信封自行解析，读取 `meta.pagination.total` 渲染分页。
 * ============================================================================
 */

import { useCallback, useEffect, useState } from "react";
import { Loader2, ChevronDown, ChevronUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger
} from "@/components/ui/tabs";
import {
  readClientApiErrorMessage,
  readClientApiResponse
} from "@/lib/client-api";

/**
 * API 返回的单条合并建议。
 *
 * 字段契约与 `src/server/modules/review/mergeSuggestions.ts#MergeSuggestionItem` 对齐。
 */
interface ReviewSuggestionItem {
  id             : string;
  bookId         : string;
  bookTitle      : string;
  sourcePersonaId: string;
  sourceName     : string;
  targetPersonaId: string | null;
  targetName     : string | null;
  reason         : string;
  confidence     : number;
  evidenceRefs   : unknown;
  status         : string;
  source         : string;
  createdAt      : string;
  resolvedAt     : string | null;
}

interface ReviewCenterTabsProps {
  /** 书籍 ID，用于构造 API URL。 */
  bookId: string;
}

const TABS = [
  { key: "merge", label: "MERGE 建议" },
  { key: "impersonation", label: "冒名候选" },
  { key: "done", label: "已处理" }
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** 每页条数：与 `/candidates` 页面保持 20/页，避免单屏过长。 */
const PAGE_SIZE = 20;

/**
 * 为建议 source 选择 Badge 变体。
 *
 * - `STAGE_B_AUTO`：默认灰；
 * - `STAGE_C_FEEDBACK`：warning（反馈通道，意味着 Stage B 漏判）；
 * - `STAGE_B5_TEMPORAL`：destructive（疑似冒名，风险信号）。
 */
function sourceBadgeVariant(source: string): "secondary" | "warning" | "destructive" {
  if (source === "STAGE_B5_TEMPORAL") return "destructive";
  if (source === "STAGE_C_FEEDBACK") return "warning";
  return "secondary";
}

/** persona id 缩写，用于审核面板可读性；取前 6 位足以在同一书内区分。 */
function shortId(id: string | null): string {
  if (!id) return "-";
  return id.slice(0, 6);
}

/** 置信度渲染为百分比，保留 1 位小数。 */
function formatConfidence(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function ReviewCenterTabs({ bookId }: ReviewCenterTabsProps) {
  const [tab, setTab] = useState<TabKey>("merge");
  const [items, setItems] = useState<ReviewSuggestionItem[] | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [actionPending, setActionPending] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const url = new URL(
        `/api/admin/books/${encodeURIComponent(bookId)}/merge-suggestions`,
        window.location.origin
      );
      url.searchParams.set("tab", tab);
      url.searchParams.set("page", String(page));
      url.searchParams.set("page_size", String(PAGE_SIZE));

      const response = await fetch(url.toString(), { credentials: "include" });
      const payload = (await response.json()) as unknown;
      const apiResponse = readClientApiResponse(payload);

      if (!apiResponse || !apiResponse.success) {
        setError(readClientApiErrorMessage(payload) ?? "请求失败");
        setItems([]);
        setTotal(0);
        return;
      }

      const data = (apiResponse.data as ReviewSuggestionItem[]) ?? [];
      setItems(data);
      // meta 结构遵循项目统一响应信封：{ meta: { pagination: { total } } }。
      const rawTotal = (payload as { meta?: { pagination?: { total?: number } } })
        ?.meta?.pagination?.total;
      setTotal(typeof rawTotal === "number" ? rawTotal : data.length);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : "网络错误");
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [bookId, tab, page]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runAction = useCallback(async (suggestionId: string, action: "accept" | "reject") => {
    setActionPending(suggestionId);
    try {
      const url = `/api/admin/books/${encodeURIComponent(bookId)}/merge-suggestions/${encodeURIComponent(suggestionId)}/${action}`;
      const response = await fetch(url, {
        method     : "POST",
        credentials: "include"
      });
      const payload = (await response.json()) as unknown;
      const apiResponse = readClientApiResponse(payload);
      if (!apiResponse || !apiResponse.success) {
        // 不抛出：直接把错误文案显示在顶部错误条，避免跳 error.tsx 影响 Tab 状态。
        setError(readClientApiErrorMessage(payload) ?? `${action === "accept" ? "接受" : "拒绝"}失败`);
        return;
      }
      // 成功：刷新当前 Tab；ACCEPTED/REJECTED 后行应自动从 PENDING Tab 消失。
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "网络错误");
    } finally {
      setActionPending(null);
    }
  }, [bookId, load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const canAct = tab !== "done";

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        // 切 Tab 时重置分页 & 展开状态，避免跨 Tab 状态错位。
        setTab(value as TabKey);
        setPage(1);
        setExpanded(new Set());
      }}
    >
      <TabsList>
        {TABS.map((item) => (
          <TabsTrigger key={item.key} value={item.key}>
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {TABS.map((item) => (
        <TabsContent key={item.key} value={item.key} className="space-y-4 mt-4">
          {error && (
            <div className="text-sm text-destructive border border-destructive/30 rounded p-2">
              {error}
            </div>
          )}

          {loading && items === null ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={14} className="animate-spin" />
              加载中…
            </div>
          ) : items && items.length === 0 ? (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground text-center">
                暂无记录
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {items?.map((row) => {
                const isOpen = expanded.has(row.id);
                return (
                  <Card key={row.id}>
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary">#{shortId(row.id)}</Badge>
                        <Badge variant={sourceBadgeVariant(row.source)}>{row.source}</Badge>
                        <Badge variant="secondary">{row.status}</Badge>
                        <span className="text-xs text-muted-foreground ml-auto">
                          置信度 {formatConfidence(row.confidence)}
                        </span>
                      </div>

                      <div className="text-sm text-foreground">
                        <span className="font-medium">{row.sourceName}</span>
                        <span className="text-muted-foreground"> （{shortId(row.sourcePersonaId)}）</span>
                        <span className="mx-2 text-muted-foreground">→</span>
                        <span className="font-medium">{row.targetName ?? "-"}</span>
                        <span className="text-muted-foreground"> （{shortId(row.targetPersonaId)}）</span>
                      </div>

                      <div className="text-sm text-muted-foreground whitespace-pre-wrap">{row.reason}</div>

                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        onClick={() => toggleExpanded(row.id)}
                      >
                        {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        证据 {isOpen ? "收起" : "展开"}
                      </button>

                      {isOpen && (
                        <pre className="text-xs bg-muted rounded p-2 overflow-auto max-h-64">
                          {JSON.stringify(row.evidenceRefs, null, 2)}
                        </pre>
                      )}

                      {canAct && (
                        <div className="flex items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            disabled={actionPending === row.id}
                            onClick={() => { void runAction(row.id, "accept"); }}
                          >
                            {actionPending === row.id ? "处理中…" : "接受"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={actionPending === row.id}
                            onClick={() => { void runAction(row.id, "reject"); }}
                          >
                            拒绝
                          </Button>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {/* 简单分页器：审核中心优先快速处理，不做跳转页码输入。 */}
          {items && items.length > 0 && totalPages > 1 && (
            <div className="flex items-center gap-2 pt-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一页
              </Button>
              <span className="text-xs text-muted-foreground">
                第 {page} / {totalPages} 页（共 {total} 条）
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={page >= totalPages || loading}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                下一页
              </Button>
            </div>
          )}
        </TabsContent>
      ))}
    </Tabs>
  );
}
