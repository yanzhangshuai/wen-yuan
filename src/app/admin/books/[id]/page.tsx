/**
 * ============================================================================
 * 文件定位：`src/app/admin/books/[id]/page.tsx`
 * ----------------------------------------------------------------------------
 * 这是管理端书籍详情页，路由为 `/admin/books/[id]`。
 *
 * Next.js 语义：
 * - 文件名为 `page.tsx`，且位于动态段 `[id]` 下，说明该页面由路由参数 `id` 驱动；
 * - 未声明 `"use client"`，因此它是 Server Component：
 *   1) 数据查询在服务端执行，避免把数据库访问能力暴露到浏览器；
 *   2) 首屏 HTML 可直接包含书籍基础信息，有利于首屏与 SEO；
 *   3) 客户端只承载需要交互的子组件（本页中的 `BookDetailTabs`）。
 *
 * 业务职责：
 * - 查询并展示书籍概览（状态、作者、章节数、人物数、源文件信息、最近错误）；
 * - 为下游客户端面板提供 `bookId` 与初始状态；
 * - 当书籍不存在时输出业务 404 页面（由 `not-found.tsx` 承接）。
 *
 * 上下游关系：
 * - 上游输入：路由参数 `params.id`；
 * - 核心下游：`getBookById`（server module 聚合 DTO）；
 * - 下游组件：`BookRowActions`（操作区）、`BookDetailTabs`（进度/任务/人物/策略）。
 *
 * 维护注意：
 * - `notFound()` 是路由语义，不是普通异常处理，删除会影响 404 行为与用户路径；
 * - `STATUS_META` 的文案和颜色是运营语义映射，调整需与管理台状态设计同步。
 * ============================================================================
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  FileText,
  ShieldCheck,
  UserSearch,
  Users
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookRowActions } from "@/app/admin/books/_components/book-row-actions";
import { getBookById } from "@/server/modules/books/getBookById";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { type BookStatus } from "@/types/book";
import { PageContainer } from "@/components/layout/page-header";

import { BookDetailTabs } from "./_components/book-detail-tabs";

/**
 * 页面入参。
 * 在当前 Next.js 版本下，动态路由参数可按 Promise 形式传入 Server Component，
 * 因此这里显式声明 `params: Promise<{ id: string }>` 并 `await params`。
 */
interface BookDetailPageProps {
  /** 路由参数，`id` 对应 `/admin/books/[id]` 的动态片段。 */
  params: Promise<{ id: string }>;
}

/**
 * 书籍状态到展示信息的映射。
 *
 * 业务意图：
 * - 保持状态文案与视觉等级一致；
 * - 统一由页面层映射，避免在多个子组件重复散落同一规则。
 */
const STATUS_META: Record<BookStatus, { label: string; variant: "secondary" | "warning" | "success" | "destructive" }> = {
  PENDING   : { label: "待处理", variant: "secondary" },
  PROCESSING: { label: "解析中", variant: "warning"   },
  COMPLETED : { label: "已完成", variant: "success"   },
  ERROR     : { label: "解析失败", variant: "destructive" }
};

/**
 * 文件大小格式化。
 *
 * @param bytes 源文件字节数；`null` 表示无可用大小信息
 * @returns 用于页面展示的体积文案
 */
function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 日期格式化（中文本地格式）。
 *
 * @param iso ISO 时间字符串（来自服务端 DTO）
 * @returns `yyyy/mm/dd` 风格日期文本
 */
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-CN", {
    year : "numeric",
    month: "2-digit",
    day  : "2-digit"
  });
}

/**
 * 书籍详情页主组件（Server Component）。
 */
export default async function BookDetailPage({ params }: BookDetailPageProps) {
  // 解析动态路由参数。这里的 id 是全页数据查询与操作的主键。
  const { id } = await params;

  let book;
  try {
    // 服务端直接读取聚合 DTO，避免客户端串行请求带来的瀑布流。
    book = await getBookById(id);
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      // Next.js 特性：`notFound()` 会中断当前渲染并切换到同路由段的 `not-found.tsx`。
      notFound();
    }
    // 非预期异常继续抛出，交由上层错误边界处理。
    throw error;
  }

  // 防御性兜底：若后端新增状态但前端未更新映射，至少显示原始状态字符串。
  const statusMeta = STATUS_META[book.status] ?? { label: book.status, variant: "secondary" as const };

  return (
    <PageContainer className="pb-16">
      {/* 面包屑导航：提供回退路径，降低深层页面迷失感。 */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/books" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ArrowLeft size={14} />
          书库管理
        </Link>
        <span>/</span>
        <span className="text-foreground">{book.title}</span>
      </div>

      {/* 页头摘要区：展示管理员最关心的“状态 + 关键统计 + 风险提示”。 */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold text-foreground truncate">{book.title}</h1>
            <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
          </div>

          {/* 基础元数据：字段缺失时不渲染，避免页面出现空标签。 */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
            {book.author && <span>作者：{book.author}</span>}
            {book.dynasty && <span>朝代：{book.dynasty}</span>}
            {book.currentModel && <span>当前模型：{book.currentModel}</span>}
            {book.lastArchitecture && (
              <span>解析架构：{book.lastArchitecture === "sequential" ? "顺序式" : "三阶段"}</span>
            )}
          </div>

          {/* 业务统计信息：章节数/人物数/创建时间/源文件。 */}
          <div className="flex items-center gap-6 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <BookOpen size={14} />
              {book.chapterCount} 章
            </span>
            <span className="flex items-center gap-1">
              <Users size={14} />
              {book.personaCount} 人物
            </span>
            <span className="flex items-center gap-1">
              <Calendar size={14} />
              创建于 {formatDate(book.createdAt)}
            </span>
            {book.sourceFile.name && (
              <span className="flex items-center gap-1">
                <FileText size={14} />
                {book.sourceFile.name}
                {book.sourceFile.size !== null && (
                  <span>（{formatFileSize(book.sourceFile.size)}）</span>
                )}
              </span>
            )}
          </div>

          {/* 错误摘要：当最近任务失败或书级错误存在时进行醒目提示。 */}
          {book.lastErrorSummary && (
            <p className="text-sm text-destructive">{book.lastErrorSummary}</p>
          )}
        </div>

        {/* 右上角操作区（删除、重跑等），与列表页复用同一动作组件。 */}
        <div className="flex-shrink-0 flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/books/${book.id}/candidates`} className="inline-flex items-center gap-1">
              <UserSearch size={14} />
              候选人物
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/admin/books/${book.id}/review-center`} className="inline-flex items-center gap-1">
              <ShieldCheck size={14} />
              审核中心
            </Link>
          </Button>
          <BookRowActions bookId={book.id} bookTitle={book.title} />
        </div>
      </div>

      {/*
        详情页主内容 Tabs（Client Component）：
        - 放到客户端是因为包含轮询、点击切换、按需加载等交互；
        - 通过 props 传入 bookId 和初始状态，保持服务端与客户端上下文一致。
      */}
      <BookDetailTabs bookId={book.id} initialStatus={book.status} />
    </PageContainer>
  );
}
