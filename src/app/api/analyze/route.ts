import { createApiMeta, errorResponse, successResponse, toNextJson } from "@/server/http/api-response";
import { chapterAnalysisService } from "@/server/modules/analysis/services/ChapterAnalysisService";
import type { ApiResponse } from "@/types/api";

/**
 * 功能：提供章节分析 HTTP 接口（POST /api/analyze）。
 * 输入：JSON 请求体 { chapterId: string }。
 * 输出：JSON 响应（成功返回 result，失败返回 error）。
 * 异常：函数内部捕获异常并转换为 500 响应，不向外抛出。
 * 副作用：触发章节分析流程并写入数据库。
 */
export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = crypto.randomUUID();
  const getMeta = () => createApiMeta("/api/analyze", requestId, startedAt);

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return toNextJson(
      errorResponse(
        "BAD_JSON",
        "请求体不是合法 JSON",
        { type: "ValidationError", detail: "Request body must be valid JSON" },
        getMeta()
      ),
      400
    );
  }

  try {
    // 运行时校验，防止非法请求体导致服务层异常。
    const chapterId =
      typeof (body as { chapterId?: unknown })?.chapterId === "string"
        ? (body as { chapterId: string }).chapterId
        : undefined;

    if (!chapterId) {
      return toNextJson(
        errorResponse(
          "MISSING_CHAPTER_ID",
          "缺少必填字段 chapterId",
          { type: "ValidationError", detail: "chapterId is required" },
          getMeta()
        ),
        400
      );
    }

    const result = await chapterAnalysisService.analyzeChapter(chapterId);
    const payload: ApiResponse<typeof result> = successResponse(
      "ANALYZE_CHAPTER_OK",
      "章节分析成功",
      result,
      getMeta()
    );

    return toNextJson(payload, 200);
  } catch (error) {
    // 统一错误响应，避免暴露内部堆栈细节。
    const message = error instanceof Error ? error.message : "Unknown analyze error";
    return toNextJson(
      errorResponse(
        "ANALYZE_CHAPTER_FAILED",
        "章节分析失败",
        { type: "InternalError", detail: message },
        getMeta()
      ),
      500
    );
  }
}
