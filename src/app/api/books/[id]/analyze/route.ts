import { randomUUID } from "node:crypto";

import { z } from "zod";

import { parseBookIdFromRoute, type BookRouteParamsContext } from "@/app/api/books/[id]/_shared";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  ANALYSIS_SCOPE_VALUES,
  ANALYSIS_OVERRIDE_STRATEGY_VALUES,
  AnalysisModelDisabledError,
  AnalysisModelNotFoundError,
  AnalysisScopeInvalidError,
  BookNotFoundError,
  startBookAnalysis,
  type StartBookAnalysisResult
} from "@/server/modules/books/startBookAnalysis";
import { runAnalysisJobById } from "@/server/modules/analysis/jobs/runAnalysisJob";
import { ERROR_CODES } from "@/types/api";

/**
 * 功能：启动书籍解析任务请求体校验。
 * 输入字段：
 * - `aiModelId: string | null | undefined` 指定本次任务模型 ID（UUID）；为空时走默认模型。
 * - `scope: "FULL_BOOK" | "CHAPTER_RANGE" | undefined` 解析范围。
 * - `chapterStart/chapterEnd: number | null | undefined` 当 `scope=CHAPTER_RANGE` 时生效。
 * - `overrideStrategy` 冲突覆盖策略（是否覆盖旧草稿/保留版本）。
 * - `keepHistory: boolean | undefined` 是否保留历史任务记录。
 * 输出：可直接传给 `startBookAnalysis` 的强类型 payload。
 * 异常：无（校验失败由路由返回 400）。
 * 副作用：无。
 */
const startAnalysisBodySchema = z.object({
  // 可选模型 ID；为空表示使用系统默认模型。
  aiModelId       : z.string().uuid("模型 ID 不合法").nullable().optional(),
  // 任务执行范围；默认由服务层回落到 FULL_BOOK。
  scope           : z.enum(ANALYSIS_SCOPE_VALUES).optional(),
  // 范围任务起始章节号（仅 CHAPTER_RANGE 有效）。
  chapterStart    : z.number().int().positive().nullable().optional(),
  // 范围任务结束章节号（仅 CHAPTER_RANGE 有效）。
  chapterEnd      : z.number().int().positive().nullable().optional(),
  // 指定章节编号列表（仅 CHAPTER_LIST 有效）。
  chapterIndices  : z.array(z.number().int().min(0)).optional(),
  // 冲突覆盖策略：保留旧草稿/覆盖旧草稿/新建版本等。
  overrideStrategy: z.enum(ANALYSIS_OVERRIDE_STRATEGY_VALUES).optional(),
  // 是否保留历史任务记录（供审计与回溯）。
  keepHistory     : z.boolean().optional()
});

/**
 * 功能：构造“请求体不合法”的标准 400 响应。
 * 输入：requestId、startedAt、当前 path、错误详情文本。
 * 输出：符合统一 API Contract 的 NextResponse。
 * 异常：无。
 * 副作用：无。
 */
function badRequestJson(
  requestId: string,
  startedAt: number,
  path: string,
  detail: string
) {
  const meta = createApiMeta(path, requestId, startedAt);
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
 * 功能：构造“书籍不存在”的标准 404 响应。
 * 输入：requestId、startedAt、bookId。
 * 输出：符合统一 API Contract 的 NextResponse。
 * 异常：无。
 * 副作用：无。
 */
function notFoundJson(
  requestId: string,
  startedAt: number,
  bookId: string
) {
  const meta = createApiMeta(`/api/books/${bookId}/analyze`, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_NOT_FOUND,
      "书籍不存在",
      {
        type  : "NotFoundError",
        detail: `Book not found: ${bookId}`
      },
      meta
    ),
    404
  );
}

/**
 * 功能：创建一本书的解析任务（全书或章节范围）。
 * 输入：管理员身份 + 路由参数 `bookId` + 解析配置请求体。
 * 输出：202 Accepted，返回任务 ID、任务状态与书籍解析状态快照。
 * 异常：参数错误 400；书籍不存在 404；其余失败 500。
 * 副作用：写入 `analysis_jobs`、更新 `books` 解析状态字段。
 */
export async function POST(
  request: Request,
  context: BookRouteParamsContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/books/:id/analyze";

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const parsedRoute = await parseBookIdFromRoute(context, path, requestId, startedAt);
    if ("response" in parsedRoute) {
      return parsedRoute.response;
    }

    const parsedBody = startAnalysisBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        requestId,
        startedAt,
        path,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await startBookAnalysis(parsedRoute.bookId, parsedBody.data);

    /**
     * 调度策略说明：
     * - 当前版本为“入队后立即异步触发执行”（fire-and-forget）；
     * - 路由优先返回 202，避免长请求阻塞；
     * - 后台执行失败只记录日志，不影响“任务已创建”响应；
     * - 若进程重启中断，runNextAnalysisJob 可恢复 RUNNING/QUEUED 任务。
     */
    void runAnalysisJobById(data.jobId).catch((runnerError: unknown) => {
      console.error(
        "[analysis.runner] schedule.failed",
        JSON.stringify({
          jobId : data.jobId,
          bookId: parsedRoute.bookId,
          error : runnerError instanceof Error ? runnerError.message : String(runnerError)
        })
      );
    });

    return okJson<StartBookAnalysisResult>({
      path   : `/api/books/${parsedRoute.bookId}/analyze`,
      requestId,
      startedAt,
      code   : "BOOK_ANALYSIS_STARTED",
      message: "解析任务已创建",
      data,
      status : 202
    });
  } catch (error) {
    // 业务错误按可预期类别映射为 404/400，未识别错误统一走 500。
    if (error instanceof BookNotFoundError) {
      return notFoundJson(requestId, startedAt, error.bookId);
    }

    if (
      error instanceof AnalysisModelNotFoundError
      || error instanceof AnalysisModelDisabledError
      || error instanceof AnalysisScopeInvalidError
    ) {
      return badRequestJson(
        requestId,
        startedAt,
        path,
        error.message
      );
    }

    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "启动解析失败"
    });
  }
}
