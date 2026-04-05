import { notFound } from "next/navigation";

import { getBookById } from "@/server/modules/books/getBookById";
import { createGetBookGraphService } from "@/server/modules/books/getBookGraph";
import { GraphView } from "@/components/graph/graph-view";

/**
 * =============================================================================
 * 文件定位（书籍图谱页面 page）
 * -----------------------------------------------------------------------------
 * 路由约定：`app/(viewer)/books/[id]/graph/page.tsx`
 * - 对应 URL：`/books/:id/graph`
 * - 文件类型：Next.js 页面入口（Server Component）
 *
 * 业务职责：
 * - 基于书籍 ID 同时加载“书籍基础信息”和“图谱快照”；
 * - 若数据不存在则抛转 404；
 * - 将首屏图谱数据注入 `GraphView`，让客户端只处理交互，不负责首屏拉取。
 *
 * 渲染链路价值：
 * - 首屏图谱在服务端准备，有利于首屏稳定和 SEO 可读结构；
 * - `GraphView` 保持客户端组件，专注复杂交互（拖拽、右键、面板状态等）。
 *
 * 维护注意：
 * - `Promise.all` 并行拉取是性能策略，勿改成串行；
 * - 捕获异常直接 `notFound()` 是产品策略：对用户隐藏内部差异，统一进入业务 404 页。
 * =============================================================================
 */
interface BookGraphPageProps {
  /**
   * Next.js 动态路由参数。
   * 在当前项目中使用 Promise 形式的 `params`，需先 `await` 再读取 `id`。
   */
  params: Promise<{ id: string }>;
}

export default async function BookGraphPage({
  params
}: BookGraphPageProps) {
  // 路由参数 `id` 来自 URL `/books/:id/graph`。
  const { id } = await params;

  // 通过工厂函数拿到服务实例，便于测试替换依赖。
  const { getBookGraph } = createGetBookGraphService();

  let book;
  let snapshot;
  try {
    // 并行请求：书籍信息和图谱快照互不依赖，串行会增加首屏等待时长。
    [book, snapshot] = await Promise.all([
      getBookById(id),
      getBookGraph({ bookId: id })
    ]);
  } catch {
    // 业务规则：任一关键数据失败都视为“当前图谱页不可用”，统一走 404 而非暴露内部错误细节。
    notFound();
  }

  if (!book) {
    // 防御性分支：即使上方 try 未抛错，也保证空书籍不会继续渲染错误页面。
    notFound();
  }

  return (
    <section className="book-graph-page relative h-[calc(100vh-64px)] w-full overflow-hidden">
      <GraphView
        bookId={id}
        initialSnapshot={snapshot}
        // 章节数为空时兜底 0，避免下游时间轴组件出现 NaN/负值逻辑。
        totalChapters={book.chapterCount ?? 0}
        chapterUnit="回"
      />
    </section>
  );
}
