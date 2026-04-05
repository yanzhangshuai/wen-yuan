import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { failJson, okJson } from "@/server/http/route-utils";
import { BookNotFoundError } from "@/server/modules/books/errors";
import {
  ChapterNotFoundError,
  ParaIndexOutOfRangeError,
  readChapter,
  type ChapterReadSnapshot
} from "@/server/modules/books/readChapter";
import { ERROR_CODES } from "@/types/api";

/**
 * ============================================================================
 * 文件定位：`src/app/api/books/[id]/chapters/[chapterId]/read/route.ts`
 * ----------------------------------------------------------------------------
 * 这是 Next.js App Router 的章节阅读接口，映射：
 * `GET /api/books/:id/chapters/:chapterId/read`
 *
 * 框架语义：
 * - `app/api/<...>/route.ts` 目录约定会自动注册为 HTTP 路由；
 * - 动态参数目录 `[id]/[chapterId]` 会注入到 `context.params`；
 * - Route Handler 运行在服务端，不是 React 组件。
 *
 * 业务职责：
 * - 返回章节原文段落；
 * - 支持 `paraIndex`（段落定位）与 `highlight`（关键词命中标记）；
 * - 对章节不存在、段落越界做明确错误映射。
 *
 * 上下游关系：
 * - 上游：图谱人物详情中的证据跳转、阅读侧栏；
 * - 下游：`readChapter` 服务（负责正文切段与高亮标记）。
 * ============================================================================
 */

/** 路由参数校验。 */
const chapterReadRouteParamsSchema = z.object({
  /** 书籍 ID（UUID）。 */
  id       : z.string().uuid("书籍 ID 不合法"),
  /** 章节 ID（UUID）。 */
  chapterId: z.string().uuid("章节 ID 不合法")
});

/** 查询参数校验。 */
const chapterReadQuerySchema = z.object({
  /** 高亮定位的段落索引（从 0 开始，可选）。 */
  paraIndex: z.coerce.number().int().nonnegative("段落索引不合法").optional(),
  /** 关键字高亮文本（可选）。 */
  highlight: z.string().trim().min(1, "高亮关键词不能为空").optional()
});

/** 章节阅读路由上下文（Next.js 动态参数容器）。 */
interface ChapterReadRouteContext {
  /** 动态参数 Promise，resolve 后包含 `{ id, chapterId }`。 */
  params: Promise<{ id: string; chapterId: string }>;
}

/**
 * 功能：构造章节阅读“资源不存在”错误响应。
 * 输入：requestId、startedAt、bookId、chapterId。
 * 输出：HTTP 404 响应。
 * 异常：无。
 * 副作用：无。
 */
function notFoundJson(
  requestId: string,
  startedAt: number,
  bookId: string,
  chapterId: string
) {
  // 这里使用真实 bookId/chapterId 组 path，便于后续根据日志定位具体失败实体。
  const meta = createApiMeta(`/api/books/${bookId}/chapters/${chapterId}/read`, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_NOT_FOUND,
      "资源不存在",
      {
        type  : "NotFoundError",
        detail: `bookId=${bookId}, chapterId=${chapterId}`
      },
      meta
    ),
    404
  );
}

/**
 * 功能：构造章节阅读“请求参数不合法”错误响应。
 * 输入：requestId、startedAt、bookId、chapterId、错误详情。
 * 输出：HTTP 400 响应。
 * 异常：无。
 * 副作用：无。
 */
function badRequestJson(
  requestId: string,
  startedAt: number,
  bookId: string,
  chapterId: string,
  detail: string
) {
  // 参数错误也记录完整 meta，便于统计前端输入异常来源。
  const meta = createApiMeta(`/api/books/${bookId}/chapters/${chapterId}/read`, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_BAD_REQUEST,
      "请求参数不合法",
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
 * GET `/api/books/:id/chapters/:chapterId/read`
 * 功能：读取章节原文并支持“按段定位 + 关键字高亮”。
 * 入参：
 * - 路由参数：`id`（书籍 UUID）、`chapterId`（章节 UUID）；
 * - 查询参数：`paraIndex`（可选）、`highlight`（可选）。
 * 返回：`ChapterReadSnapshot` 标准成功响应。
 */
export async function GET(
  request: Request,
  context: ChapterReadRouteContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  // 模板 path 用于 failJson 场景（避免泄露具体 ID，同步规范化日志维度）。
  const path = "/api/books/:id/chapters/:chapterId/read";

  try {
    // Step 1) 读取并校验动态参数。
    const params = await context.params;
    const parsedParams = chapterReadRouteParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      return badRequestJson(
        requestId,
        startedAt,
        params.id ?? ":id",
        params.chapterId ?? ":chapterId",
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    // Step 2) 解析查询参数（段落定位 + 关键字高亮）。
    const url = new URL(request.url);
    const parsedQuery = chapterReadQuerySchema.safeParse({
      paraIndex: url.searchParams.get("paraIndex") ?? undefined,
      highlight: url.searchParams.get("highlight") ?? undefined
    });
    if (!parsedQuery.success) {
      return badRequestJson(
        requestId,
        startedAt,
        parsedParams.data.id,
        parsedParams.data.chapterId,
        parsedQuery.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    // Step 3) 调用服务层读取章节并执行高亮命中计算。
    const data = await readChapter({
      bookId   : parsedParams.data.id,
      chapterId: parsedParams.data.chapterId,
      paraIndex: parsedQuery.data.paraIndex,
      highlight: parsedQuery.data.highlight
    });

    // Step 4) 返回标准成功响应。
    return okJson<ChapterReadSnapshot>({
      path   : `/api/books/${parsedParams.data.id}/chapters/${parsedParams.data.chapterId}/read`,
      requestId,
      startedAt,
      code   : "BOOK_CHAPTER_READ",
      message: "原文读取成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      // 书不存在时 chapterId 无法确定，使用占位符只表示“路径段位置”。
      return notFoundJson(requestId, startedAt, error.bookId, ":chapterId");
    }

    if (error instanceof ChapterNotFoundError) {
      // 章节不属于该书或章节 ID 不存在，统一映射为 404。
      return notFoundJson(requestId, startedAt, error.bookId, error.chapterId);
    }

    if (error instanceof ParaIndexOutOfRangeError) {
      // 段落越界是请求参数错误，业务上应返回 400 而不是 404/500。
      return badRequestJson(
        requestId,
        startedAt,
        ":id",
        ":chapterId",
        `段落索引越界，允许范围 0-${error.maxIndex}`
      );
    }

    // 兜底未知异常，统一 500。
    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "原文读取失败"
    });
  }
}
