import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PersonaTimeReviewPage } from "@/components/review/persona-time-matrix/persona-time-review-page";
import { ReviewModeNav } from "@/components/review/shared/review-mode-nav";
import { cn } from "@/lib/utils";
import type {
  PersonaTimeMatrixDto
} from "@/lib/services/review-time-matrix";
import { getBookById } from "@/server/modules/books/getBookById";
import { listBooks } from "@/server/modules/books/listBooks";
import { createReviewQueryService } from "@/server/modules/review/evidence-review/review-query-service";

type SearchParamValue = string | string[] | undefined;

interface AdminBookTimeReviewSearchParams {
  personaId?: SearchParamValue;
  timeKey?  : SearchParamValue;
  timeLabel?: SearchParamValue;
}

const EMPTY_SEARCH_PARAMS: AdminBookTimeReviewSearchParams = {};

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

function normalizeTimeLabel(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function resolveTimeKeyFromLabel(
  matrix: PersonaTimeMatrixDto,
  timeLabel: string | null
): string | null {
  if (timeLabel === null) {
    return null;
  }

  const normalizedTimeLabel = normalizeTimeLabel(timeLabel);

  for (const group of matrix.timeGroups) {
    for (const slice of group.slices) {
      if (normalizeTimeLabel(slice.normalizedLabel) === normalizedTimeLabel) {
        return slice.timeKey;
      }

      if (slice.rawLabels.some((label) => normalizeTimeLabel(label) === normalizedTimeLabel)) {
        return slice.timeKey;
      }
    }
  }

  return null;
}

function resolveInitialSelectedCell(
  matrix: PersonaTimeMatrixDto,
  searchParams: AdminBookTimeReviewSearchParams
): { personaId: string; timeKey: string } | null {
  const personaId = readSingleSearchParam(searchParams.personaId);
  const requestedTimeKey = readSingleSearchParam(searchParams.timeKey);
  const resolvedTimeKey = requestedTimeKey !== null
    ? requestedTimeKey
    : resolveTimeKeyFromLabel(matrix, readSingleSearchParam(searchParams.timeLabel));

  if (personaId === null || resolvedTimeKey === null) {
    return null;
  }

  return {
    personaId,
    timeKey: resolvedTimeKey
  };
}

interface AdminBookTimeReviewPageProps {
  params       : Promise<{ bookId: string }>;
  searchParams?: Promise<AdminBookTimeReviewSearchParams>;
}

export async function generateMetadata({
  params
}: AdminBookTimeReviewPageProps): Promise<Metadata> {
  const { bookId } = await params;
  try {
    const book = await getBookById(bookId);
    return { title: `时间审核 · ${book.title}` };
  } catch {
    return { title: "时间审核" };
  }
}

/**
 * 文件定位（人物 x 时间审核页 server component）：
 * - 当前阶段只负责首屏数据装配与书籍切换壳层；
 * - 具体矩阵交互将在后续 Task 4/5 的客户端页面中承接。
 */
export default async function AdminBookTimeReviewPage({
  params,
  searchParams
}: AdminBookTimeReviewPageProps) {
  const { bookId } = await params;

  let book;
  try {
    book = await getBookById(bookId);
  } catch {
    notFound();
  }

  const reviewQueryService = createReviewQueryService();
  const [allBooks, initialMatrix] = await Promise.all([
    listBooks(),
    reviewQueryService.getPersonaTimeMatrix({ bookId })
  ]);
  const resolvedSearchParams = await (searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS));
  const initialSelectedCell = resolveInitialSelectedCell(initialMatrix, resolvedSearchParams);

  return (
    <div className="flex gap-6 items-start">
      <aside className="w-44 shrink-0">
        <div className="sticky top-20">
          <h2 className="text-xs font-medium text-muted-foreground mb-3 px-2 uppercase tracking-wider">
            选择书籍
          </h2>
          <nav className="space-y-0.5">
            {allBooks.map((candidateBook) => (
              <Link
                key={candidateBook.id}
                href={`/admin/review/${candidateBook.id}/time`}
                className={cn(
                  "flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors",
                  candidateBook.id === bookId
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-foreground hover:bg-accent"
                )}
              >
                <span className="truncate">{candidateBook.title}</span>
                <span className="ml-2 text-xs text-muted-foreground/70 shrink-0 tabular-nums">
                  {candidateBook.personaCount}
                </span>
              </Link>
            ))}
          </nav>
        </div>
      </aside>

      <div className="flex-1 min-w-0 space-y-4">
        <ReviewModeNav bookId={bookId} activeMode="time" />
        <PersonaTimeReviewPage
          bookId={bookId}
          bookTitle={book.title}
          allBooks={allBooks}
          initialMatrix={initialMatrix}
          initialSelectedCell={initialSelectedCell}
        />
      </div>
    </div>
  );
}
