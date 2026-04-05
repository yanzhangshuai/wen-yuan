/**
 * 文件定位（服务端 HTTP 工具单测）：
 * - 覆盖 server/http 层通用能力，位于业务模块与 Next.js Route Handler 之间的基础设施层。
 * - 该层不直接承载业务页面，但会影响所有 API 路由的输入解析与响应格式。
 *
 * 业务职责：
 * - 保证请求读取、参数处理、统一响应封装、异常映射等通用规则稳定。
 * - 降低各接口重复实现风险，确保全局 API 行为一致。
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiMeta, errorResponse, successResponse, toNextJson } from "@/server/http/api-response";

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("api-response", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("creates api meta with request id/path and computed duration", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_120);

    const meta = createApiMeta("/api/books", "req-1", 1_700_000_000_000);

    expect(meta.requestId).toBe("req-1");
    expect(meta.path).toBe("/api/books");
    expect(meta.durationMs).toBe(120);
    expect(Number.isNaN(Date.parse(meta.timestamp))).toBe(false);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns success envelope payload", () => {
    const payload = successResponse(
      "BOOK_CREATED",
      "created",
      { id: "book-1" },
      {
        requestId : "req-2",
        timestamp : "2026-03-27T00:00:00.000Z",
        path      : "/api/books",
        durationMs: 8
      }
    );

    expect(payload).toEqual({
      success: true,
      code   : "BOOK_CREATED",
      message: "created",
      data   : { id: "book-1" },
      meta   : {
        requestId : "req-2",
        timestamp : "2026-03-27T00:00:00.000Z",
        path      : "/api/books",
        durationMs: 8
      }
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns error envelope payload", () => {
    const payload = errorResponse(
      "COMMON_BAD_REQUEST",
      "invalid",
      {
        type  : "ValidationError",
        detail: "title is required"
      },
      {
        requestId : "req-3",
        timestamp : "2026-03-27T00:00:00.000Z",
        path      : "/api/books",
        durationMs: 3
      }
    );

    expect(payload).toEqual({
      success: false,
      code   : "COMMON_BAD_REQUEST",
      message: "invalid",
      error  : {
        type  : "ValidationError",
        detail: "title is required"
      },
      meta: {
        requestId : "req-3",
        timestamp : "2026-03-27T00:00:00.000Z",
        path      : "/api/books",
        durationMs: 3
      }
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("serializes success payload to NextResponse JSON with status", async () => {
    const response = toNextJson(successResponse(
      "OK",
      "done",
      { ok: true },
      {
        requestId : "req-4",
        timestamp : "2026-03-27T00:00:00.000Z",
        path      : "/api/ping",
        durationMs: 1
      }
    ), 201);

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toContain("application/json");

    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("OK");
    expect(payload.meta.requestId).toBe("req-4");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("serializes error payload to NextResponse JSON with status", async () => {
    const response = toNextJson(errorResponse(
      "COMMON_INTERNAL_ERROR",
      "failed",
      {
        type  : "InternalError",
        detail: "boom"
      },
      {
        requestId : "req-5",
        timestamp : "2026-03-27T00:00:00.000Z",
        path      : "/api/ping",
        durationMs: 9
      }
    ), 500);

    expect(response.status).toBe(500);

    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
    expect(payload.error.type).toBe("InternalError");
  });
});
