import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  PageContainer,
  PageHeader
} from "@/components/layout/page-header";
import { listBooks } from "@/server/modules/books/listBooks";

import { BookListClient } from "./_components/book-list-client";

/**
 * =============================================================================
 * 文件定位（Next.js App Router 页面）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/admin/books/page.tsx`
 * 路由语义：`/admin/books`
 * 文件类型：`page.tsx`（Next.js 路由约定文件）
 *
 * 在 Next.js 中，`page.tsx` 会被框架识别为“该路由段的页面入口”。
 * 这里未使用 `"use client"`，因此它是 Server Component：
 * 1) 数据可在服务端首屏渲染前准备完成（减少客户端首屏等待）；
 * 2) 可以直接调用服务端模块（`listBooks`），避免把数据库查询逻辑暴露到浏览器；
 * 3) 页面本身偏“数据组装 + 布局组织”，交互细节下沉给客户端子组件。
 *
 * 核心业务职责：
 * - 拉取书库列表数据；
 * - 渲染管理后台“书籍管理”页面头部与“导入书籍”入口；
 * - 把数据传给 `BookListClient`，由其负责搜索/筛选/行操作等前端交互。
 *
 * 上游输入：
 * - 无显式路由参数（固定路由 `/admin/books`）；
 * - 由中间件与 admin 布局完成权限门禁（本页默认运行在已鉴权上下文）。
 *
 * 下游输出：
 * - 向 `BookListClient` 输出 `books` 列表；
 * - 通过“导入书籍”按钮引导至 `/admin/books/import`。
 *
 * 维护注意：
 * - 本页只做“页面入口 + 数据装配”，不要把复杂交互逻辑塞入本文件；
 * - `listBooks()` 返回结构属于跨层契约，若服务端字段变更需同步客户端表格列映射；
 * - “导入书籍”链接是管理主流程入口，属于业务路径，不建议随意改动。
 * =============================================================================
 */

/**
 * 管理端书库列表页面（Server Component）。
 *
 * 业务语义：
 * - 在服务端提前拿到书籍列表，确保页面进入时即可看到可用数据；
 * - 把高频交互（筛选、行内按钮）交给客户端组件，维持 RSC/CSR 职责分离。
 *
 * @returns 书籍管理页面 JSX
 */
export default async function AdminBooksPage() {
  // 服务端查询书籍列表：
  // 这样设计的原因是列表属于管理入口的核心数据，首屏可用性优先于“纯客户端二次请求”。
  const books = await listBooks();

  return (
    <PageContainer>
      <PageHeader
        title="书籍管理"
        description="管理书库中的所有典籍，包括导入、编辑和发布"
      >
        {/*
          业务规则：导入流程是新增书籍的唯一规范入口。
          使用 `Link` 而不是脚本跳转，保留 Next.js 路由预取与可访问性语义。
        */}
        <Button asChild className="gap-2">
          <Link href="/admin/books/import">
            <Plus size={16} />
            导入书籍
          </Link>
        </Button>
      </PageHeader>

      {/*
        客户端列表组件：
        - 接收服务端准备好的初始数据；
        - 在浏览器内完成搜索、筛选、按钮操作、状态轮询等交互。
      */}
      <BookListClient books={books} />
    </PageContainer>
  );
}
