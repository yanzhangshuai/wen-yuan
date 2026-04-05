/**
 * =============================================================================
 * 文件定位（Next.js Route Handler：图谱布局保存接口）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/graphs/[id]/layout/route.ts`
 *
 * 路由职责：
 * - 映射 `PATCH /api/graphs/:id/layout`；
 * - 允许前端把节点拖拽后的坐标批量回写到服务端。
 *
 * 业务场景：
 * - 用于“关系图谱可视化”页面的持久化布局；
 * - 这里的 `id` 业务上等价于书籍/图谱主键，是布局隔离边界。
 *
 * 设计原因：
 * - 坐标在接口层就做 finite 校验，避免 NaN/Infinity 入库破坏前端渲染；
 * - 批量写入减少高频拖拽时的请求次数，提高交互流畅性。
 * =============================================================================
 */
import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { BookNotFoundError } from "@/server/modules/books/errors";
import {
  updateGraphLayout,
  type GraphLayoutNodeInput,
  type UpdateGraphLayoutResult
} from "@/server/modules/graph/updateGraphLayout";
import { ERROR_CODES } from "@/types/api";

/**
 * 路由参数校验：图谱（书籍）ID。
 */
const graphRouteParamsSchema = z.object({
  id: z.string().uuid("图谱 ID 不合法")
});

/**
 * 单个节点布局坐标校验。
 * 新契约仅接受 `personaId`。
 */
const graphLayoutNodeSchema = z.object({
  personaId: z.string().uuid("节点人物 ID 不合法"),
  x        : z.number().finite("节点 X 坐标不合法"),
  y        : z.number().finite("节点 Y 坐标不合法")
});

/**
 * PATCH 请求体校验：至少提交 1 个节点坐标。
 */
const updateGraphLayoutBodySchema = z.object({
  nodes: z.array(graphLayoutNodeSchema).min(1, "至少需要一个节点坐标")
});

/**
 * Next.js 动态路由上下文。
 */
interface GraphRouteContext {
  /** 路由参数 Promise（由 App Router 注入）。 */
  params: Promise<{ id: string }>;
}

/**
 * 构造参数错误统一响应。
 */
function badRequestJson(requestId: string, startedAt: number, detail: string): Response {
  const meta = createApiMeta("/api/graphs/:id/layout", requestId, startedAt);
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
 * 构造图谱不存在统一响应。
 */
function notFoundJson(requestId: string, startedAt: number, graphId: string): Response {
  const meta = createApiMeta(`/api/graphs/${graphId}/layout`, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_NOT_FOUND,
      "图谱不存在",
      {
        type  : "NotFoundError",
        detail: `Book not found: ${graphId}`
      },
      meta
    ),
    404
  );
}

/**
 * 功能：保存图谱节点布局。
 * 输入：图谱 ID + 节点坐标数组。
 * 输出：统一 API 成功响应，`data` 为更新统计。
 * 异常：参数错误返回 400；图谱不存在返回 404；其余返回 500。
 * 副作用：要求管理员权限，批量更新人物 `visualConfig.position`。
 */
export async function PATCH(
  request: Request,
  context: GraphRouteContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/graphs/:id/layout";

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const params = await context.params;
    const parsedParams = graphRouteParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      return badRequestJson(
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const parsedBody = updateGraphLayoutBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const nodes: GraphLayoutNodeInput[] = parsedBody.data.nodes.map((node) => ({
      personaId: node.personaId,
      x        : node.x,
      y        : node.y
    }));

    const data = await updateGraphLayout({
      graphId: parsedParams.data.id,
      nodes
    });

    return okJson<UpdateGraphLayoutResult>({
      path   : `/api/graphs/${parsedParams.data.id}/layout`,
      requestId,
      startedAt,
      code   : "GRAPH_LAYOUT_UPDATED",
      message: "图谱布局已更新",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(requestId, startedAt, error.bookId);
    }

    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "图谱布局更新失败"
    });
  }
}
