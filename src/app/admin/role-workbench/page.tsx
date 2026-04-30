import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Users } from "lucide-react";

import { listBooks } from "@/server/modules/books/listBooks";
import {
  PageContainer,
  PageHeader
} from "@/components/layout/page-header";

/**
 * =============================================================================
 * 文件定位（Next.js 页面路由：角色资料工作台首页）
 * -----------------------------------------------------------------------------
 * 文件路径：`app/admin/role-workbench/page.tsx`
 *
 * 框架语义：
 * - `page.tsx` 是 App Router 的页面入口文件；
 * - 对应路由为 `GET /admin/role-workbench`；
 * - 默认是 Server Component，会在服务端执行数据查询并输出初始 HTML。
 *
 * 业务职责：
 * 1) 展示“可进入角色资料补全”的书籍列表；
 * 2) 作为角色资料录入流程的路由入口，点击书籍跳转到 `/admin/role-workbench/[bookId]`；
 * 3) 在无书籍时展示空态引导，避免用户进入空白页面。
 *
 * 上游依赖：
 * - `listBooks()` 返回可管理书籍清单（含章节数、人物数等摘要信息）。
 *
 * 下游影响：
 * - 产出的链接会把用户导向具体书籍角色资料工作台；
 * - 是角色资料补全链路的一级入口页，不承载具体录入操作。
 * =============================================================================
 */
export const metadata: Metadata = {
  // `metadata` 是 Next.js 的页面级 SEO 声明，服务端渲染时会写入文档头。
  title: "角色资料"
};

export default async function AdminRoleWorkbenchPage() {
  // Server Component 中直接查数据，首屏即可拿到书籍列表，减少客户端二次请求。
  const books = await listBooks();

  return (
    <PageContainer>
      <PageHeader
        title="角色资料"
        description="AI 预填人物、关系与传记事件，人工补全后确认入库"
      />

      {books.length === 0 ? (
        // 空态分支：当前系统还没有可补全资料的书籍，提示先进入书库管理创建数据。
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
          <div className="mb-6 p-4 rounded-full bg-primary/10">
            <Users className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            暂无书籍
          </h2>
          <p className="text-muted-foreground max-w-md">
            请先在书库管理中添加书籍，然后即可在此补全角色资料。
          </p>
        </div>
      ) : (
        // 正常分支：展示书籍卡片，点击后进入具体书籍的角色资料面板。
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => (
            <Link
              key={book.id}
              href={`/admin/role-workbench/${book.id}`}
              className="flex items-center gap-4 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary hover:bg-card/80"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <BookOpen className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="truncate font-medium text-foreground">
                  {book.title}
                </p>
                <p className="text-sm text-muted-foreground">
                  {book.author ?? "未知作者"}
                  {book.dynasty ? ` · ${book.dynasty}` : ""}
                  {" · "}
                  {book.chapterCount} 章 · {book.personaCount} 人物
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
