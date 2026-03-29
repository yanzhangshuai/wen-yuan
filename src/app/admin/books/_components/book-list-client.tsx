"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, BookOpen } from "lucide-react";

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
import { Card, CardContent } from "@/components/ui/card";
import { BookRowActions } from "./book-row-actions";
import { BookStatusCell } from "./book-status-cell";
import type { BookLibraryListItem } from "@/types/book";

interface BookListClientProps {
  books: BookLibraryListItem[];
}

export function BookListClient({ books }: BookListClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const filteredBooks = useMemo(() => {
    return books.filter((book) => {
      const matchesSearch =
        !searchQuery ||
        book.title.includes(searchQuery) ||
        (book.author ?? "").includes(searchQuery);
      const matchesStatus =
        statusFilter === "all" || book.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [books, searchQuery, statusFilter]);

  return (
    <div className="space-y-4">
      {/* Filters — 对齐 sheji: 搜索 + 状态筛选 */}
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
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="PENDING">待处理</SelectItem>
              <SelectItem value="PROCESSING">解析中</SelectItem>
              <SelectItem value="COMPLETED">已完成</SelectItem>
              <SelectItem value="ERROR">错误</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table — 对齐 sheji: 更多列 + BookOpen 图标 */}
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
                      ? "暂无书籍，请点击右上角导入。"
                      : "没有匹配的书籍"}
                  </TableCell>
                </TableRow>
              ) : (
                filteredBooks.map((book) => (
                  <TableRow key={book.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-primary shrink-0" />
                        <Link
                          href={`/admin/books/${book.id}`}
                          className="hover:underline"
                        >
                          {book.title}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell>{book.author || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {book.dynasty || "—"}
                    </TableCell>
                    <TableCell>
                      <BookStatusCell
                        bookId={book.id}
                        initialStatus={book.status}
                      />
                    </TableCell>
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

      {/* Footer info */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          共 {filteredBooks.length} 本书籍
          {filteredBooks.length !== books.length &&
            ` (筛选自 ${books.length} 本)`}
        </p>
      </div>
    </div>
  );
}
