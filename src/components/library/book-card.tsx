"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { BookCover } from "@/components/library/book-cover";
import { cn } from "@/lib/utils";
import {
  Users,
  Clock,
  AlertCircle,
  FileText
} from "lucide-react";
import type { BookLibraryListItem } from "@/types/book";

interface BookCardProps {
  book: BookLibraryListItem;
}

export function BookCard({ book }: BookCardProps) {
  const isCompleted = book.status === "COMPLETED";
  const isError = book.status === "ERROR";
  const href = `/books/${book.id}/graph`;

  const cardContent = (
    <motion.div
      className="relative group w-full h-full"
      whileHover={isCompleted ? { y: -8 } : undefined}
      transition={{ duration: 0.2, ease: "easeOut" }}
    >
      <div className="relative w-full aspect-2/3">
        <BookCover
          id={book.id}
          title={book.title}
          author={book.author}
          coverUrl={book.coverUrl}
          disabled={!isCompleted}
          className={cn(
            "shadow-card group-hover:shadow-card-hover transition-shadow duration-300"
          )}
        />

        {/* Non-completed overlay */}
        {!isCompleted && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-20 rounded">
            <span className={cn(
              "px-3 py-1 rounded-full text-xs font-bold text-white backdrop-blur-sm",
              isError ? "bg-red-500/80" : "bg-neutral-500/80"
            )}>
              {isError ? "解析失败" : "解析中"}
            </span>
          </div>
        )}

        {/* Hover details panel — gradient fades in, children stagger up */}
        <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/90 via-black/60 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-30 rounded-b flex flex-col justify-end min-h-[55%]">
          <h3 className="text-white font-bold text-lg leading-tight mb-1 drop-shadow-md line-clamp-2
            translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100
            transition-all duration-300 delay-0 group-hover:delay-75">
            {book.title}
          </h3>
          <p className="text-white/80 text-sm mb-3 font-medium
            translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100
            transition-all duration-300 delay-0 group-hover:delay-100">
            {book.author || "佚名"} {book.dynasty && `· ${book.dynasty}`}
          </p>

          <div className="grid grid-cols-2 gap-2 text-xs text-white/70
            translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100
            transition-all duration-300 delay-0 group-hover:delay-150">
            <div className="flex items-center gap-1" title="章节数">
              <FileText size={12} aria-hidden="true" />
              <span>{book.chapterCount ?? 0} 章</span>
            </div>
            <div className="flex items-center gap-1" title="人物数">
              <Users size={12} aria-hidden="true" />
              <span>{book.personaCount ?? 0} 人</span>
            </div>
            {book.lastAnalyzedAt && (
              <div className="col-span-2 flex items-center gap-1 mt-1 opacity-60" title={`最近解析: ${new Date(book.lastAnalyzedAt).toLocaleDateString()}`}>
                <Clock size={12} aria-hidden="true" />
                <span>{new Date(book.lastAnalyzedAt).toLocaleDateString()}</span>
              </div>
            )}
            {isError && book.lastErrorSummary && (
              <div className="col-span-2 flex items-start gap-1 mt-2 text-red-300 bg-red-900/40 p-1.5 rounded" title={book.lastErrorSummary}>
                <AlertCircle size={12} className="shrink-0 mt-0.5" aria-hidden="true" />
                <span className="line-clamp-2 leading-tight" style={{ fontSize: "10px" }}>{book.lastErrorSummary}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      {/* 3D Shelf — book resting on wooden ledge */}
      <div className="relative" aria-hidden="true">
        <div className="w-[115%] -ml-[7.5%] h-1.25 rounded-[1px]" style={{ backgroundColor: "var(--color-shelf-surface)" }} />
        <div className="w-[118%] -ml-[9%] h-0.75 rounded-b-xs" style={{ backgroundColor: "var(--color-shelf-edge)" }} />
        <div className="w-[110%] -ml-[5%] h-2 rounded-[50%] bg-black/8 blur-[3px] -mt-0.5" />
      </div>
    </motion.div>
  );

  if (isCompleted) {
    return (
      <Link
        href={href}
        className="block w-full h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded"
        aria-label={`查看「${book.title}」人物图谱`}
      >
        {cardContent}
      </Link>
    );
  }

  return (
    <div className="block w-full h-full cursor-not-allowed opacity-80 grayscale-[0.5]">
      {cardContent}
    </div>
  );
}
