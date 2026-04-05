/**
 * =============================================================================
 * 文件定位（Next.js Route Handler：启动书籍分析任务）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/books/[id]/analyze/route.ts`
 *
 * 框架角色：
 * - 该文件映射 `POST /api/books/:id/analyze`；
 * - 是服务端接口层，不参与 React 渲染；
 * - 负责把“管理端触发解析”请求转成领域层可执行命令。
 *
 * 业务职责：
 * 1) 解析并校验分析范围（全书/区间/章节列表）与覆盖策略；
 * 2) 调用 `startBookAnalysis` 创建分析任务；
 * 3) 在请求内尝试触发作业执行（失败不影响任务已创建结果，属于异步容错设计）。
 *
 * 设计意图：
 * - 将“任务创建”与“任务实际执行”解耦，优先保证请求快速成功返回；
 * - 通过明确错误类型映射，让前端可区分参数错误、书籍不存在、范围冲突等业务异常。
 * =============================================================================
 */
import { randomUUID } from "node:crypto";

import { z } from "zod";

import { parseBookIdFromRoute, type BookRouteParamsContext } from "@/app/api/books/[id]/_shared";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { strategyStagesSchema } from "@/server/modules/analysis/dto/modelStrategy";
import {
  ANALYSIS_SCOPE_VALUES,
  ANALYSIS_OVERRIDE_STRATEGY_VALUES,
  AnalysisScopeInvalidError,
  BookNotFoundError,
  startBookAnalysis,
  type StartBookAnalysisResult
} from "@/server/modules/books/startBookAnalysis";
import { runAnalysisJobById } from "@/server/modules/analysis/jobs/runAnalysisJob";
import { ERROR_CODES } from "@/types/api";

const modelStrategyInputSchema = z.union([
  z.object({
    stages: strategyStagesSchema
  }).strict(),
  strategyStagesSchema.strict()
]);

function normalizeModelStrategyInput(
  input: z.infer<typeof modelStrategyInputSchema> | null | undefined
) {
  if (!input) {
    return undefined;
  }

  return "stages" in input ? input.stages : input;
}

/**
 * 功能：启动书籍解析任务请求体校验。
 * 输入字段：
 * - `modelStrategy` 任务级阶段模型策略，可传 `{ stages: ... }` 或直接传阶段映射对象。
 * - `scope: "FULL_BOOK" | "CHAPTER_RANGE" | undefined` 解析范围。
 * - `chapterStart/chapterEnd: number | null | undefined` 当 `scope=CHAPTER_RANGE` 时生效。
 * - `overrideStrategy` 冲突覆盖策略（是否覆盖旧草稿/保留版本）。
 * - `keepHistory: boolean | undefined` 是否保留历史任务记录。
 * 输出：可直接传给 `startBookAnalysis` 的强类型 payload。
 * 异常：无（校验失败由路由返回 400）。
 * 副作用：无。
 */
const startAnalysisBodySchema = z.object({
  // 可选任务级阶段模型策略；为空时走 BOOK/GLOBAL/SYSTEM_DEFAULT 解析链路。
  modelStrategy   : modelStrategyInputSchema.nullable().optional(),
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
 * 功能：创建一本书的解析任务（全书、章节范围或指定章节）。
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

    const normalizedModelStrategy = normalizeModelStrategyInput(parsedBody.data.modelStrategy);
    const data = await startBookAnalysis(parsedRoute.bookId, {
      ...parsedBody.data,
      modelStrategy: normalizedModelStrategy
    });

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

    if (error instanceof AnalysisScopeInvalidError) {
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
