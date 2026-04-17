/**
 * =============================================================================
 * 文件定位：`src/app/api/admin/books/[id]/candidates/route.ts`
 * -----------------------------------------------------------------------------
 * Next.js 管理端路由处理器：列出书籍的 CANDIDATE 人物（只读）。
 *
 * 路由语义：
 * - `GET /api/admin/books/:id/candidates` — 分页返回某书的候选人物（`status='CANDIDATE'`）。
 *
 * 设计说明：
 * - 审核中心 T07 负责 alias 合并、promote/demote 等写操作；本接口只读，
 *   供 `/admin/books/:id/candidates` 页面展示 §0-11 管线 KPI；
 * - 排序固定为 `mentionCount desc`：规模最大的候选优先进入人工视野；
 * - 过滤条件：`canonicalName` 子串（忽略大小写），覆盖中英文常见用法。
 *
 * 安全边界：
 * - 仅 ADMIN 可访问：候选桶规模暴露管线质量，不能给 viewer。
 * =============================================================================
 */

import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { prisma } from "@/server/db/prisma";
import { failJson, okJson, parsePagination } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, notFoundJson } from "../../../model-strategy/_shared";
import { adminBookRouteParamsSchema } from "../_shared";

/**
 * 候选人物列表项。
 *
 * 字段说明：
 * - `aliasesPreview` 只携带前 3 个别名 + 是否还有更多，前端可以直接渲染 "A, B, C 等"。
 */
export interface CandidatePersonaListItem {
  id                     : string;
  canonicalName          : string;
  mentionCount           : number;
  distinctChapters       : number;
  effectiveBiographyCount: number;
  aliasesPreview         : string[];
  aliasesTotal           : number;
  createdAt              : string;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/admin/books/[id]/candidates";

  try {
    // ADMIN 鉴权：候选桶暴露管线质量数据，viewer 禁止访问。
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = adminBookRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        routePath,
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }
    const bookId = parsedParams.data.id;

    const url = new URL(request.url);
    const { page, pageSize } = parsePagination(url.searchParams);
    // `q` 子串搜索：仅支持精确含子串匹配，不做分词，管理员输入"诸葛"即可定位。
    const q = url.searchParams.get("q")?.trim() || undefined;

    // 书籍存在性校验：让 404 语义统一从服务边界抛出，避免列表接口返回"空数组"歧义。
    const book = await prisma.book.findFirst({
      where : { id: bookId, deletedAt: null },
      select: { id: true }
    });
    if (!book) {
      throw new BookNotFoundError(bookId);
    }

    const where = {
      deletedAt: null,
      status   : "CANDIDATE",
      // Persona 本身没有 bookId，通过 profiles 聚合筛选本书下的候选角色。
      profiles : {
        some: { bookId, deletedAt: null }
      },
      ...(q
        ? { name: { contains: q, mode: "insensitive" as const } }
        : {})
    };

    const [rows, total] = await Promise.all([
      prisma.persona.findMany({
        where,
        // mentionCount desc：让规模最大的候选优先进入人工视野，符合 §0-11 管线回炉门槛判定。
        orderBy: [{ mentionCount: "desc" }, { createdAt: "desc" }],
        skip   : (page - 1) * pageSize,
        take   : pageSize,
        select : {
          id                     : true,
          name                   : true,
          mentionCount           : true,
          distinctChapters       : true,
          effectiveBiographyCount: true,
          createdAt              : true,
          // 预览前 3 个别名（仅取当前书籍下的 alias mapping，避免跨书干扰）。
          aliasMappings          : {
            where : { bookId },
            take  : 3,
            select: { alias: true }
          },
          _count: {
            select: {
              aliasMappings: { where: { bookId } }
            }
          }
        }
      }),
      prisma.persona.count({ where })
    ]);

    const data: CandidatePersonaListItem[] = rows.map((row) => ({
      id                     : row.id,
      canonicalName          : row.name,
      mentionCount           : row.mentionCount,
      distinctChapters       : row.distinctChapters,
      effectiveBiographyCount: row.effectiveBiographyCount,
      aliasesPreview         : row.aliasMappings.map((a) => a.alias),
      aliasesTotal           : row._count.aliasMappings,
      createdAt              : row.createdAt.toISOString()
    }));

    return okJson({
      path      : `/api/admin/books/${bookId}/candidates`,
      requestId,
      startedAt,
      code      : "ADMIN_BOOK_CANDIDATES_FETCHED",
      message   : "候选人物列表获取成功",
      data,
      pagination: { page, pageSize, total }
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(
        `/api/admin/books/${error.bookId}/candidates`,
        requestId,
        startedAt,
        "书籍不存在",
        error.message
      );
    }

    return failJson({
      path           : routePath,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "候选人物列表获取失败"
    });
  }
}
