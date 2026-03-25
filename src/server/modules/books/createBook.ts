import path from "node:path";
import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { provideStorage, type StorageProviderClient } from "@/server/providers/storage";
import { normalizeBookStatus, type CreateBookResponseData } from "@/types/book";

export interface CreateBookInput {
  title?      : string;
  author?     : string;
  dynasty?    : string;
  description?: string;
  fileName    : string;
  fileMime?   : string | null;
  rawContent  : string;
}

function normalizeOptionalText(value?: string): string | undefined {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

/**
 * 导入流程允许用户先上传文本、再补元数据，因此这里必须对 title 做兜底。
 * 先用用户显式输入，其次回退到去扩展名后的文件名，避免创建出空标题 Book。
 */
function resolveBookTitle(input: Pick<CreateBookInput, "title" | "fileName">): string {
  const explicitTitle = normalizeOptionalText(input.title);
  if (explicitTitle) {
    return explicitTitle;
  }

  const fallbackTitle = path.parse(input.fileName).name.trim();
  return fallbackTitle || "未命名书籍";
}

export function createCreateBookService(
  prismaClient: PrismaClient = prisma,
  storageClient: StorageProviderClient = provideStorage()
) {
  async function createBook(input: CreateBookInput): Promise<CreateBookResponseData> {
    const bookId = randomUUID();
    const sourceFileName = path.basename(input.fileName) || "original.txt";
    const sourceFileMime = normalizeOptionalText(input.fileMime ?? undefined) ?? "text/plain; charset=utf-8";
    const sourceFileKey = `books/${bookId}/source/original.txt`;

    const storedFile = await storageClient.putObject({
      key        : sourceFileKey,
      body       : input.rawContent,
      contentType: sourceFileMime
    });

    try {
      const book = await prismaClient.book.create({
        data: {
          id            : bookId,
          title         : resolveBookTitle(input),
          author        : normalizeOptionalText(input.author) ?? null,
          dynasty       : normalizeOptionalText(input.dynasty) ?? null,
          description   : normalizeOptionalText(input.description) ?? null,
          rawContent    : input.rawContent,
          sourceFileKey : storedFile.key,
          sourceFileUrl : storedFile.url,
          sourceFileName,
          sourceFileMime: storedFile.contentType,
          sourceFileSize: storedFile.size
        }
      });

      return {
        id         : book.id,
        title      : book.title,
        author     : book.author,
        dynasty    : book.dynasty,
        description: book.description,
        status     : normalizeBookStatus(book.status),
        sourceFile : {
          key : book.sourceFileKey,
          url : book.sourceFileUrl,
          name: book.sourceFileName,
          mime: book.sourceFileMime,
          size: book.sourceFileSize
        }
      };
    } catch (error) {
      await storageClient.deleteObject(storedFile.key).catch(() => undefined);
      throw error;
    }
  }

  return { createBook };
}

export const { createBook } = createCreateBookService();
