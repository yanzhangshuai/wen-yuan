/**
 * =============================================================================
 * 文件定位（Next.js Route Handler：旧关系直写接口退役）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/relationships/[id]/route.ts`
 *
 * 路由语义：
 * - `PATCH /api/relationships/:id`：旧关系直写更新接口，T20 后仅返回退役提示；
 * - `DELETE /api/relationships/:id`：旧关系直写删除接口，T20 后仅返回退役提示。
 *
 * 业务职责：
 * - 阻断 legacy relationship edit stack 对最终图谱的直接写入；
 * - 将管理员统一引导到新的 evidence-first 审核工作台完成关系修订。
 *
 * 关键约束：
 * - 鉴权必须先执行，再输出退役提示；
 * - 不允许再透传到旧 `updateRelationship` / `deleteRelationship` 服务。
 * =============================================================================
 */

import { randomUUID } from "node:crypto";

import { failJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { retiredLegacyReviewStackJson } from "@/app/api/admin/_shared/retired-legacy-review-stack";

interface RelationshipRouteContext {
  params: Promise<{ id: string }>;
}

async function retireLegacyRelationshipRoute(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/relationships/:id";

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    return retiredLegacyReviewStackJson({
      path,
      requestId,
      startedAt,
      replacementPath: "/admin/review"
    });
  } catch (error) {
    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : "LEGACY_RELATIONSHIP_ROUTE_RETIRED_FAILED",
      fallbackMessage: "旧关系直写接口退役失败"
    });
  }
}

export async function PATCH(
  request: Request,
  _context: RelationshipRouteContext
): Promise<Response> {
  return retireLegacyRelationshipRoute(request);
}

export async function DELETE(
  request: Request,
  _context: RelationshipRouteContext
): Promise<Response> {
  return retireLegacyRelationshipRoute(request);
}
