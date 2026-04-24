/**
 * ============================================================================
 * 文件定位：`src/app/admin/books/[id]/review-center/page.tsx`
 * ----------------------------------------------------------------------------
 * 管理端“书籍审核中心”旧入口页面，路由为 `/admin/books/:id/review-center`。
 *
 * 业务职责：
 * - T20 后该页面仅保留迁移提示，不再承载旧 review-center tabs 与 merge-suggestion 工作流；
 * - 为仍持有旧书签的操作员提供稳定的迁移落点，指向新的 evidence-first 审核页面。
 *
 * 设计说明：
 * - Server Component 只负责书籍存在性校验与迁移提示渲染；
 * - 不再加载任何旧版审核交互组件，避免旧栈被误恢复为主审核入口。
 * ============================================================================
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, Clock3, Link2, Rows3 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageContainer } from "@/components/layout/page-header";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { getBookById } from "@/server/modules/books/getBookById";

interface ReviewCenterPageProps {
  /** 路由参数：`[id]` 动态段。Next.js 15+ 以 Promise 形式传入。 */
  params: Promise<{ id: string }>;
}

export default async function ReviewCenterPage({ params }: ReviewCenterPageProps) {
  const { id } = await params;

  let book;
  try {
    // 服务端提前校验书籍存在性，避免客户端先渲染骨架后才提示 404。
    book = await getBookById(id);
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      notFound();
    }
    throw error;
  }

  return (
    <PageContainer className="pb-16">
      {/* 面包屑：回退路径，降低深层页面迷失感。 */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/books" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ArrowLeft size={14} />
          书库管理
        </Link>
        <span>/</span>
        <Link
          href={`/admin/books/${book.id}`}
          className="hover:text-foreground transition-colors"
        >
          {book.title}
        </Link>
        <span>/</span>
        <span className="text-foreground">审核中心</span>
      </div>

      <div className="space-y-4 rounded-2xl border border-border/70 bg-card p-6 shadow-sm">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-foreground">旧审核中心已迁移</h1>
          <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
            该书签页面保留为迁移提示，不再加载旧版 merge-suggestion tabs，也不再作为审核主入口。
            请改用新的 evidence-first 审核工作台继续处理人物事迹、关系和时间线。
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <Button asChild variant="outline" className="h-auto justify-between px-4 py-4">
            <Link href={`/admin/review/${book.id}`}>
              <span className="flex items-center gap-2">
                <Rows3 size={16} />
                人物 × 章节审核
              </span>
              <ArrowRight size={16} />
            </Link>
          </Button>

          <Button asChild variant="outline" className="h-auto justify-between px-4 py-4">
            <Link href={`/admin/review/${book.id}/relations`}>
              <span className="flex items-center gap-2">
                <Link2 size={16} />
                人物关系审核
              </span>
              <ArrowRight size={16} />
            </Link>
          </Button>

          <Button asChild variant="outline" className="h-auto justify-between px-4 py-4">
            <Link href={`/admin/review/${book.id}/time`}>
              <span className="flex items-center gap-2">
                <Clock3 size={16} />
                人物 × 时间审核
              </span>
              <ArrowRight size={16} />
            </Link>
          </Button>
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          如果你是从旧链接进入这里，后续请更新常用入口到
          <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[11px]">/admin/review/{book.id}</code>
          及其子页面。
        </p>
      </div>
    </PageContainer>
  );
}
