import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createBook } from "@/server/modules/books/createBook";
import { listBooks } from "@/server/modules/books/listBooks";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { failJson, okJson } from "@/server/http/route-utils";
import { ERROR_CODES } from "@/types/api";
import type { BookLibraryListItem, CreateBookResponseData } from "@/types/book";

const MAX_BOOK_FILE_SIZE = 50 * 1024 * 1024;

const optionalTextField = z.preprocess((value) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : undefined;
}, z.string().max(200).optional());

const optionalLongTextField = z.preprocess((value) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : undefined;
}, z.string().max(5000).optional());

const createBookFormSchema = z.object({
  title      : optionalTextField,
  author     : optionalTextField,
  dynasty    : optionalTextField,
  description: optionalLongTextField,
  file       : z.instanceof(File)
    .refine((file) => file.size > 0, "请上传书籍文件")
    .refine((file) => /\.txt$/i.test(file.name), "MVP 仅支持 .txt 文件导入")
    .refine((file) => file.size <= MAX_BOOK_FILE_SIZE, "文件大小不能超过 50MB")
});

function badRequestJson(
  requestId: string,
  startedAt: number,
  detail: string
) {
  const meta = createApiMeta("/api/books", requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_BAD_REQUEST,
      "导入参数不合法",
      {
        type: "ValidationError",
        detail
      },
      meta
    ),
    400
  );
}

/**
 * 导入链路后续会扩展章节切分、任务启动等步骤。
 * 当前先保证 `.txt -> 存储原文件 -> 创建 Book` 这条最小闭环可独立工作。
 */
export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const formData = await request.formData();
    const parsedResult = createBookFormSchema.safeParse({
      title      : formData.get("title"),
      author     : formData.get("author"),
      dynasty    : formData.get("dynasty"),
      description: formData.get("description"),
      file       : formData.get("file")
    });

    if (!parsedResult.success) {
      return badRequestJson(requestId, startedAt, parsedResult.error.issues[0]?.message ?? "请求参数不合法");
    }

    const fileBuffer = Buffer.from(await parsedResult.data.file.arrayBuffer());
    const createdBook = await createBook({
      title      : parsedResult.data.title,
      author     : parsedResult.data.author,
      dynasty    : parsedResult.data.dynasty,
      description: parsedResult.data.description,
      fileName   : parsedResult.data.file.name,
      fileMime   : parsedResult.data.file.type,
      rawContent : fileBuffer.toString("utf8")
    });

    return okJson<CreateBookResponseData>({
      path   : "/api/books",
      requestId,
      startedAt,
      code   : "BOOK_CREATED",
      message: "书籍导入成功",
      data   : createdBook,
      status : 201
    });
  } catch (error) {
    return failJson({
      path           : "/api/books",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "书籍导入失败"
    });
  }
}

export async function GET(): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const books = await listBooks();

    return okJson<BookLibraryListItem[]>({
      path   : "/api/books",
      requestId,
      startedAt,
      code   : "BOOKS_LISTED",
      message: "书库列表获取成功",
      data   : books
    });
  } catch (error) {
    return failJson({
      path           : "/api/books",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "书库列表获取失败"
    });
  }
}
