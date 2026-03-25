import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { provideStorage, type StorageProviderClient } from "@/server/providers/storage";

export interface DeleteBookResult {
  id: string;
}

export function createDeleteBookService(
  prismaClient: PrismaClient = prisma,
  storageClient: StorageProviderClient = provideStorage()
) {
  async function deleteBook(bookId: string): Promise<DeleteBookResult> {
    const book = await prismaClient.book.findUnique({
      where : { id: bookId },
      select: {
        id           : true,
        sourceFileKey: true
      }
    });

    if (!book) {
      throw new BookNotFoundError(bookId);
    }

    const chapters = await prismaClient.chapter.findMany({
      where : { bookId },
      select: { id: true }
    });
    const chapterIds = chapters.map((chapter) => chapter.id);

    await prismaClient.$transaction(async (tx) => {
      if (chapterIds.length > 0) {
        await tx.relationship.deleteMany({
          where: {
            chapterId: { in: chapterIds }
          }
        });

        await tx.biographyRecord.deleteMany({
          where: {
            chapterId: { in: chapterIds }
          }
        });

        await tx.mention.deleteMany({
          where: {
            chapterId: { in: chapterIds }
          }
        });
      }

      await tx.analysisJob.deleteMany({
        where: { bookId }
      });

      await tx.profile.deleteMany({
        where: { bookId }
      });

      await tx.chapter.deleteMany({
        where: { bookId }
      });

      await tx.book.delete({
        where: { id: bookId }
      });
    });

    if (book.sourceFileKey) {
      await storageClient.deleteObject(book.sourceFileKey).catch(() => undefined);
    }

    return { id: bookId };
  }

  return { deleteBook };
}

export const { deleteBook } = createDeleteBookService();

