import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";

export interface BookStatusSnapshot {
  id            : string;
  status        : string;
  parseProgress : number;
  parseStage    : string | null;
  failureSummary: string | null;
  updatedAt     : string;
}

export function createGetBookStatusService(
  prismaClient: PrismaClient = prisma
) {
  async function getBookStatus(bookId: string): Promise<BookStatusSnapshot> {
    const book = await prismaClient.book.findUnique({
      where : { id: bookId },
      select: {
        id           : true,
        status       : true,
        parseProgress: true,
        parseStage   : true,
        errorLog     : true,
        updatedAt    : true,
        analysisJobs : {
          take   : 1,
          orderBy: { updatedAt: "desc" },
          select : {
            updatedAt: true,
            errorLog : true
          }
        }
      }
    });

    if (!book) {
      throw new BookNotFoundError(bookId);
    }

    const latestJob = book.analysisJobs[0];
    return {
      id            : book.id,
      status        : book.status,
      parseProgress : book.parseProgress,
      parseStage    : book.parseStage,
      failureSummary: book.errorLog ?? latestJob?.errorLog ?? null,
      updatedAt     : (latestJob?.updatedAt ?? book.updatedAt).toISOString()
    };
  }

  return { getBookStatus };
}

export const { getBookStatus } = createGetBookStatusService();
export { BookNotFoundError } from "@/server/modules/books/errors";
