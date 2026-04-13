/**
 * =============================================================================
 * 文件定位（服务层：书籍创建与原文存储）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/books/createBook.ts`
 *
 * 职责定位：
 * - 接收路由层归一化后的书籍导入输入；
 * - 写入对象存储（原始文本）并创建书籍记录；
 * - 返回前端可直接消费的书籍快照。
 *
 * 业务语义：
 * - 书名优先使用用户填写，缺失时回退文件名，这是导入流程的业务规则；
 * - 原文文件与元数据分离存储，便于后续章节切分与复算任务复用原始文本。
 *
 * 协作关系：
 * - 上游：`/api/books` 的 POST 接口；
 * - 下游：存储 provider + Prisma + `normalizeBookStatus` 展示层状态映射。
 * =============================================================================
 */
import path from "node:path";
import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { provideStorage, type StorageProviderClient } from "@/server/providers/storage";
import { buildDatedStorageKey } from "@/server/providers/storage/storage.utils";
import { normalizeBookStatus, type CreateBookResponseData } from "@/types/book";

export interface CreateBookInput {
  /** 书名（可选，缺失时回退文件名）。 */
  title?      : string;
  /** 作者（可选）。 */
  author?     : string;
  /** 朝代（可选）。 */
  dynasty?    : string;
  /** 书籍类型 ID（可选），用于绑定 book_types 结构化配置。 */
  bookTypeId? : string;
  /** 简介（可选）。 */
  description?: string;
  /** 原始上传文件名（含扩展名）。 */
  fileName    : string;
  /** 文件 MIME（可选，默认 text/plain）。 */
  fileMime?   : string | null;
  /** 原始文件二进制内容（由 Route 层传入，存储至对象存储）。 */
  fileContent : Buffer;
}

/**
 * 功能：标准化可选文本字段。
 * 输入：value?: string。
 * 输出：去首尾空格后的非空字符串；空值返回 undefined。
 * 异常：无。
 * 副作用：无。
 */
function normalizeOptionalText(value?: string): string | undefined {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

/**
 * 功能：解析书籍最终标题（用户输入优先，文件名兜底）。
 * 输入：title 与 fileName。
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
 * 功能：创建书籍导入服务（上传源文件 + 仅写入 Book 元数据，不写章节）。
 * 输入：可注入 prismaClient 与 storageClient（便于测试替换）。
 * 输出：{ createBook } 服务对象。
 * 异常：由内部 createBook 抛出。
 * 副作用：无（仅返回闭包函数）。
 */
export function createCreateBookService(
  prismaClient: PrismaClient = prisma,
  storageClient: StorageProviderClient = provideStorage()
) {
  /**
   * 功能：执行一次书籍元数据导入（仅上传文件 + 写入 Book 记录，不切分章节）。
   * 输入：CreateBookInput（元数据 + 原始文件内容）。
   * 输出：CreateBookResponseData（书库卡片可直接消费）。
   * 异常：存储上传失败或数据库写入失败时抛错。
   * 副作用：写入对象存储与 books 表；DB 失败时尝试回滚已上传对象。
   */
  async function createBook(input: CreateBookInput): Promise<CreateBookResponseData> {
    const bookId = randomUUID();
    const sourceFileName = path.basename(input.fileName) || "original.txt";
    const sourceFileMime = normalizeOptionalText(input.fileMime ?? undefined) ?? "text/plain; charset=utf-8";
    const sourceFileKey = buildDatedStorageKey({
      directory: "books",
      fileName : sourceFileName
    });

    const storedFile = await storageClient.putObject({
      key        : sourceFileKey,
      body       : input.fileContent,
      contentType: sourceFileMime
    });

    try {
      const book = await prismaClient.book.create({
        data: {
          id            : bookId,
          title         : resolveBookTitle(input),
          author        : normalizeOptionalText(input.author) ?? null,
          dynasty       : normalizeOptionalText(input.dynasty) ?? null,
          bookTypeId    : normalizeOptionalText(input.bookTypeId) ?? null,
          description   : normalizeOptionalText(input.description) ?? null,
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
