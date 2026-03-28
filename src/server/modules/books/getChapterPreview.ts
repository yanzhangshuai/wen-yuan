import { type ChapterType } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  splitRawContentToChapterDrafts
} from "@/server/modules/books/chapterSplit";
import {
  BookNotFoundError,
  BookSourceFileMissingError
} from "@/server/modules/books/errors";
import { provideStorage, type StorageProviderClient } from "@/server/providers/storage";

export interface ChapterPreviewItem {
  index      : number;
  chapterType: ChapterType;
  title      : string;
  wordCount  : number;
}

export interface ChapterPreviewResult {
  bookId      : string;
  chapterCount: number;
  items       : ChapterPreviewItem[];
}

export function splitRawContentToChapterPreview(rawContent: string): ChapterPreviewItem[] {
  return splitRawContentToChapterDrafts(rawContent).map((item) => ({
    index      : item.index,
    chapterType: item.chapterType,
    title      : item.title,
    wordCount  : item.wordCount
  }));
}

export function decodeBookText(fileBuffer: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(fileBuffer);
  } catch {
    return new TextDecoder("gb18030").decode(fileBuffer);
  }
}

export function createGetChapterPreviewService(
  prismaClient: PrismaClient = prisma,
  storageClient: StorageProviderClient = provideStorage()
) {
  async function getChapterPreview(bookId: string): Promise<ChapterPreviewResult> {
    const book = await prismaClient.book.findFirst({
      where: {
        id       : bookId,
        deletedAt: null
      },
      select: {
        id           : true,
        sourceFileKey: true
      }
    });

    if (!book) {
      throw new BookNotFoundError(bookId);
    }

    if (!book.sourceFileKey) {
      throw new BookSourceFileMissingError(bookId);
    }

    const fileBuffer = await storageClient.getObject(book.sourceFileKey);
    const rawContent = decodeBookText(fileBuffer);
    const items = splitRawContentToChapterPreview(rawContent);

    return {
      bookId      : book.id,
      chapterCount: items.length,
      items
    };
  }

  return { getChapterPreview };
}

export const { getChapterPreview } = createGetChapterPreviewService();
export { BookNotFoundError, BookSourceFileMissingError } from "@/server/modules/books/errors";
