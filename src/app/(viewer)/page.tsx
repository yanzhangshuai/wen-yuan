import {
  LibraryHome,
  type LibraryBookCardData
} from "@/components/library/library-home";
import { listBooks } from "@/server/modules/books/listBooks";
import type { BookLibraryListItem } from "@/types/book";

/**
 * =============================================================================
 * 文件定位（viewer 路由组首页 page）
 * -----------------------------------------------------------------------------
 * 1) 这是 `app/(viewer)/page.tsx`，会被 Next.js 识别为“viewer 路由组首页”。
 *    - URL 语义：对应站点根路径 `/`（路由组 `(viewer)` 本身不出现在 URL 中）。
 *    - 渲染语义：默认是 Server Component（未写 "use client"），在服务端取数并输出首屏 HTML。
 *
 * 2) 业务职责：
 *    - 读取书库列表；
 *    - 将服务端 DTO 映射为前端卡片组件的展示数据；
 *    - 把数据交给 `LibraryHome` 渲染书库首页。
 *
 * 3) 上下游关系：
 *    - 上游：`listBooks()`（服务端模块，聚合数据库中的书籍信息）。
 *    - 下游：`LibraryHome`（客户端组件，负责交互和视觉呈现）。
 *
 * 4) 维护注意：
 *    - 当前映射函数是“显式字段映射”，目的是稳定前后端契约；不要轻易改成 `...book`。
 *      这是业务可维护性规则，不是技术限制。
 *    - 此页在服务端执行，适合 SEO 与首屏性能；若改成客户端取数会改变加载链路和用户体验。
 * =============================================================================
 */

/**
 * 功能：把后端返回的书籍 DTO 映射为首页卡片组件数据。
 * 设计原因：
 * - 用显式映射锁定字段边界，避免后端未来新增字段时无意透传到前端；
 * - 便于在此层做“展示模型”演进，而不影响服务端原始结构。
 */
function toLibraryBookCardData(book: BookLibraryListItem): LibraryBookCardData {
  return {
    id              : book.id,
    title           : book.title,
    author          : book.author,
    dynasty         : book.dynasty,
    coverUrl        : book.coverUrl,
    status          : book.status,
    typeCode        : book.typeCode,
    chapterCount    : book.chapterCount,
    personaCount    : book.personaCount,
    lastAnalyzedAt  : book.lastAnalyzedAt,
    currentModel    : book.currentModel,
    lastArchitecture: book.lastArchitecture,
    lastErrorSummary: book.lastErrorSummary,
    createdAt       : book.createdAt,
    updatedAt       : book.updatedAt,
    sourceFile      : book.sourceFile
  };
}

/**
 * 功能：加载首页书库数据。
 * 执行时机：在 `HomePage` 服务端渲染阶段执行。
 * 返回语义：返回已适配 `LibraryHome` 的卡片数组；下游无需了解后端 DTO 细节。
 */
async function loadLibraryBooks(): Promise<LibraryBookCardData[]> {
  const books = await listBooks();
  return books.map(toLibraryBookCardData);
}

/**
 * Next.js 页面入口（Server Component）。
 * - 因为是 async 组件，Next.js 会等待数据准备后再输出 HTML；
 * - 与 `loading.tsx` 配合时，慢请求阶段会展示同目录 loading UI。
 */
export default async function HomePage() {
  const books = await loadLibraryBooks();
  return <LibraryHome books={books} />;
}
