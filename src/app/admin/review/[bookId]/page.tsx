import { Suspense } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getBookById } from "@/server/modules/books/getBookById";
import { listAdminDrafts } from "@/server/modules/review/listDrafts";
import { listMergeSuggestions } from "@/server/modules/review/mergeSuggestions";
import { ReviewPanel } from "@/components/review/review-panel";
import { Skeleton } from "@/components/ui/skeleton";

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

  const initialDraftsPromise = listAdminDrafts({ bookId });
  const initialMergeSuggestionsPromise = listMergeSuggestions({ bookId });

  return (
    <div className="admin-book-review space-y-4">
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
          initialDraftsPromise={initialDraftsPromise}
          initialMergeSuggestionsPromise={initialMergeSuggestionsPromise}
        />
      </Suspense>
    </div>
  );
}
