/**
 * 文件定位（服务端 HTTP 工具单测）：
 * - 覆盖 server/http 层通用能力，位于业务模块与 Next.js Route Handler 之间的基础设施层。
 * - 该层不直接承载业务页面，但会影响所有 API 路由的输入解析与响应格式。
 *
 * 业务职责：
 * - 保证请求读取、参数处理、统一响应封装、异常映射等通用规则稳定。
 * - 降低各接口重复实现风险，确保全局 API 行为一致。
 */

import { describe, expect, it } from "vitest";

import { ERROR_CODES } from "@/types/api";

import { failJson, okJson, parsePagination } from "./route-utils";
import { AuthError } from "../modules/auth";

/**
 * 路由工具直接决定分页容错和 API 错误响应格式。
 * 这些测试用于锁定公共行为，避免后续重构影响所有 HTTP handler。
 */
// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("parsePagination", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("uses defaults when params are missing", () => {
    // Arrange
    const params = new URLSearchParams();

    // Act
    const pagination = parsePagination(params);

    // Assert
    expect(pagination).toEqual({ page: 1, pageSize: 20 });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("normalizes invalid values and floors decimals", () => {
    // Arrange
    const params = new URLSearchParams({
      page     : "-2",
      page_size: "0"
    });

    // Act
    const pagination = parsePagination(params);

    // Assert
    expect(pagination).toEqual({ page: 1, pageSize: 20 });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("clamps page_size to 100 and floors numbers", () => {
    // Arrange
    const params = new URLSearchParams({
      page     : "2.8",
      page_size: "200.9"
    });

    // Act
    const pagination = parsePagination(params);

    // Assert
    expect(pagination).toEqual({ page: 2, pageSize: 100 });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("falls back to defaults for non-finite values", () => {
    // Arrange
    const params = new URLSearchParams({
      page     : "Infinity",
      page_size: "NaN"
    });

    // Act
    const pagination = parsePagination(params);

    // Assert
    expect(pagination).toEqual({ page: 1, pageSize: 20 });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("parses whitespace-wrapped numbers", () => {
    const params = new URLSearchParams({
      page     : " 3 ",
      page_size: " 25 "
    });

    const pagination = parsePagination(params);

    expect(pagination).toEqual({ page: 3, pageSize: 25 });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("keeps page_size at boundary 100", () => {
    const params = new URLSearchParams({
      page     : "5",
      page_size: "100"
    });

    const pagination = parsePagination(params);

    expect(pagination).toEqual({ page: 5, pageSize: 100 });
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("okJson", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns success envelope with default 200 status", async () => {
    const response = okJson({
      path     : "/api/books",
      requestId: "req-ok-1",
      startedAt: Date.now() - 7,
      code     : "BOOKS_LISTED",
      message  : "ok",
      data     : { items: [1, 2, 3] }
    });

    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("BOOKS_LISTED");
    expect(payload.meta.requestId).toBe("req-ok-1");
    expect(payload.meta.path).toBe("/api/books");
    expect(typeof payload.meta.durationMs).toBe("number");
    expect(payload.meta.durationMs).toBeGreaterThanOrEqual(0);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("includes pagination metadata and custom status", async () => {
    const response = okJson({
      path      : "/api/books",
      requestId : "req-ok-2",
      startedAt : Date.now() - 4,
      code      : "BOOK_CREATED",
      message   : "created",
      status    : 201,
      data      : { id: "book-1" },
      pagination: {
        page    : 2,
        pageSize: 20,
        total   : 51
      }
    });

    expect(response.status).toBe(201);

    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.meta.pagination).toEqual({
      page    : 2,
      pageSize: 20,
      total   : 51
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("does not include pagination metadata when not provided", async () => {
    const response = okJson({
      path     : "/api/books",
      requestId: "req-ok-3",
      startedAt: Date.now() - 1,
      code     : "BOOKS_LISTED",
      message  : "ok",
      data     : { items: [] }
    });

    const payload = await response.json();
    expect(payload.meta.pagination).toBeUndefined();
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("failJson", () => {
  const commonArgs = {
    path     : "/api/analyze",
    requestId: "req-1",
    startedAt: Date.now() - 12
  };

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("maps unauthorized auth error to 401", async () => {
    // Act
    const response = failJson({
      ...commonArgs,
      error: new AuthError(ERROR_CODES.AUTH_UNAUTHORIZED, "missing")
    });

    // Assert
    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe(ERROR_CODES.AUTH_UNAUTHORIZED);
    expect(payload.error?.type).toBe("AuthError");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("maps non-auth errors to 500 with fallback code", async () => {
    // Act
    const response = failJson({
      ...commonArgs,
      error          : new Error("boom"),
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "internal"
    });

    // Assert
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe(ERROR_CODES.COMMON_INTERNAL_ERROR);
    expect(payload.message).toBe("internal");
    expect(payload.error?.detail).toBe("boom");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("maps forbidden auth error to 403", async () => {
    const response = failJson({
      ...commonArgs,
      error: new AuthError(ERROR_CODES.AUTH_FORBIDDEN, "forbidden")
    });

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.code).toBe(ERROR_CODES.AUTH_FORBIDDEN);
    expect(payload.error?.type).toBe("AuthError");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("uses default fallback values when not provided", async () => {
    const response = failJson({
      ...commonArgs,
      error: { reason: "bad" }
    });

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.code).toBe(ERROR_CODES.COMMON_INTERNAL_ERROR);
    expect(payload.message).toBe("服务异常");
    expect(payload.error?.detail).toBe("Unknown error");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("supports custom status override for non-auth errors", async () => {
    const response = failJson({
      ...commonArgs,
      error : new Error("bad gateway"),
      status: 502
    });

    expect(response.status).toBe(502);
    const payload = await response.json();
    expect(payload.code).toBe(ERROR_CODES.COMMON_INTERNAL_ERROR);
    expect(payload.error?.detail).toBe("bad gateway");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("keeps auth error status mapping even when custom status is provided", async () => {
    const response = failJson({
      ...commonArgs,
      error : new AuthError(ERROR_CODES.AUTH_UNAUTHORIZED, "unauthorized"),
      status: 418
    });

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.code).toBe(ERROR_CODES.AUTH_UNAUTHORIZED);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("falls back to unknown detail when error is a primitive", async () => {
    const response = failJson({
      ...commonArgs,
      error: "boom"
    });

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.error?.detail).toBe("Unknown error");
  });
});
