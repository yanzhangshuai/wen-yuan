import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { ReviewModeNav } from "@/components/review/shared/review-mode-nav";
import { RelationEditorPage } from "@/components/review/relation-editor/relation-editor-page";
import { cn } from "@/lib/utils";
import { getBookById } from "@/server/modules/books/getBookById";
import { listBooks } from "@/server/modules/books/listBooks";
import { createReviewQueryService } from "@/server/modules/review/evidence-review/review-query-service";

interface AdminBookRelationReviewPageProps {
  params: Promise<{ bookId: string }>;
}

export async function generateMetadata({
  params
}: AdminBookRelationReviewPageProps): Promise<Metadata> {
  const { bookId } = await params;
  try {
    const book = await getBookById(bookId);
    return { title: `关系审核 · ${book.title}` };
  } catch {
    return { title: "关系审核" };
  }
}

export default async function AdminBookRelationReviewPage({
  params
}: AdminBookRelationReviewPageProps) {
  const { bookId } = await params;

  let book;
  try {
    book = await getBookById(bookId);
  } catch {
    notFound();
  }

  const reviewQueryService = createReviewQueryService();
  const [allBooks, initialRelationEditor] = await Promise.all([
    listBooks(),
    reviewQueryService.getRelationEditorView({ bookId })
  ]);

  return (
    <div className="flex gap-6 items-start">
      <aside className="w-44 shrink-0">
        <div className="sticky top-20">
          <h2 className="text-xs font-medium text-muted-foreground mb-3 px-2 uppercase tracking-wider">
            选择书籍
          </h2>
          <nav className="space-y-0.5">
            {allBooks.map((b) => (
              <Link
                key={b.id}
                href={`/admin/review/${b.id}/relations`}
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

      <div className="flex-1 min-w-0 space-y-4">
        <ReviewModeNav bookId={bookId} activeMode="relations" />
        <section
          className="relation-editor-server-page rounded-xl border bg-card p-6 shadow-sm"
          data-relation-editor-book-id={initialRelationEditor.bookId}
          data-pair-count={initialRelationEditor.pairSummaries.length}
          data-persona-count={initialRelationEditor.personaOptions.length}
          data-relation-type-count={initialRelationEditor.relationTypeOptions.length}
        >
          <RelationEditorPage
            bookId={bookId}
            bookTitle={book.title}
            allBooks={allBooks}
            initialRelationEditor={initialRelationEditor}
          />
        </section>
      </div>
    </div>
  );
}
