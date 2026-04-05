"use client";

/**
 * =============================================================================
 * 文件定位（阅读端首页 - 书库聚合视图）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/components/library/library-home.tsx`
 *
 * 在 Next.js 项目中的角色：
 * - 这是阅读端首页的 Client Component 容器，用于接收上游已获取的书籍列表并渲染；
 * - 自身不发起数据请求，不承担路由定义，属于“前端渲染层（展示 + 轻计算）”。
 *
 * 业务职责：
 * - 根据书籍状态展示空态、统计概览、书卡网格和项目说明；
 * - 将“可阅读（已完成解析）”与“解析中”两类书籍在同一视图中分层呈现。
 *
 * 上下游关系：
 * - 上游：页面或服务层提供 `books`（通常由 Server Component 拉取后下发）；
 * - 下游：`BookCard` 子组件负责单本书的可点击行为和细节展示。
 *
 * 维护约束（业务规则，不是技术限制）：
 * - `status === "COMPLETED"` 才可视为可阅读，这是产品流程约束；
 * - 顶部统计口径依赖“已完成书籍集合”，修改前需同步产品口径和后端字段定义。
 * =============================================================================
 */

import { BookOpen, Users, GitBranch, Info } from "lucide-react";

import { BookCard } from "@/components/library/book-card";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "@/components/ui/tooltip";
import type { BookLibraryListItem } from "@/types/book";

export interface LibraryBookCardData extends BookLibraryListItem {}

export interface LibraryHomeProps {
  /**
   * 书库首页数据源。
   * - 来源：上游页面/容器组件注入；
   * - 语义：包含展示书卡与计算概览统计所需的全部字段。
   */
  books: LibraryBookCardData[];
}

function LibraryEmptyState() {
  return (
    <section className="library-ambient flex min-h-[calc(100vh-64px)] flex-col items-center justify-center px-4 text-center">
      <div className="mb-6 rounded-full bg-primary-subtle p-6">
        <BookOpen className="h-12 w-12 text-primary" strokeWidth={1.5} />
      </div>
      <h2 className="mb-3 text-2xl font-bold tracking-tight text-foreground">暂无可阅读书籍</h2>
      <p className="max-w-md text-base leading-relaxed text-muted-foreground">
        书库目前空空如也。<br />请联系管理员在后台导入并解析书籍。
      </p>
      <div className="mt-8 grid w-full max-w-lg grid-cols-3 gap-4 opacity-15 pointer-events-none select-none">
        <div className="aspect-2/3 animate-pulse rounded bg-border" style={{ animationDelay: "75ms" }} />
        <div className="aspect-2/3 animate-pulse rounded bg-border" style={{ animationDelay: "150ms" }} />
        <div className="aspect-2/3 animate-pulse rounded bg-border" style={{ animationDelay: "300ms" }} />
      </div>
    </section>
  );
}

export function LibraryHome({ books }: LibraryHomeProps) {
  // 空数组或未传值都视为“暂无可阅读内容”。
  // 这里提前返回可避免后续统计计算对 undefined 进行处理。
  if (!books || books.length === 0) {
    return <LibraryEmptyState />;
  }

  // 业务规则：只有 COMPLETED 进入阅读链路，其他状态统一视为“待完成”。
  const completedBooks = books.filter((book) => book.status === "COMPLETED");
  const pendingBooks = books.filter((book) => book.status !== "COMPLETED");
  // personaCount 允许为空，使用 0 兜底以确保统计值稳定可渲染。
  const totalPersonas = completedBooks.reduce((acc, book) => acc + (book.personaCount ?? 0), 0);

  return (
    <div className="library-ambient min-h-[calc(100vh-64px)]">
      <section className="library-hero mb-12 border-b border-border py-12 text-center">
        <div className="mx-auto max-w-[1440px] px-6">
          <h1 className="mb-4 text-3xl font-bold tracking-tight text-balance">中国古典文学人物关系图谱</h1>
          <p className="mx-auto max-w-2xl leading-relaxed text-muted-foreground">
            通过 AI 技术从古代长篇小说中提取人物、关系、事件与时间线，
            <br className="hidden lg:block" />
            构建可交互的知识图谱与人物档案系统
          </p>

          <div className="mt-8 flex items-center justify-center gap-8">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 text-sm">
                    <BookOpen className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{completedBooks.length}</span>
                    <span className="text-muted-foreground">部书籍</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>已完成解析的书籍数量</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 text-sm">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">{totalPersonas.toLocaleString()}</span>
                    <span className="text-muted-foreground">位人物</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>已解析的人物总数</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-2 text-sm">
                    <GitBranch className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">—</span>
                    <span className="text-muted-foreground">条关系</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>已建立的人物关系数</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
            <Info className="h-3 w-3" />
            <span>数据由 AI 自动解析生成，可能存在误差，欢迎校对纠正</span>
          </div>
        </div>
      </section>

      <section className="library-section mx-auto max-w-[1440px] px-6 py-8">
        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              书库
              <span className="text-sm font-normal text-muted-foreground">{books.length} 部典藏</span>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">点击书籍封面进入人物关系图谱</p>
          </div>

          <div className="flex items-center gap-3">
            <Badge variant="outline" className="px-3 py-1 font-normal">
              {completedBooks.length} 已完成
            </Badge>
            {pendingBooks.length > 0 && (
              <Badge variant="secondary" className="px-3 py-1 font-normal">
                {pendingBooks.length} 解析中
              </Badge>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4 md:gap-6 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      </section>

      <footer className="mx-auto mt-16 max-w-[1440px] border-t border-border px-6 pt-8 pb-12 text-center">
        <div className="mx-auto max-w-xl">
          <h3 className="mb-2 text-sm font-medium">关于文淵</h3>
          <p className="text-xs leading-relaxed text-muted-foreground">
            「文淵」是一个非商业化的个人爱好项目，旨在利用 AI 技术构建中国古典文学的人物知识图谱。
            项目持续开发中，数据仅供研究与学习参考使用。
          </p>
          <div className="mt-4 text-xs text-muted-foreground/60">© 2024 Wen Yuan Project</div>
        </div>
      </footer>
    </div>
  );
}
