"use client";

import { BookCard } from "@/components/library/book-card";
import { Library } from "lucide-react";
import type { BookLibraryListItem } from "@/types/book";

export interface LibraryBookCardData extends BookLibraryListItem {}

export interface LibraryHomeProps {
  books: LibraryBookCardData[];
}

function LibraryEmptyState() {
  return (
    <section className="library-ambient flex flex-col items-center justify-center min-h-[calc(100vh-56px)] text-center px-4">
      <div className="mb-6 p-6 rounded-full bg-primary-subtle">
        <Library className="w-12 h-12 text-primary" strokeWidth={1.5} />
      </div>
      <h2 className="mb-3 text-2xl font-bold text-(--color-fg) tracking-tight">
        暂无可阅读书籍
      </h2>
      <p className="max-w-md text-base leading-relaxed text-(--color-muted-fg)">
        书库目前空空如也。<br />请联系管理员在后台导入并解析书籍。
      </p>
      <div className="mt-8 grid grid-cols-3 gap-4 opacity-15 pointer-events-none select-none w-full max-w-lg">
        <div className="aspect-2/3 bg-border rounded animate-pulse" style={{ animationDelay: "75ms" }} />
        <div className="aspect-2/3 bg-border rounded animate-pulse" style={{ animationDelay: "150ms" }} />
        <div className="aspect-2/3 bg-border rounded animate-pulse" style={{ animationDelay: "300ms" }} />
      </div>
    </section>
  );
}

export function LibraryHome({ books }: LibraryHomeProps) {
  if (!books || books.length === 0) {
    return <LibraryEmptyState />;
  }

  return (
    <div className="library-ambient min-h-[calc(100vh-56px)]">
      {/* Section Header */}
      <header className="pt-14 pb-6 text-center select-none">
        <div className="inline-flex items-center gap-3 mb-3">
          <span className="h-px w-10 bg-linear-to-r from-transparent to-primary/30" />
          <Library
            className="w-4 h-4 text-primary opacity-50"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span className="h-px w-10 bg-linear-to-l from-transparent to-primary/30" />
        </div>
        <h1
          className="text-xl font-medium tracking-[0.2em] text-(--color-fg) opacity-80"
          style={{ fontFamily: "var(--font-serif)" }}
        >
          藏書閣
        </h1>
        <p className="mt-2 text-[11px] tracking-[0.4em] text-(--color-muted-fg)">
          {books.length} 部典藏
        </p>
      </header>

      {/* Book Grid */}
      <section className="w-full px-6 lg:px-12 xl:px-16 pb-6">
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 2xl:grid-cols-6 gap-x-6 gap-y-10 sm:gap-x-8 lg:gap-x-10">
          {books.map((book) => (
            <BookCard key={book.id} book={book} />
          ))}
        </div>
      </section>

      {/* Shelf ledge — horizontal line that grounds the books */}
      <div className="mx-6 lg:mx-12 xl:mx-16 h-px bg-(--color-border-strong)" aria-hidden="true" />
      <div className="mx-6 lg:mx-12 xl:mx-16 h-1.5 bg-linear-to-b from-black/[0.06] to-transparent" aria-hidden="true" />

      {/* Bottom ornament */}
      <footer className="pt-8 pb-10 flex justify-center" aria-hidden="true">
        <span className="inline-block h-px w-16 bg-border" />
      </footer>
    </div>
  );
}
