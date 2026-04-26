import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { RelationEditorPage } from "@/components/review/relation-editor/relation-editor-page";
import { ReviewWorkbenchShell } from "@/components/review/shared/review-workbench-shell";
import { buildPersonaListItems } from "@/components/review/shared/persona-list-summary";
import { getBookById } from "@/server/modules/books/getBookById";
import { listBooks } from "@/server/modules/books/listBooks";
import { createReviewQueryService } from "@/server/modules/review/evidence-review/review-query-service";

type SearchParamValue = string | string[] | undefined;

interface AdminBookRelationReviewSearchParams {
  personaId?: SearchParamValue;
  focus    ?: SearchParamValue;
}

function readSingleSearchParam(value: SearchParamValue): string | null {
  if (typeof value === "string") {
    const normalizedValue = value.trim();
    return normalizedValue.length > 0 ? normalizedValue : null;
  }

  if (Array.isArray(value)) {
    return readSingleSearchParam(value[0]);
  }

  return null;
}

interface AdminBookRelationReviewPageProps {
  params      : Promise<{ bookId: string }>;
  searchParams: Promise<AdminBookRelationReviewSearchParams>;
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
  params,
  searchParams
}: AdminBookRelationReviewPageProps) {
  const { bookId } = await params;
  const resolvedSearchParams = await searchParams;
  const initialSelectedPersonaId = readSingleSearchParam(resolvedSearchParams.personaId);
  const initialFocusOnly = resolvedSearchParams.focus === "1";

  let book;
  try {
    book = await getBookById(bookId);
  } catch {
    notFound();
  }

  const reviewQueryService = createReviewQueryService();
  const [allBooks, initialRelationEditor, matrix] = await Promise.all([
    listBooks(),
    reviewQueryService.getRelationEditorView({ bookId }),
    reviewQueryService.getPersonaChapterMatrix({ bookId })
  ]);

  const personaItems = buildPersonaListItems(matrix);
  const books = allBooks.map((b) => ({ id: b.id, title: b.title }));

  return (
    <ReviewWorkbenchShell
      bookId                  ={bookId}
      bookTitle               ={book.title}
      books                   ={books}
      mode                    ="relations"
      personaItems            ={personaItems}
      initialSelectedPersonaId={initialSelectedPersonaId}
      initialFocusOnly        ={initialFocusOnly}
      renderMain={({ selectedPersonaId, focusOnly, onFocusOnlyChange }) => (
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
            selectedPersonaId={selectedPersonaId}
            focusOnly={focusOnly}
            onFocusOnlyChange={onFocusOnlyChange}
          />
        </section>
      )}
    />
  );
}
