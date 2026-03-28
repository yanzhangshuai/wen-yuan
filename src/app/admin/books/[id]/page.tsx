import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  FileText,
  Users
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { BookRowActions } from "@/app/admin/books/_components/book-row-actions";
import { getBookById } from "@/server/modules/books/getBookById";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { type BookStatus } from "@/types/book";

import { BookDetailTabs } from "./_components/book-detail-tabs";

interface BookDetailPageProps {
  params: Promise<{ id: string }>;
}

const STATUS_META: Record<BookStatus, { label: string; variant: "secondary" | "warning" | "success" | "destructive" }> = {
  PENDING   : { label: "待处理", variant: "secondary" },
  PROCESSING: { label: "解析中", variant: "warning" },
  COMPLETED : { label: "已完成", variant: "success" },
  ERROR     : { label: "解析失败", variant: "destructive" }
};

function formatFileSize(bytes: number | null): string {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("zh-CN", {
    year : "numeric",
    month: "2-digit",
    day  : "2-digit"
  });
}

export default async function BookDetailPage({ params }: BookDetailPageProps) {
  const { id } = await params;

  let book;
  try {
    book = await getBookById(id);
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      notFound();
    }
    throw error;
  }

  const statusMeta = STATUS_META[book.status] ?? { label: book.status, variant: "secondary" as const };

  return (
    <div className="space-y-6 pb-16">
      {/* 顶部导航 */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/admin/books" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ArrowLeft size={14} />
          书库管理
        </Link>
        <span>/</span>
        <span className="text-foreground">{book.title}</span>
      </div>

      {/* 页头 */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-3xl font-bold text-foreground truncate">{book.title}</h1>
            <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
            {book.author && <span>作者：{book.author}</span>}
            {book.dynasty && <span>朝代：{book.dynasty}</span>}
            {book.currentModel && <span>当前模型：{book.currentModel}</span>}
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1">
              <BookOpen size={14} />
              {book.chapterCount} 章
            </span>
            <span className="flex items-center gap-1">
              <Users size={14} />
              {book.personaCount} 人物
            </span>
            <span className="flex items-center gap-1">
              <Calendar size={14} />
              创建于 {formatDate(book.createdAt)}
            </span>
            {book.sourceFile.name && (
              <span className="flex items-center gap-1">
                <FileText size={14} />
                {book.sourceFile.name}
                {book.sourceFile.size !== null && (
                  <span>（{formatFileSize(book.sourceFile.size)}）</span>
                )}
              </span>
            )}
          </div>
          {book.lastErrorSummary && (
            <p className="text-sm text-destructive">{book.lastErrorSummary}</p>
          )}
        </div>
        <div className="flex-shrink-0">
          <BookRowActions bookId={book.id} bookTitle={book.title} />
        </div>
      </div>

      {/* 内容 Tabs（客户端组件） */}
      <BookDetailTabs book={book} />
    </div>
  );
}
