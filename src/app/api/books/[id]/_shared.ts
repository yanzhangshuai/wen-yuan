import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { ERROR_CODES } from "@/types/api";

/**
 * ============================================================================
 * 文件定位：`src/app/api/books/[id]/_shared.ts`
 * ----------------------------------------------------------------------------
 * 这是 `/api/books/:id/*` 路由簇的“参数解析与错误响应共享模块”。
 *
 * 在 Next.js 中的角色：
 * - 本文件本身不是 `route.ts`，不会被直接映射为 HTTP 接口；
 * - 它被同级多个 `route.ts` 引用，属于“接口层的公共工具”；
 * - 运行时位于服务端（Node.js），用于每次 API 请求进入后第一时间做路由参数校验。
 *
 * 核心业务职责：
 * - 统一校验 `bookId`（UUID 格式）；
 * - 统一返回“参数错误”响应结构，确保前端可以稳定消费错误码与错误详情；
 * - 降低每个路由文件重复写校验逻辑带来的误改风险。
 *
 * 上下游关系：
 * - 上游：Next.js Route Handler 注入的 `context.params`（动态路由参数）；
 * - 下游：`/api/books/:id/status|jobs|personas|...` 等具体接口处理逻辑。
 *
 * 维护注意：
 * - 这里的错误响应结构属于跨端契约，不建议随意改字段名；
 * - UUID 校验是业务防御边界，不是“可有可无”的格式美化。
 * ============================================================================
 */

/**
 * 书籍路由参数校验 Schema（对应 `/api/books/:id` 中的 `:id`）。
 *
 * 业务语义说明：
 * - `id`：书籍主键，必须是 UUID。
 * - 这里强制 UUID 的原因是尽早拦截非法请求，避免把脏数据传入后续模块（数据库/服务层）。
 */
export const bookRouteParamsSchema = z.object({
  /**
   * 书籍主键 UUID。
   * 这是接口路由层的输入字段，来源于 URL 路由参数，不是请求体字段。
   */
  id: z.string().uuid("书籍 ID 不合法")
});

/**
 * Next.js Route Handler 动态路由上下文类型。
 *
 * 为什么是 `Promise<{ id: string }>`：
 * - 在 App Router 的 Route Handler 中，`context.params` 允许异步获取；
 * - 这里显式声明 Promise 形态，避免调用方忘记 `await` 导致类型与运行时不一致。
 */
export interface BookRouteParamsContext {
  /**
   * 动态参数对象。
   * - 来源：Next.js 路由系统自动注入；
   * - 含义：当前请求命中的 URL 中 `:id` 段；
   * - 注意：这里只保证“有字符串”，是否是合法 UUID 由 schema 决定。
   */
  params: Promise<{ id: string }>;
}

/**
 * 统一解析并校验 `bookId` 路由参数。
 *
 * 业务流程（按步骤）：
 * 1. 从 Next.js `context.params` 读取原始路由参数；
 * 2. 使用 Zod 做输入约束校验（当前仅校验 UUID）；
 * 3. 若失败，直接构建标准化 400 响应，让调用方“提前返回”；
 * 4. 若成功，返回规范化后的 `bookId`，交给后续业务模块使用。
 *
 * 这样设计的原因：
 * - 让每个路由都复用同一套校验与错误格式，减少重复代码；
 * - 路由层尽早失败（Fail Fast），避免无效请求进入更深层逻辑；
 * - 返回联合类型 `{ bookId } | { response }`，调用方只需判断是否有 `response` 即可。
 *
 * @param context Next.js Route Handler 上下文（包含动态路由参数）。
 * @param path 当前接口模板路径，用于构造统一错误元信息（便于日志检索）。
 * @param requestId 请求追踪 ID，用于串联日志与前后端排障。
 * @param startedAt 请求开始时间戳，用于计算接口耗时。
 * @returns
 * - 成功：`{ bookId }`，可直接用于数据库/服务查询；
 * - 失败：`{ response }`，已是可直接 `return` 的 HTTP 400 响应。
 */
export async function parseBookIdFromRoute(
  context: BookRouteParamsContext,
  path: string,
  requestId: string,
  startedAt: number
): Promise<{ bookId: string } | { response: Response }> {
  // 第一步：解析 Next.js 提供的动态路由参数。
  const params = await context.params;

  // 第二步：做结构与格式校验，使用 safeParse 避免抛异常打断主流程。
  const parsedResult = bookRouteParamsSchema.safeParse(params);

  if (!parsedResult.success) {
    // 分支原因：
    // - 路由参数不合法时，应返回 400（客户端输入问题），而不是 500（服务端故障）。
    // - 统一错误结构可让前端 toast / 表单错误处理逻辑复用。
    const meta = createApiMeta(path, requestId, startedAt);
    return {
      response: toNextJson(
        errorResponse(
          ERROR_CODES.COMMON_BAD_REQUEST,
          "请求参数不合法",
          {
            type  : "ValidationError",
            detail: parsedResult.error.issues[0]?.message ?? "请求参数不合法"
          },
          meta
        ),
        400
      )
    };
  }

  // 成功分支：返回规范化后的 bookId，供路由继续执行业务处理。
  return {
    bookId: parsedResult.data.id
  };
}
