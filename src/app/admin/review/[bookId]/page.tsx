import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { getBookById } from "@/server/modules/books/getBookById";
import { listBooks } from "@/server/modules/books/listBooks";
import { listAdminDrafts } from "@/server/modules/review/listDrafts";
import { listMergeSuggestions } from "@/server/modules/review/mergeSuggestions";
import { ReviewPanel } from "@/components/review/review-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * =============================================================================
 * 文件定位（Next.js 动态页面路由：单书审核页）
 * -----------------------------------------------------------------------------
 * 文件路径：`app/admin/review/[bookId]/page.tsx`
 * 路由语义：`[bookId]` 是动态路由段，对应 URL `/admin/review/:bookId`。
 *
 * 在 Next.js 渲染链路中的角色：
 * 1) 本文件是 Server Component 页面入口，负责首屏数据聚合；
 * 2) 首屏通过服务端并发拉取“书籍信息 + 草稿数据 + 合并建议”；
 * 3) 将首屏数据作为 props 传给客户端组件 `ReviewPanel`，用于后续交互刷新。
 *
 * 业务职责：
 * - 为某本书提供完整审核工作台（左侧书籍切换 + 右侧审核主面板）。
 *
 * 关键约束：
 * - `bookId` 无效时必须走 `notFound()`，交由 Next.js 404 机制接管；
 * - 页面只负责“数据装配与布局”，具体审核动作在客户端面板和 API 层执行。
 * =============================================================================
 */
interface AdminBookReviewPageProps {
  /**
   * Next.js App Router 在服务端页面中传入的动态路由参数。
   * 这里定义为 Promise 是为了兼容当前项目的参数读取方式，调用方会 `await params`。
   */
  params: Promise<{ bookId: string }>;
}

export async function generateMetadata({ params }: AdminBookReviewPageProps): Promise<Metadata> {
  // 动态 metadata：根据书名生成标题，提升后台多标签页可辨识度。
  const { bookId } = await params;
  try {
    const book = await getBookById(bookId);
    return { title: `审核 · ${book.title}` };
  } catch {
    // 兜底标题：避免 metadata 生成失败影响页面响应。
    return { title: "审核中心" };
  }
}

export default async function AdminBookReviewPage({
  params
}: AdminBookReviewPageProps) {
  const { bookId } = await params;

  let book;
  try {
    // 先校验书籍是否存在，避免后续查询浪费资源且保证路由语义正确。
    book = await getBookById(bookId);
  } catch {
    // Next.js 内置 404 分支：触发当前路由段 not-found.tsx（若存在）或全局 404 页面。
    notFound();
  }

  // 并发请求首屏数据，减少总等待时间：
  // - allBooks：左侧导航所需
  // - initialDrafts：审核面板首屏草稿
  // - initialMergeSuggestions：合并建议首屏数据
  const [allBooks, initialDrafts, initialMergeSuggestions] = await Promise.all([
    listBooks(),
    listAdminDrafts({ bookId }),
    listMergeSuggestions({ bookId })
  ]);

  return (
    <div className="flex gap-6 items-start">
      {/* 左侧书籍导航：支持在审核页内部快速切换书籍，减少来回跳转。 */}
      <aside className="w-44 shrink-0">
        <div className="sticky top-20">
          <h2 className="text-xs font-medium text-muted-foreground mb-3 px-2 uppercase tracking-wider">
            选择书籍
          </h2>
          <nav className="space-y-0.5">
            {allBooks.map((b) => (
              <Link
                key={b.id}
                href={`/admin/review/${b.id}`}
                className={cn(
                  "flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                  b.id === bookId
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground hover:bg-accent"
                )}
              >
                {/* 标题可能较长，使用 truncate 防止挤压右侧数字。 */}
                <span className="truncate">{b.title}</span>
                <span className="ml-2 text-xs text-muted-foreground/70 shrink-0 tabular-nums">
                  {b.personaCount}
                </span>
              </Link>
            ))}
          </nav>
        </div>
      </aside>

      {/* 右侧审核主体：由客户端组件承载复杂交互（筛选、批量操作、编辑等）。 */}
      <div className="flex-1 min-w-0">
        <Suspense
          fallback={
            <div className="flex flex-col gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          }
        >
          <ReviewPanel
            bookId={bookId}
            bookTitle={book.title}
            initialDrafts={initialDrafts}
            initialMergeSuggestions={initialMergeSuggestions}
            // 当前页面首批次不预注入 alias/validation，ReviewPanel 会在客户端按需懒加载。
          />
        </Suspense>
      </div>
    </div>
  );
}
