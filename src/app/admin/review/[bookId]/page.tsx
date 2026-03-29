import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";

import { getBookById } from "@/server/modules/books/getBookById";
import { listBooks } from "@/server/modules/books/listBooks";
import { listAdminDrafts } from "@/server/modules/review/listDrafts";
import { listMergeSuggestions } from "@/server/modules/review/mergeSuggestions";
import { ReviewPanel } from "@/components/review/review-panel";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface AdminBookReviewPageProps {
  params: Promise<{ bookId: string }>;
}

export async function generateMetadata({ params }: AdminBookReviewPageProps): Promise<Metadata> {
  const { bookId } = await params;
  try {
    const book = await getBookById(bookId);
    return { title: `审核 · ${book.title}` };
  } catch {
    return { title: "审核中心" };
  }
}

export default async function AdminBookReviewPage({
  params
}: AdminBookReviewPageProps) {
  const { bookId } = await params;

  let book;
  try {
    book = await getBookById(bookId);
  } catch {
    notFound();
  }

  const [allBooks, initialDrafts, initialMergeSuggestions] = await Promise.all([
    listBooks(),
    listAdminDrafts({ bookId }),
    listMergeSuggestions({ bookId })
  ]);

  return (
    <div className="flex gap-6 items-start">
      {/* 左侧书籍导航 — 对齐 sheji 管理审核截图 */}
      <aside className="w-44 shrink-0">
        <div className="sticky top-20">
          <h2 className="text-xs font-medium text-muted-foreground mb-3 px-2 uppercase tracking-wider">
            选择书籍
          </h2>
          <nav className="space-y-0.5">
            {allBooks.map((b) => (
              <Link
                key={b.id}
                href={`/admin/review/${b.id}`}
                className={cn(
                  "flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                  b.id === bookId
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground hover:bg-accent"
                )}
              >
                <span className="truncate">{b.title}</span>
                <span className="ml-2 text-xs text-muted-foreground/70 shrink-0 tabular-nums">
                  {b.personaCount}
                </span>
              </Link>
            ))}
          </nav>
        </div>
      </aside>

      {/* 右侧审核主体 */}
      <div className="flex-1 min-w-0">
        <Suspense
          fallback={
            <div className="flex flex-col gap-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          }
        >
          <ReviewPanel
            bookId={bookId}
            bookTitle={book.title}
            initialDrafts={initialDrafts}
            initialMergeSuggestions={initialMergeSuggestions}
          />
        </Suspense>
      </div>
    </div>
  );
}
