import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardCheck, BookOpen } from "lucide-react";

import { listBooks } from "@/server/modules/books/listBooks";

export const metadata: Metadata = {
  title: "审核中心"
};

export default async function AdminReviewPage() {
  const books = await listBooks();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">审核中心</h1>
        <p className="text-muted-foreground mt-1">审核 AI 识别的人物、关系与传记事件</p>
      </div>

      {books.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] text-center">
          <div className="mb-6 p-4 rounded-full bg-primary/10">
            <ClipboardCheck className="w-10 h-10 text-primary" />
          </div>
          <h2 className="text-xl font-semibold text-foreground mb-2">
            暂无书籍
          </h2>
          <p className="text-muted-foreground max-w-md">
            请先在书库管理中添加书籍，然后即可在此进行审核。
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {books.map((book) => (
            <Link
              key={book.id}
              href={`/admin/review/${book.id}`}
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
    </div>
  );
}
