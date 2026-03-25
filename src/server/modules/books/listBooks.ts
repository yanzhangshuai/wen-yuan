import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { normalizeBookStatus, type BookLibraryListItem } from "@/types/book";

interface BookListRowBase {
  id           : string;
  title        : string;
  author       : string | null;
  dynasty      : string | null;
  coverUrl     : string | null;
  status       : string;
  parseProgress: number;
  parseStage   : string | null;
  createdAt    : Date;
  updatedAt    : Date;
  errorLog     : string | null;
  aiModel      : {
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

interface BookListRowWithSource extends BookListRowBase {
  sourceFileKey : string | null;
  sourceFileUrl : string | null;
  sourceFileName: string | null;
  sourceFileMime: string | null;
  sourceFileSize: number | null;
}

interface BookListRowMinimal {
  id       : string;
  title    : string;
  author   : string | null;
  dynasty  : string | null;
  coverUrl : string | null;
  status   : string;
  createdAt: Date;
  updatedAt: Date;
  errorLog : string | null;
  aiModel  : {
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

const BOOK_LIST_SELECT_BASE = {
  id           : true,
  title        : true,
  author       : true,
  dynasty      : true,
  coverUrl     : true,
  status       : true,
  parseProgress: true,
  parseStage   : true,
  createdAt    : true,
  updatedAt    : true,
  errorLog     : true,
  aiModel      : {
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
} as const;

const BOOK_LIST_SELECT_WITH_SOURCE = {
  ...BOOK_LIST_SELECT_BASE,
  sourceFileKey : true,
  sourceFileUrl : true,
  sourceFileName: true,
  sourceFileMime: true,
  sourceFileSize: true
} as const;

const BOOK_LIST_SELECT_MINIMAL = {
  id       : true,
  title    : true,
  author   : true,
  dynasty  : true,
  coverUrl : true,
  status   : true,
  createdAt: true,
  updatedAt: true,
  errorLog : true,
  aiModel  : {
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
} as const;

function isMissingColumnError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  return Reflect.get(error, "code") === "P2022";
}

function resolveLastAnalyzedAt(
  status: ReturnType<typeof normalizeBookStatus>,
  updatedAt: Date,
  analysisJobs: BookListRowBase["analysisJobs"] | BookListRowMinimal["analysisJobs"]
): string | null {
  return analysisJobs[0]?.finishedAt?.toISOString()
    ?? analysisJobs[0]?.updatedAt.toISOString()
    ?? (status === "PENDING" ? null : updatedAt.toISOString());
}

function mapBookWithSource(book: BookListRowWithSource): BookLibraryListItem {
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

function mapBookWithoutSource(book: BookListRowBase): BookLibraryListItem {
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
      key : null,
      url : null,
      name: null,
      mime: null,
      size: null
    }
  };
}

function mapBookMinimal(book: BookListRowMinimal): BookLibraryListItem {
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
    parseProgress   : 0,
    parseStage      : null,
    createdAt       : book.createdAt.toISOString(),
    updatedAt       : book.updatedAt.toISOString(),
    sourceFile      : {
      key : null,
      url : null,
      name: null,
      mime: null,
      size: null
    }
  };
}

export function createListBooksService(
  prismaClient: PrismaClient = prisma
) {
  async function listBooks(): Promise<BookLibraryListItem[]> {
    try {
      const books = await prismaClient.book.findMany({
        orderBy: { updatedAt: "desc" },
        select : BOOK_LIST_SELECT_WITH_SOURCE
      });

      return books.map((book) => mapBookWithSource(book as BookListRowWithSource));
    } catch (error) {
      if (!isMissingColumnError(error)) {
        throw error;
      }
    }

    try {
      const books = await prismaClient.book.findMany({
        orderBy: { updatedAt: "desc" },
        select : BOOK_LIST_SELECT_BASE
      });

      return books.map((book) => mapBookWithoutSource(book as BookListRowBase));
    } catch (error) {
      if (!isMissingColumnError(error)) {
        throw error;
      }
    }

    const books = await prismaClient.book.findMany({
      orderBy: { updatedAt: "desc" },
      select : BOOK_LIST_SELECT_MINIMAL
    });

    return books.map((book) => mapBookMinimal(book as BookListRowMinimal));
  }

  return { listBooks };
}

export const { listBooks } = createListBooksService();
