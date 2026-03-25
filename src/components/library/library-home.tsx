import { BookMarked, Clock3, Plus, Users } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { BookStatus } from "@/types/book";

export interface LibraryBookCardData {
  id              : string;
  title           : string;
  author          : string | null;
  dynasty         : string | null;
  coverUrl        : string | null;
  status          : BookStatus;
  chapterCount    : number | null;
  personaCount    : number | null;
  lastAnalyzedAt  : string | null;
  currentModelName: string | null;
  failureSummary  : string | null;
  parseProgress   : number | null;
  parseStage      : string | null;
}

export interface LibraryHomeProps {
  books: LibraryBookCardData[];
}

const STATUS_LABEL_MAP: Record<LibraryBookCardData["status"], string> = {
  PENDING   : "待解析",
  PROCESSING: "解析中",
  COMPLETED : "已完成",
  ERROR     : "解析失败"
};

const STATUS_VARIANT_MAP: Record<LibraryBookCardData["status"], "outline" | "warning" | "success"> = {
  PENDING   : "outline",
  PROCESSING: "warning",
  COMPLETED : "success",
  ERROR     : "warning"
};

function formatDateLabel(dateValue: string | null): string {
  if (!dateValue) {
    return "尚未开始";
  }

  const parsedDate = new Date(dateValue);
  if (Number.isNaN(parsedDate.getTime())) {
    return "待同步";
  }

  return parsedDate.toLocaleString("zh-CN", {
    year  : "numeric",
    month : "2-digit",
    day   : "2-digit",
    hour  : "2-digit",
    minute: "2-digit"
  });
}

function LibraryEmptyState() {
  return (
    <section className="library-empty-state rounded-[1.75rem] border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--card)_94%,white)] p-10 text-center shadow-md">
      <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--background)]">
        <BookMarked className="size-6 text-[var(--primary)]" />
      </div>
      <h2 className="mb-2 text-2xl font-semibold tracking-tight">书架还是空的</h2>
      <p className="mx-auto mb-6 max-w-2xl text-sm leading-7 text-[var(--muted-foreground)]">
        从一本文本开始，我们就能逐步构建人物图谱与证据链。MVP 当前支持 `.txt`
        导入，后续会在同一流程扩展更多格式。
      </p>
      <div className="flex justify-center">
        <Link
          href="/books/import"
          className="ui-button library-import-entry inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] transition-colors hover:bg-[var(--primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
        >
          <Plus className="size-4" />
          + 导入书籍
        </Link>
      </div>
    </section>
  );
}

function LibraryBookCard({ book }: { book: LibraryBookCardData }) {
  const parseProgress = Math.max(0, Math.min(100, book.parseProgress ?? 0));
  const graphHref = `/books/${encodeURIComponent(book.id)}/graph`;
  const canOpenGraph = book.status === "COMPLETED";

  return (
    <article className="library-book-card group rounded-2xl border border-[var(--border)] bg-[linear-gradient(165deg,color-mix(in_srgb,var(--card)_92%,white)_0%,color-mix(in_srgb,var(--card)_72%,var(--accent))_100%)] p-4 shadow-[0_22px_34px_-24px_rgba(24,32,46,0.75)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_30px_46px_-24px_rgba(24,32,46,0.8)]">
      <div className="relative mx-auto w-full max-w-[15rem]">
        <div className="absolute inset-y-3 -left-2 w-2 rounded-l-md border border-r-0 border-[color:color-mix(in_srgb,var(--border)_70%,transparent)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--muted)_72%,#8f5a2c_28%)_0%,color-mix(in_srgb,var(--muted)_58%,#5f3214_42%)_100%)] shadow-[inset_-1px_0_0_color-mix(in_srgb,var(--foreground)_12%,transparent)]" />
        {canOpenGraph ? (
          <Link
            href={graphHref}
            className="block rounded-r-2xl rounded-l-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)] focus-visible:ring-offset-2"
            aria-label={`进入《${book.title}》人物图谱`}
          >
            <div className="relative aspect-[2/3] overflow-hidden rounded-r-2xl rounded-l-md border border-[color:color-mix(in_srgb,var(--border)_86%,transparent)] bg-[var(--muted)]">
              {book.coverUrl ? (
                <Image
                  src={book.coverUrl}
                  alt={`${book.title} 封面`}
                  fill
                  unoptimized
                  sizes="(min-width: 1280px) 18rem, (min-width: 640px) 45vw, 90vw"
                  className="object-cover transition duration-500 group-hover:scale-[1.03]"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-[linear-gradient(165deg,#6d4020_0%,#3d2312_55%,#25160d_100%)] p-5">
                  <h3 className="line-clamp-6 text-center font-serif text-2xl leading-tight tracking-[0.08em] text-white/92">
                    {book.title}
                  </h3>
                </div>
              )}
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(10,12,16,0.42)_0%,rgba(10,12,16,0.08)_38%,rgba(10,12,16,0.6)_100%)]" />
              <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
                <p className="line-clamp-2 text-sm font-medium text-white/92">
                  {book.coverUrl ? book.title : " "}
                </p>
                <Badge variant={STATUS_VARIANT_MAP[book.status]}>{STATUS_LABEL_MAP[book.status]}</Badge>
              </div>
              <div className="absolute inset-x-0 bottom-0 space-y-2 p-3 text-white/88">
                <p className="truncate text-sm">
                  {book.author ?? "佚名"}
                  {book.dynasty ? ` · ${book.dynasty}` : ""}
                </p>
                {book.status === "PROCESSING" ? (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px] text-white/86">
                      <span>{book.parseStage ?? "处理中"}</span>
                      <span>{parseProgress}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/25">
                      <div
                        className="h-full rounded-full bg-white transition-all"
                        style={{ width: `${parseProgress}%` }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          </Link>
        ) : (
          <div
            aria-disabled="true"
            className="relative aspect-[2/3] overflow-hidden rounded-r-2xl rounded-l-md border border-[color:color-mix(in_srgb,var(--border)_86%,transparent)] bg-[var(--muted)]"
          >
            {book.coverUrl ? (
              <Image
                src={book.coverUrl}
                alt={`${book.title} 封面`}
                fill
                unoptimized
                sizes="(min-width: 1280px) 18rem, (min-width: 640px) 45vw, 90vw"
                className="object-cover transition duration-500 group-hover:scale-[1.03]"
              />
            ) : (
              <div className="flex h-full items-center justify-center bg-[linear-gradient(165deg,#6d4020_0%,#3d2312_55%,#25160d_100%)] p-5">
                <h3 className="line-clamp-6 text-center font-serif text-2xl leading-tight tracking-[0.08em] text-white/92">
                  {book.title}
                </h3>
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(10,12,16,0.42)_0%,rgba(10,12,16,0.08)_38%,rgba(10,12,16,0.6)_100%)]" />
            <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
              <p className="line-clamp-2 text-sm font-medium text-white/92">
                {book.coverUrl ? book.title : " "}
              </p>
              <Badge variant={STATUS_VARIANT_MAP[book.status]}>{STATUS_LABEL_MAP[book.status]}</Badge>
            </div>
            <div className="absolute inset-x-0 bottom-0 space-y-2 p-3 text-white/88">
              <p className="truncate text-sm">
                {book.author ?? "佚名"}
                {book.dynasty ? ` · ${book.dynasty}` : ""}
              </p>
              {book.status === "PROCESSING" ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-white/86">
                    <span>{book.parseStage ?? "处理中"}</span>
                    <span>{parseProgress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/25">
                    <div
                      className="h-full rounded-full bg-white transition-all"
                      style={{ width: `${parseProgress}%` }}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {canOpenGraph ? (
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">点击封面进入图谱</p>
      ) : (
        <p className="mt-3 text-xs text-[var(--muted-foreground)]">解析完成后可进入图谱</p>
      )}

      <details className="mt-3 rounded-xl border border-dashed border-[var(--border)] bg-[color:color-mix(in_srgb,var(--background)_42%,transparent)] px-3 py-2 text-xs text-[var(--muted-foreground)]">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[11px] uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          <span>展开书籍信息</span>
          <span className="text-[10px]">点击查看</span>
        </summary>
        <div className="mt-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <p className="flex items-center gap-1.5">
              <BookMarked className="size-3.5" />
              章节 {book.chapterCount ?? "--"}
            </p>
            <p className="flex items-center gap-1.5">
              <Users className="size-3.5" />
              人物 {book.personaCount ?? "--"}
            </p>
            <p className="col-span-2 flex items-center gap-1.5">
              <Clock3 className="size-3.5" />
              最近解析 {formatDateLabel(book.lastAnalyzedAt)}
            </p>
          </div>
          <div className="rounded-lg border border-dashed border-[var(--border)] bg-[color:color-mix(in_srgb,var(--background)_55%,transparent)] p-2">
            <p>数据来源：章节/人物统计来自结构化表</p>
            <p>解析时间 / 模型 / 失败摘要来自书籍记录与最近任务快照</p>
            <p>当前模型：{book.currentModelName ?? "待选择"}</p>
            <p>失败摘要：{book.failureSummary ?? "无"}</p>
            {book.coverUrl ? <p>封面资源：已配置</p> : <p>封面资源：未配置（使用默认封面）</p>}
            <p className="truncate">书籍 ID：{book.id}</p>
          </div>
        </div>
      </details>
    </article>
  );
}

export function LibraryHome({ books }: LibraryHomeProps) {
  return (
    <main className="library-home relative min-h-screen overflow-hidden px-6 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,color-mix(in_srgb,var(--accent)_60%,transparent),transparent_42%),radial-gradient(circle_at_92%_18%,color-mix(in_srgb,var(--primary)_32%,transparent),transparent_38%)]" />
      <div className="relative mx-auto flex w-full max-w-7xl flex-col gap-8">
        <section className="library-hero rounded-[2rem] border border-[var(--border)] bg-[color:color-mix(in_srgb,var(--card)_93%,white)] p-7 shadow-[0_28px_44px_-34px_rgba(10,20,35,0.75)] sm:p-9">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.2em] text-[var(--muted-foreground)]">Wen Yuan Library</p>
              <h1 className="font-serif text-3xl tracking-wide sm:text-4xl">文渊书库</h1>
              <p className="mt-2 text-sm text-[var(--muted-foreground)]">
                仿真书脊陈列，先支持文本导入、解析追踪与图谱入口。
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline">影响力排序（占位）</Button>
              <Link
                href="/books/import"
                className="ui-button inline-flex h-10 items-center justify-center gap-2 rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)] transition-colors hover:bg-[var(--primary-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2"
              >
                <Plus className="size-4" />
                + 导入书籍
              </Link>
            </div>
          </div>

          {books.length === 0 ? (
            <LibraryEmptyState />
          ) : (
            <section className="library-shelf rounded-[1.5rem] border border-[var(--border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--background)_76%,#7b4c1f_24%)_0%,color-mix(in_srgb,var(--background)_62%,#5d3618_38%)_100%)] p-5 sm:p-6">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {books.map((book) => (
                  <LibraryBookCard key={book.id} book={book} />
                ))}
              </div>
            </section>
          )}
        </section>
      </div>
    </main>
  );
}
