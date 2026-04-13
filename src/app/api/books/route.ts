/**
 * =============================================================================
 * 文件定位（Next.js Route Handler：书籍集合接口）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/books/route.ts`
 *
 * 该文件承担集合级能力：
 * - `POST /api/books`：导入新书（multipart/form-data 上传文件）；
 * - `GET /api/books`：查询书库列表。
 *
 * 框架语义与运行环境：
 * - App Router 的 `route.ts` 只在服务端执行，可直接访问对象存储与数据库；
 * - 不使用 React 状态，而是基于 HTTP 请求生命周期处理数据。
 *
 * 业务意图：
 * - 在入口处统一限制上传体积与字段长度，防止过大文件/脏字段进入后续处理链路；
 * - 将上传文件与业务元数据一起收敛为 `createBook` 的稳定输入，避免前端直接耦合存储实现。
 * =============================================================================
 */
import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createBook } from "@/server/modules/books/createBook";
import { listBooks } from "@/server/modules/books/listBooks";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { ERROR_CODES } from "@/types/api";
import type { BookLibraryListItem, CreateBookResponseData } from "@/types/book";

/**
 * 单本导入文件大小上限（单位：字节）。
 * 50 * 1024 * 1024 = 50MB。
 */
const MAX_BOOK_FILE_SIZE = 50 * 1024 * 1024;

/**
 * 可选短文本字段标准化规则。
 * - 输入类型：unknown（来自 FormData）。
 * - 输出类型：`string | undefined`（空白值统一归一为 undefined）。
 * - 约束：最大 200 字符。
 */
const optionalTextField = z.preprocess((value) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : undefined;
}, z.string().max(200).optional());

/**
 * 可选长文本字段标准化规则。
 * - 输入类型：unknown（来自 FormData）。
 * - 输出类型：`string | undefined`。
 * - 约束：最大 5000 字符（简介字段上限）。
 */
const optionalLongTextField = z.preprocess((value) => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : undefined;
}, z.string().max(5000).optional());

/**
 * 创建书籍表单 Schema（`multipart/form-data`）。
 * 字段说明：
 * - `title: string | undefined` 书名（可空，后端可回退文件名/AI 识别值）。
 * - `author: string | undefined` 作者（可空）。
 * - `dynasty: string | undefined` 朝代（可空）。
 * - `description: string | undefined` 简介（可空，长文本）。
 * - `file: File` 上传文件（仅允许 `.txt`，且大小不超过 50MB）。
 */
const createBookFormSchema = z.object({
  title     : optionalTextField,
  author    : optionalTextField,
  dynasty   : optionalTextField,
  bookTypeId: z.preprocess((value) => {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmedValue = value.trim();
    return trimmedValue ? trimmedValue : undefined;
  }, z.string().uuid().optional()),
  description: optionalLongTextField,
  file       : z.instanceof(File)
    .refine((file) => file.size > 0, "请上传书籍文件")
    .refine((file) => /\.txt$/i.test(file.name), "MVP 仅支持 .txt 文件导入")
    .refine((file) => file.size <= MAX_BOOK_FILE_SIZE, "文件大小不能超过 50MB")
});

/**
 * 功能：统一生成导入接口 400 响应。
 * 输入：
 * - `requestId: string` 请求追踪 ID。
 * - `startedAt: number` 请求起始毫秒时间戳。
 * - `detail: string` 校验失败详情。
 * 输出：`Response`（HTTP 400，符合统一 API 响应规范）。
 * 异常：无（纯组装响应）。
 * 副作用：无。
 */
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
 * 导入链路：
 * 1) `.txt` 上传并统一解码；
 * 2) 保存源文件到存储；
 * 3) 创建 Book；
 * 4) 同步切分章节并写入 `chapters`。
 */
export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    // 导入与解析入口属于运营权限，必须先做 admin 校验。
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const formData = await request.formData();
    const parsedResult = createBookFormSchema.safeParse({
      title      : formData.get("title"),
      author     : formData.get("author"),
      dynasty    : formData.get("dynasty"),
      bookTypeId : formData.get("bookTypeId"),
      description: formData.get("description"),
      file       : formData.get("file")
    });

    if (!parsedResult.success) {
      return badRequestJson(requestId, startedAt, parsedResult.error.issues[0]?.message ?? "请求参数不合法");
    }

    // 上传文件统一解码验证后，保留原始 Buffer 传给 createBook 存储，不落库文本。
    const fileBuffer = Buffer.from(await parsedResult.data.file.arrayBuffer());
    const createdBook = await createBook({
      title      : parsedResult.data.title,
      author     : parsedResult.data.author,
      dynasty    : parsedResult.data.dynasty,
      bookTypeId : parsedResult.data.bookTypeId,
      description: parsedResult.data.description,
      fileName   : parsedResult.data.file.name,
      fileMime   : parsedResult.data.file.type,
      fileContent: fileBuffer
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

/**
 * 功能：查询书库列表（viewer/admin 都可访问）。
 * 输入：无（从服务层读取完整书籍卡片数据）。
 * 输出：`BookLibraryListItem[]`。
 * 异常：服务层异常统一转换为标准错误响应。
 * 副作用：无（只读查询）。
 */
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
