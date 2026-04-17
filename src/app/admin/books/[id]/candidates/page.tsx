/**
 * ============================================================================
 * 文件定位：`src/app/admin/books/[id]/candidates/page.tsx`
 * ----------------------------------------------------------------------------
 * 管理端书籍"候选人物"页面，路由为 `/admin/books/:id/candidates`。
 *
 * 业务职责（对齐 §0-11 管线规模 KPI）：
 * - 只读列出该书下 `Persona.status='CANDIDATE'` 的角色；
 * - 顶部 KPI 徽章：
 *     - CANDIDATE 总数 ≤ 200   → 合格（绿色）
 *     - 200 < 总数 ≤ 300       → 观察（黄色）
 *     - 总数 > 300             → 管线回炉（红色）
 * - 提供候选 canonicalName 子串搜索 + 分页，便于审核员扫读。
 *
 * 设计说明：
 * - 本页**不提供**晋级/驳回/合并按钮。人工审核入口在 T07 `review` 中心；
 * - 组件按 Server + Client 分层：
 *     - Server Component（本文件）：处理路由参数、404 语义；
 *     - Client Component `CandidatesTable`：负责拉取分页数据与搜索交互；
 * - 路由层不提前拉取候选列表，因为分页/搜索依赖 URL 查询参数，客户端处理更自然。
 * ============================================================================
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { PageContainer } from "@/components/layout/page-header";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { getBookById } from "@/server/modules/books/getBookById";

import { CandidatesTable } from "./_components/candidates-table";

/**
 * 页面入参。
 */
interface CandidatesPageProps {
  /** 路由参数：动态段 `[id]`。Next.js 15+ 以 Promise 形式传入。 */
  params: Promise<{ id: string }>;
}

/**
 * 候选人物只读页主组件（Server Component）。
 */
export default async function CandidatesPage({ params }: CandidatesPageProps) {
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
        <span className="text-foreground">候选人物</span>
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-foreground">候选人物</h1>
        <p className="text-sm text-muted-foreground">
          展示当前书籍下 <code className="text-xs px-1 py-0.5 rounded bg-muted">status=CANDIDATE</code> 的人物候选集合。
          <br />
          §0-11 管线 KPI 参考：<strong>≤ 200 合格</strong> / <strong>200–300 观察</strong> / <strong>&gt; 300 管线回炉</strong>。
          本页只读；晋级、驳回、合并操作在审核中心完成。
        </p>
      </div>

      <CandidatesTable bookId={book.id} />
    </PageContainer>
  );
}
