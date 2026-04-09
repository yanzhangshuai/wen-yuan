"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Search } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import type { BookLibraryListItem } from "@/types/book";

import { BookRowActions } from "./book-row-actions";
import { BookStatusCell } from "./book-status-cell";

/**
 * =============================================================================
 * 文件定位（管理端书籍列表交互组件）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/admin/books/_components/book-list-client.tsx`
 * 组件类型：Client Component（显式 `"use client"`）
 *
 * 为什么必须是客户端组件：
 * 1) 需要 `useState` 管理搜索词与状态筛选；
 * 2) 需要 `useMemo` 在浏览器端做即时过滤，提升交互响应；
 * 3) 行内操作（重试解析/删除）与状态轮询都是用户交互链路，属于典型 CSR 逻辑。
 *
 * 在页面链路中的角色：
 * - 上游：`/admin/books/page.tsx` 作为 Server Component 传入初始 `books`；
 * - 下游：
 *   - `BookStatusCell` 负责每行状态展示与轮询；
 *   - `BookRowActions` 负责每行操作（重试、删除）；
 *   - 行标题链接跳转 `book detail` 页面。
 *
 * 核心业务目标：
 * - 提供管理员快速定位书籍（按标题/作者搜索 + 按状态过滤）；
 * - 在同一张表中展示运营关键字段（章节数、人物数、更新时间）；
 * - 为每本书提供统一操作入口。
 *
 * 注意事项：
 * - 过滤逻辑是前端“视图层过滤”，不改变后端真实数据；
 * - `statusFilter` 值需与后端状态枚举保持一致，否则会出现“筛选项存在但无结果”；
 * - 空态文案区分“无数据”和“筛选无匹配”，这是产品语义，不是技术限制。
 * =============================================================================
 */

/**
 * 组件入参。
 */
interface BookListClientProps {
  /**
   * 书库列表数据。
   * 来源：服务端 `listBooks()`，字段语义定义在 `BookLibraryListItem`。
   */
  books: BookLibraryListItem[];
}

/**
 * 管理端书籍列表客户端组件。
 *
 * @param props.books 服务端首屏注入的书籍列表
 * @returns 书籍筛选 + 表格列表
 */
export function BookListClient({ books }: BookListClientProps) {
  /**
   * 搜索关键字（书名/作者）。
   * 业务语义：只影响当前页面展示，不会触发服务端请求。
   */
  const [searchQuery, setSearchQuery] = useState("");

  /**
   * 状态筛选值：
   * - `all` 表示不过滤；
   * - 其他值对应后端书籍状态字符串。
   */
  const [statusFilter, setStatusFilter] = useState("all");

  /**
   * 基于搜索词与状态筛选派生列表。
   *
   * 设计原因：
   * - `useMemo` 避免每次渲染都全量 filter，降低大列表重复计算；
   * - 依赖数组精确绑定 `books/searchQuery/statusFilter`，保证数据一致性。
   */
  const filteredBooks = useMemo(() => {
    return books.filter((book) => {
      // 搜索规则：允许匹配书名或作者。
      // `(book.author ?? "")` 是防御性空值处理，避免 author 为空时报错。
      const matchesSearch =
        !searchQuery
        || book.title.includes(searchQuery)
        || (book.author ?? "").includes(searchQuery);

      // 状态规则：`all` 放行全部；否则仅保留状态相等项。
      const matchesStatus =
        statusFilter === "all" || book.status === statusFilter;

      // 同时满足搜索与状态，才进入最终展示。
      return matchesSearch && matchesStatus;
    });
  }, [books, searchQuery, statusFilter]);

  return (
    <div className="space-y-4">
      {/*
        顶部筛选区：
        - 左侧搜索输入框（书名/作者）；
        - 右侧状态筛选下拉。
      */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="搜索书名或作者..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="状态" />
            </SelectTrigger>
            <SelectContent>
              {/*
                这些值属于业务筛选枚举，需与后端书籍状态对齐。
                若后端新增状态，这里应同步补充，否则会出现“状态不可筛选”的维护断层。
              */}
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="PENDING">待处理</SelectItem>
              <SelectItem value="PROCESSING">解析中</SelectItem>
              <SelectItem value="COMPLETED">已完成</SelectItem>
              <SelectItem value="ERROR">错误</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/*
        列表主表格：
        - 展示书籍核心运营字段；
        - 包含状态组件与行操作组件；
        - 空态分支区分“确实没有书”与“筛选后无匹配”。
      */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-50">书名</TableHead>
                <TableHead>作者</TableHead>
                <TableHead>朝代</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">章节</TableHead>
                <TableHead className="text-right">人物</TableHead>
                <TableHead>更新时间</TableHead>
                <TableHead className="w-25 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBooks.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-24 text-center text-muted-foreground"
                  >
                    {books.length === 0
                      // 无书籍：引导用户走导入流程。
                      ? "暂无书籍，请点击右上角导入。"
                      // 有书籍但筛选后无匹配：提示调整筛选条件。
                      : "没有匹配的书籍"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredBooks.map((book) => (
                  <TableRow key={book.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-primary shrink-0" />
                        {/*
                          跳转书籍详情页：
                          使用 Next.js `Link` 以保留前端路由切换体验和预取能力。
                        */}
                        <Link
                          href={`/admin/books/${book.id}`}
                          className="interactive-text-link hover:underline"
                        >
                          {book.title}
                        </Link>
                      </div>
                    </TableCell>

                    {/*
                      作者/朝代字段允许为空：
                      业务含义是“源数据缺失或暂未补全”，使用 `—` 明确展示为未知。
                    */}
                    <TableCell>{book.author || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {book.dynasty || "—"}
                    </TableCell>

                    <TableCell>
                      {/*
                        状态单元格独立组件化：
                        该组件内部负责轮询，不污染当前表格组件职责。
                      */}
                      <BookStatusCell
                        bookId={book.id}
                        initialStatus={book.status}
                      />
                    </TableCell>

                    {/*
                      数值统一 `toLocaleString()`：提升大数字可读性，属于展示层格式化。
                    */}
                    <TableCell className="text-right">
                      {book.chapterCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      {book.personaCount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {new Date(book.updatedAt).toLocaleDateString("zh-CN")}
                    </TableCell>

                    <TableCell className="text-right">
                      <BookRowActions
                        bookId={book.id}
                        bookTitle={book.title}
                      />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/*
        底部统计：
        - 始终显示当前结果数；
        - 若存在筛选行为，附加“筛选自 N 本”提示，帮助用户理解上下文。
      */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          共 {filteredBooks.length} 本书籍
          {filteredBooks.length !== books.length
            && ` (筛选自 ${books.length} 本)`}
        </p>
      </div>
    </div>
  );
}
