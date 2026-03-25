import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { normalizeBookStatus, type BookLibraryListItem } from "@/types/book";

interface BookDetailRow {
  id            : string;
  title         : string;
  author        : string | null;
  dynasty       : string | null;
  description   : string | null;
  coverUrl      : string | null;
  status        : string;
  parseProgress : number;
  parseStage    : string | null;
  errorLog      : string | null;
  createdAt     : Date;
  updatedAt     : Date;
  sourceFileKey : string | null;
  sourceFileUrl : string | null;
  sourceFileName: string | null;
  sourceFileMime: string | null;
  sourceFileSize: number | null;
  aiModel       : {
    name: string;
  } | null;
  chapters: Array<{ id: string }>;
  profiles: Array<{ id: string }>;
  analysisJobs: Array<{
    updatedAt : Date;
    finishedAt: Date | null;
    errorLog  : string | null;
    aiModel   : {
      name: string;
    } | null;
  }>;
}

function resolveLastAnalyzedAt(
  status: ReturnType<typeof normalizeBookStatus>,
  updatedAt: Date,
  analysisJobs: BookDetailRow["analysisJobs"]
): string | null {
  return analysisJobs[0]?.finishedAt?.toISOString()
    ?? analysisJobs[0]?.updatedAt.toISOString()
    ?? (status === "PENDING" ? null : updatedAt.toISOString());
}

function mapBookDetail(book: BookDetailRow): BookLibraryListItem {
  const status = normalizeBookStatus(book.status);

  return {
    id            : book.id,
    title         : book.title,
    author        : book.author,
    dynasty       : book.dynasty,
    coverUrl      : book.coverUrl,
    status,
    chapterCount  : book.chapters.length,
    personaCount  : book.profiles.length,
    lastAnalyzedAt: resolveLastAnalyzedAt(status, book.updatedAt, book.analysisJobs),
    currentModelName: book.aiModel?.name ?? book.analysisJobs[0]?.aiModel?.name ?? null,
    failureSummary  : book.errorLog ?? book.analysisJobs[0]?.errorLog ?? null,
    parseProgress   : book.parseProgress,
    parseStage      : book.parseStage,
    createdAt       : book.createdAt.toISOString(),
    updatedAt       : book.updatedAt.toISOString(),
    sourceFile      : {
      key : book.sourceFileKey,
      url : book.sourceFileUrl,
      name: book.sourceFileName,
      mime: book.sourceFileMime,
      size: book.sourceFileSize
    }
  };
}

export function createGetBookByIdService(
  prismaClient: PrismaClient = prisma
) {
  async function getBookById(bookId: string): Promise<BookLibraryListItem> {
    const book = await prismaClient.book.findUnique({
      where : { id: bookId },
      select: {
        id            : true,
        title         : true,
        author        : true,
        dynasty       : true,
        description   : true,
        coverUrl      : true,
        status        : true,
        parseProgress : true,
        parseStage    : true,
        errorLog      : true,
        createdAt     : true,
        updatedAt     : true,
        sourceFileKey : true,
        sourceFileUrl : true,
        sourceFileName: true,
        sourceFileMime: true,
        sourceFileSize: true,
        aiModel       : {
          select: {
            name: true
          }
        },
        chapters: {
          select: {
            id: true
          }
        },
        profiles: {
          where : { deletedAt: null },
          select: {
            id: true
          }
        },
        analysisJobs: {
          take   : 1,
          orderBy: { updatedAt: "desc" },
          select : {
            updatedAt : true,
            finishedAt: true,
            errorLog  : true,
            aiModel   : {
              select: {
                name: true
              }
            }
          }
        }
      }
    });

    if (!book) {
      throw new BookNotFoundError(bookId);
    }

    return mapBookDetail(book as BookDetailRow);
  }

  return { getBookById };
}

export const { getBookById } = createGetBookByIdService();

