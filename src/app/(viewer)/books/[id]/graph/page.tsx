import { notFound } from "next/navigation";

import { getBookById } from "@/server/modules/books/getBookById";
import { createGetBookGraphService } from "@/server/modules/books/getBookGraph";
import { GraphView } from "@/components/graph/graph-view";

interface BookGraphPageProps {
  params: Promise<{ id: string }>;
}

export default async function BookGraphPage({
  params
}: BookGraphPageProps) {
  const { id } = await params;

  const { getBookGraph } = createGetBookGraphService();

  let book;
  let snapshot;
  try {
    [book, snapshot] = await Promise.all([
      getBookById(id),
      getBookGraph({ bookId: id })
    ]);
  } catch {
    notFound();
  }

  if (!book) {
    notFound();
  }

  return (
    <section className="book-graph-page relative h-[calc(100vh-64px)] w-full overflow-hidden">
      <GraphView
        bookId={id}
        initialSnapshot={snapshot}
        totalChapters={book.chapterCount ?? 0}
        chapterUnit="回"
      />
    </section>
  );
}
