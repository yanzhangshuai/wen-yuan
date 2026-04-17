/**
 * ============================================================================
 * 文件定位：`src/app/admin/books/[id]/review-center/page.tsx`
 * ----------------------------------------------------------------------------
 * 管理端"书籍审核中心"页面，路由为 `/admin/books/:id/review-center`。
 *
 * 业务职责：
 * - 聚合单本书籍的合并建议队列，分 3 Tab：
 *   - `merge`         ：Stage B 自动规则 + Stage C 反馈产出的 PENDING 合并建议；
 *   - `impersonation` ：Stage B.5 时序一致性检测出的冒名候选（PENDING）；
 *   - `done`          ：已处理（ACCEPTED/REJECTED）。
 * - 提供接受/拒绝按钮，接受动作按 source 分派：
 *   - 非 STAGE_B5_TEMPORAL → 全量 persona 合并事务；
 *   - STAGE_B5_TEMPORAL    → 仅状态变更（人工确认不等于自动合并）。
 *
 * 设计说明：
 * - Server Component 只负责书籍存在性校验与路径渲染；
 * - 真正的交互在 Client Component `ReviewCenterTabs` 中实现（Tab 切换、分页、
 *   evidence 折叠、POST 接受/拒绝）。
 * ============================================================================
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageContainer } from "@/components/layout/page-header";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { getBookById } from "@/server/modules/books/getBookById";

import { ReviewCenterTabs } from "./_components/review-center-tabs";

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

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">审核中心</h1>
        <p className="text-sm text-muted-foreground">
          按 Tab 分类展示 <code className="text-xs px-1 py-0.5 rounded bg-muted">MergeSuggestion</code> 队列。
          <br />
          <strong>MERGE 建议</strong>：Stage B 自动规则或 Stage C 反馈产生的待合并候选。
          <strong>冒名候选</strong>：Stage B.5 时序一致性检测出的可疑冒名，接受后不自动合并，仅标记已审阅。
          <strong>已处理</strong>：全部 ACCEPTED/REJECTED 历史。
        </p>
      </div>

      <ReviewCenterTabs bookId={book.id} />
    </PageContainer>
  );
}
