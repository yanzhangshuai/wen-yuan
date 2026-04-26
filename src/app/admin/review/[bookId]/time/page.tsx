import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PersonaTimeReviewPage } from "@/components/review/persona-time-matrix/persona-time-review-page";
import { ReviewWorkbenchShell } from "@/components/review/shared/review-workbench-shell";
import { buildPersonaListItems } from "@/components/review/shared/persona-list-summary";
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
  focus?    : SearchParamValue;
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
  const resolvedSearchParams = await (searchParams ?? Promise.resolve(EMPTY_SEARCH_PARAMS));
  const initialSelectedPersonaId = readSingleSearchParam(resolvedSearchParams.personaId);
  const initialFocusOnly = resolvedSearchParams.focus === "1";

  let book;
  try {
    book = await getBookById(bookId);
  } catch {
    notFound();
  }

  const reviewQueryService = createReviewQueryService();
  const [allBooks, initialMatrix, matrix] = await Promise.all([
    listBooks(),
    reviewQueryService.getPersonaTimeMatrix({ bookId }),
    reviewQueryService.getPersonaChapterMatrix({ bookId })
  ]);
  const initialSelectedCell = resolveInitialSelectedCell(initialMatrix, resolvedSearchParams);

  const personaItems = buildPersonaListItems(matrix);
  const books = allBooks.map((b) => ({ id: b.id, title: b.title }));

  return (
    <ReviewWorkbenchShell
      bookId                  ={bookId}
      bookTitle               ={book.title}
      books                   ={books}
      mode                    ="time"
      personaItems            ={personaItems}
      initialSelectedPersonaId={initialSelectedPersonaId}
      initialFocusOnly        ={initialFocusOnly}
    >
      <section
        className="persona-time-review-page-server rounded-xl border bg-card p-6 shadow-sm"
        data-time-matrix-book-id={initialMatrix.bookId}
        data-persona-count={initialMatrix.personas.length}
        data-time-group-count={initialMatrix.timeGroups.length}
        data-cell-count={initialMatrix.cells.length}
      >
        <PersonaTimeReviewPage
          bookId={bookId}
          bookTitle={book.title}
          allBooks={allBooks}
          initialMatrix={initialMatrix}
          initialSelectedCell={initialSelectedCell}
        />
      </section>
    </ReviewWorkbenchShell>
  );
}
