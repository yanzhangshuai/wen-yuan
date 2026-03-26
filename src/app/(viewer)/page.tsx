import {
  LibraryHome,
  type LibraryBookCardData
} from "@/components/library/library-home";
import { listBooks } from "@/server/modules/books/listBooks";
import type { BookLibraryListItem } from "@/types/book";

function toLibraryBookCardData(book: BookLibraryListItem): LibraryBookCardData {
  return {
    id              : book.id,
    title           : book.title,
    author          : book.author,
    dynasty         : book.dynasty,
    coverUrl        : book.coverUrl,
    status          : book.status,
    chapterCount    : book.chapterCount,
    personaCount    : book.personaCount,
    lastAnalyzedAt  : book.lastAnalyzedAt,
    currentModel    : book.currentModel,
    lastErrorSummary: book.lastErrorSummary,
    createdAt       : book.createdAt,
    updatedAt       : book.updatedAt,
    sourceFile      : book.sourceFile
  };
}

async function loadLibraryBooks(): Promise<LibraryBookCardData[]> {
  const books = await listBooks();
  return books.map(toLibraryBookCardData);
}

export default async function HomePage() {
  const books = await loadLibraryBooks();
  return <LibraryHome books={books} />;
}
