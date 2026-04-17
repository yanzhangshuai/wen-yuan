"use client";

/**
 * ============================================================================
 * 文件定位：`src/app/admin/books/[id]/candidates/_components/candidates-table.tsx`
 * ----------------------------------------------------------------------------
 * 候选人物只读表格（客户端组件）。
 *
 * 业务职责：
 * - 拉取 `GET /api/admin/books/:id/candidates?page=&page_size=&q=`；
 * - 渲染 §0-11 管线 KPI 徽章（总数阈值：≤200 绿 / 200–300 黄 / >300 红）；
 * - 提供 canonicalName 子串搜索 + 简单分页；
 * - 本页只读，不提供晋级/合并/驳回操作（职责移交 T07 审核中心）。
 *
 * 为什么直接用 fetch 而不是 `clientFetch`：
 * - 本接口除了 data 外还需要读取 meta.pagination.total 计算 KPI 徽章与翻页；
 * - `clientFetch` 只返 data 字段，若在这里二次改造会增加通用层负担，
 *   因此本组件自行解析响应信封。
 * ============================================================================
 */

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import {
  readClientApiErrorMessage,
  readClientApiResponse
} from "@/lib/client-api";

/**
 * 候选人物列表项。
 * 结构与 `src/app/api/admin/books/[id]/candidates/route.ts` 的 DTO 对齐。
 */
export interface CandidatePersonaListItem {
  id                     : string;
  canonicalName          : string;
  mentionCount           : number;
  distinctChapters       : number;
  effectiveBiographyCount: number;
  aliasesPreview         : string[];
  aliasesTotal           : number;
  createdAt              : string;
}

interface CandidatesTableProps {
  /** 书籍 ID，用于构造 API URL。 */
  bookId: string;
}

/** 每页条数：50 与 PRD §0-FINAL 默认 50/页一致。 */
const PAGE_SIZE = 50;

/**
 * KPI 阈值门槛：§0-11 管线规模。
 * 这些值是业务门槛，不是 UI 魔法数，修改会影响"是否回炉"判定。
 */
const KPI_THRESHOLD_PASS = 200;
const KPI_THRESHOLD_WATCH = 300;

/**
 * 根据候选总数推导 KPI 徽章属性。
 *
 * @param total 候选总数
 * @returns 徽章 variant + 中文判定文案
 */
export function resolveKpiBadge(total: number): {
  variant: "success" | "warning" | "destructive";
  label  : string;
} {
  if (total <= KPI_THRESHOLD_PASS) {
    return { variant: "success", label: "合格（≤200）" };
  }
  if (total <= KPI_THRESHOLD_WATCH) {
    return { variant: "warning", label: "观察（200–300）" };
  }
  return { variant: "destructive", label: "管线回炉（>300）" };
}

/** 本地日期格式化，保持与详情页一致的 zh-CN 风格。 */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-CN", {
    year : "numeric",
    month: "2-digit",
    day  : "2-digit"
  });
}

export function CandidatesTable({ bookId }: CandidatesTableProps) {
  const [items, setItems] = useState<CandidatePersonaListItem[] | null>(null);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [queryInput, setQueryInput] = useState<string>("");
  const [query, setQuery] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // 使用 ref 记录最近一次请求序号，避免高频翻页/搜索产生的过期回写。
  const reqSeqRef = useRef(0);

  const load = useCallback(async () => {
    const seq = ++reqSeqRef.current;
    setLoading(true);
    setError(null);

    try {
      const url = new URL(
        `/api/admin/books/${encodeURIComponent(bookId)}/candidates`,
        typeof window !== "undefined" ? window.location.origin : "http://localhost"
      );
      url.searchParams.set("page", String(page));
      url.searchParams.set("page_size", String(PAGE_SIZE));
      if (query) url.searchParams.set("q", query);

      const res = await fetch(url.pathname + url.search);
      const payload: unknown = await res.json();
      const parsed = readClientApiResponse(payload);

      // 若请求已过期（用户又翻了一页），直接丢弃结果避免 UI 乱序。
      if (seq !== reqSeqRef.current) return;

      if (!parsed?.success) {
        throw new Error(readClientApiErrorMessage(payload, "候选人物列表获取失败"));
      }

      const data = parsed.data as CandidatePersonaListItem[];
      // pagination meta 在 payload.meta.pagination，client-api 未暴露，这里直接读裸结构。
      const paginationTotal =
        typeof payload === "object"
        && payload !== null
        && "meta" in payload
        && typeof (payload as { meta?: { pagination?: { total?: number } } }).meta?.pagination?.total === "number"
          ? (payload as { meta: { pagination: { total: number } } }).meta.pagination.total
          : data.length;

      setItems(data);
      setTotal(paginationTotal);
    } catch (err) {
      if (seq !== reqSeqRef.current) return;
      setError(err instanceof Error ? err.message : "候选人物列表获取失败");
    } finally {
      if (seq === reqSeqRef.current) setLoading(false);
    }
  }, [bookId, page, query]);

  useEffect(() => {
    void load();
  }, [load]);

  // 当搜索词变化（提交后）时回到第 1 页。
  const handleSubmitSearch = useCallback(() => {
    setQuery(queryInput.trim());
    setPage(1);
  }, [queryInput]);

  const kpi = resolveKpiBadge(total);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-4">
      {/* KPI 汇总 + 搜索栏 */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">共</span>
          <span className="text-lg font-semibold">{total}</span>
          <span className="text-sm text-muted-foreground">个 CANDIDATE</span>
          <Badge variant={kpi.variant} data-testid="kpi-badge">{kpi.label}</Badge>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Input
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleSubmitSearch(); }}
            placeholder="搜索候选人姓名…"
            className="w-64"
          />
          <Button size="sm" variant="secondary" onClick={handleSubmitSearch}>
            <Search size={14} className="mr-1" />
            搜索
          </Button>
        </div>
      </div>

      {/* 结果区域 */}
      <Card>
        <CardContent className="pt-6">
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          {!error && items === null && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 size={16} className="animate-spin" />
              加载候选人物列表…
            </div>
          )}

          {!error && items !== null && items.length === 0 && (
            <p className="text-sm text-muted-foreground">暂无候选人物。</p>
          )}

          {!error && items !== null && items.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>canonicalName</TableHead>
                  <TableHead className="text-right">mentionCount</TableHead>
                  <TableHead className="text-right">distinctChapters</TableHead>
                  <TableHead className="text-right">effectiveBio</TableHead>
                  <TableHead>aliases</TableHead>
                  <TableHead className="w-28">创建时间</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, idx) => {
                  const seq = (page - 1) * PAGE_SIZE + idx + 1;
                  const more = item.aliasesTotal - item.aliasesPreview.length;
                  const aliasText = item.aliasesPreview.length > 0
                    ? item.aliasesPreview.join("、") + (more > 0 ? `… (+${more})` : "")
                    : "—";
                  return (
                    <TableRow key={item.id}>
                      <TableCell className="text-muted-foreground">{seq}</TableCell>
                      <TableCell className="font-medium">{item.canonicalName}</TableCell>
                      <TableCell className="text-right">{item.mentionCount}</TableCell>
                      <TableCell className="text-right">{item.distinctChapters}</TableCell>
                      <TableCell className="text-right">{item.effectiveBiographyCount}</TableCell>
                      <TableCell className="text-muted-foreground">{aliasText}</TableCell>
                      <TableCell className="text-muted-foreground">{formatDate(item.createdAt)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 分页条 */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            第 {page} / {totalPages} 页
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || loading}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              上一页
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages || loading}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              下一页
            </Button>
          </div>
        </div>
      )}

      {/* 审核中心入口提示：告诉管理员想做动作请去 T07 审核中心。 */}
      <p className="text-xs text-muted-foreground">
        需要晋级 / 合并 / 驳回？请前往{" "}
        <Link
          href={`/admin/books/${bookId}`}
          className="underline underline-offset-2 hover:text-foreground"
        >
          书籍审核中心
        </Link>
        。
      </p>
    </div>
  );
}
