import path from "node:path";
import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { provideStorage, type StorageProviderClient } from "@/server/providers/storage";
import { normalizeBookStatus, type CreateBookResponseData } from "@/types/book";

export interface CreateBookInput {
  /** 书名（可选，缺失时回退文件名）。 */
  title?      : string;
  /** 作者（可选）。 */
  author?     : string;
  /** 朝代（可选）。 */
  dynasty?    : string;
  /** 简介（可选）。 */
  description?: string;
  /** 原始上传文件名（含扩展名）。 */
  fileName    : string;
  /** 文件 MIME（可选，默认 text/plain）。 */
  fileMime?   : string | null;
  /** 原始文本内容（UTF-8 字符串）。 */
  rawContent  : string;
}

/**
 * 功能：标准化可选文本字段。
 * 输入：`value?: string`。
 * 输出：去首尾空格后的非空字符串；空值返回 `undefined`。
 * 异常：无。
 * 副作用：无。
 */
function normalizeOptionalText(value?: string): string | undefined {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

/**
 * 功能：解析书籍最终标题（用户输入优先，文件名兜底）。
 * 输入：`title` 与 `fileName`。
 * 输出：可持久化的非空书名。
 * 异常：无。
 * 副作用：无。
 */
function resolveBookTitle(input: Pick<CreateBookInput, "title" | "fileName">): string {
  const explicitTitle = normalizeOptionalText(input.title);
  if (explicitTitle) {
    return explicitTitle;
  }

  const fallbackTitle = path.parse(input.fileName).name.trim();
  return fallbackTitle || "未命名书籍";
}

/**
 * 功能：创建书籍导入服务（上传原文 + 写入 Book 记录）。
 * 输入：可注入 `prismaClient` 与 `storageClient`（便于测试替换）。
 * 输出：`{ createBook }` 服务对象。
 * 异常：由内部 `createBook` 抛出。
 * 副作用：无（仅返回闭包函数）。
 */
export function createCreateBookService(
  prismaClient: PrismaClient = prisma,
  storageClient: StorageProviderClient = provideStorage()
) {
  /**
   * 功能：执行一次书籍导入写入。
   * 输入：`CreateBookInput`（元数据 + 原文内容）。
   * 输出：`CreateBookResponseData`（书库卡片可直接消费）。
   * 异常：存储上传失败或数据库写入失败时抛错。
   * 副作用：写入对象存储与 `books` 表；DB 失败时尝试回滚已上传对象。
   */
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
