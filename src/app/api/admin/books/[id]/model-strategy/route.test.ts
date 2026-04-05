/**
 * 文件定位（Next.js Route Handler 单测）：
 * - 本文件对应 app/ 目录下的 route.ts（或其动态路由变体）测试，验证接口层契约是否稳定。
 * - 在 Next.js 中，route.ts 由文件系统路由自动注册为 HTTP 接口；本测试通过直接调用导出的 HTTP 方法函数复现服务端执行语义。
 *
 * 业务职责：
 * - 约束请求参数校验、鉴权分支、服务层调用参数、错误码映射、统一响应包结构。
 * - 保护上下游协作边界：上游是浏览器/管理端请求，下游是各领域 service 与数据访问层。
 *
 * 维护注意：
 * - 这是接口契约测试，断言字段和状态码属于外部约定，不能随意改动。
 * - 若未来调整路由/错误码，请同步更新前端调用方与文档，否则会造成线上联调回归。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const getBookStrategyMock = vi.fn<(bookId: string) => Promise<unknown>>();
const saveBookStrategyMock = vi.fn<(bookId: string, stages: unknown) => Promise<unknown>>();

class BookNotFoundError extends Error {
  readonly bookId: string;

  constructor(bookId: string) {
    super(`Book not found: ${bookId}`);
    this.bookId = bookId;
  }
}

class ModelStrategyValidationError extends Error {}

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/books/errors", () => ({
  BookNotFoundError
}));

vi.mock("@/server/modules/analysis/services/modelStrategyAdminService", () => ({
  getBookStrategy,
  saveBookStrategy,
  ModelStrategyValidationError
}));

function getBookStrategy(bookId: string): Promise<unknown> {
  return getBookStrategyMock(bookId);
}

function saveBookStrategy(bookId: string, stages: unknown): Promise<unknown> {
  return saveBookStrategyMock(bookId, stages);
}

/**
 * 被测对象：GET /api/admin/books/:id/model-strategy。
 * 测试目标：验证书籍策略读取接口的鉴权、参数校验和资源不存在映射。
 * 覆盖范围：success / auth failure / bad request / not found / internal error。
 */
// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("GET /api/admin/books/:id/model-strategy", () => {
  const validBookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";

  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    getBookStrategyMock.mockReset();
    saveBookStrategyMock.mockReset();
    vi.resetModules();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns book strategy with 200", async () => {
    // Arrange
    getBookStrategyMock.mockResolvedValue({
      id    : "43c93f04-1bf2-4211-a9ce-84133a6aa6e8",
      scope : "BOOK",
      bookId: validBookId,
      jobId : null,
      stages: {
        CHUNK_EXTRACTION: {
          modelId: "fbbf5c96-6fc7-44e6-bc97-c06cf9cd998c"
        }
      },
      createdAt: "2026-04-03T01:00:00.000Z",
      updatedAt: "2026-04-03T01:00:00.000Z"
    });
    const { GET } = await import("./route");

    // Act
    const response = await GET(
      new Request(`http://localhost/api/admin/books/${validBookId}/model-strategy`),
      { params: Promise.resolve({ id: validBookId }) }
    );

    // Assert
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_BOOK_MODEL_STRATEGY_FETCHED");
    expect(getBookStrategyMock).toHaveBeenCalledWith(validBookId);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 403 when auth guard fails", async () => {
    // Arrange
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { GET } = await import("./route");

    // Act
    const response = await GET(
      new Request(`http://localhost/api/admin/books/${validBookId}/model-strategy`),
      { params: Promise.resolve({ id: validBookId }) }
    );

    // Assert
    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(getBookStrategyMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 when route params are invalid", async () => {
    // Arrange
    const { GET } = await import("./route");

    // Act
    const response = await GET(
      new Request("http://localhost/api/admin/books/invalid/model-strategy"),
      { params: Promise.resolve({ id: "invalid" }) }
    );

    // Assert
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(payload.error?.detail).toBe("书籍 ID 不合法");
    expect(getBookStrategyMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 404 when book does not exist", async () => {
    // Arrange
    getBookStrategyMock.mockRejectedValue(new BookNotFoundError(validBookId));
    const { GET } = await import("./route");

    // Act
    const response = await GET(
      new Request(`http://localhost/api/admin/books/${validBookId}/model-strategy`),
      { params: Promise.resolve({ id: validBookId }) }
    );

    // Assert
    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_NOT_FOUND");
    expect(payload.message).toBe("书籍不存在");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 500 when service throws", async () => {
    // Arrange
    getBookStrategyMock.mockRejectedValue(new Error("db unavailable"));
    const { GET } = await import("./route");

    // Act
    const response = await GET(
      new Request(`http://localhost/api/admin/books/${validBookId}/model-strategy`),
      { params: Promise.resolve({ id: validBookId }) }
    );

    // Assert
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
    expect(payload.message).toBe("书籍模型策略获取失败");
  });
});

/**
 * 被测对象：PUT /api/admin/books/:id/model-strategy。
 * 测试目标：验证书籍策略写入接口在鉴权、参数/请求体校验与业务错误映射下的契约稳定性。
 * 覆盖范围：success / auth failure / bad request / validation error / not found / internal error。
 */
// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("PUT /api/admin/books/:id/model-strategy", () => {
  const validBookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
  const validModelId = "fbbf5c96-6fc7-44e6-bc97-c06cf9cd998c";

  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    getBookStrategyMock.mockReset();
    saveBookStrategyMock.mockReset();
    vi.resetModules();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("saves book strategy with 200", async () => {
    // Arrange
    saveBookStrategyMock.mockResolvedValue({
      id    : "43c93f04-1bf2-4211-a9ce-84133a6aa6e8",
      scope : "BOOK",
      bookId: validBookId,
      jobId : null,
      stages: {
        CHAPTER_VALIDATION: {
          modelId: validModelId
        }
      },
      createdAt: "2026-04-03T01:00:00.000Z",
      updatedAt: "2026-04-03T01:20:00.000Z"
    });
    const { PUT } = await import("./route");

    // Act
    const response = await PUT(
      new Request(`http://localhost/api/admin/books/${validBookId}/model-strategy`, {
        method : "PUT",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({
          stages: {
            CHAPTER_VALIDATION: {
              modelId: validModelId
            }
          }
        })
      }),
      { params: Promise.resolve({ id: validBookId }) }
    );

    // Assert
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_BOOK_MODEL_STRATEGY_SAVED");
    expect(saveBookStrategyMock).toHaveBeenCalledWith(validBookId, {
      CHAPTER_VALIDATION: {
        modelId: validModelId
      }
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 403 when auth guard fails", async () => {
    // Arrange
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { PUT } = await import("./route");

    // Act
    const response = await PUT(
      new Request(`http://localhost/api/admin/books/${validBookId}/model-strategy`, {
        method : "PUT",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({ stages: {} })
      }),
      { params: Promise.resolve({ id: validBookId }) }
    );

    // Assert
    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(saveBookStrategyMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 when route params are invalid", async () => {
    // Arrange
    const { PUT } = await import("./route");

    // Act
    const response = await PUT(
      new Request("http://localhost/api/admin/books/invalid/model-strategy", {
        method : "PUT",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({
          stages: {
            CHAPTER_VALIDATION: {
              modelId: validModelId
            }
          }
        })
      }),
      { params: Promise.resolve({ id: "invalid" }) }
    );

    // Assert
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(payload.error?.detail).toBe("书籍 ID 不合法");
    expect(saveBookStrategyMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 when request body is invalid", async () => {
    // Arrange
    const { PUT } = await import("./route");

    // Act
    const response = await PUT(
      new Request(`http://localhost/api/admin/books/${validBookId}/model-strategy`, {
        method : "PUT",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({
          stages: {
            CHAPTER_VALIDATION: {
              modelId: "invalid-model-id"
            }
          }
        })
      }),
      { params: Promise.resolve({ id: validBookId }) }
    );

    // Assert
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(saveBookStrategyMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 when model strategy validation fails", async () => {
    // Arrange
    saveBookStrategyMock.mockRejectedValue(new ModelStrategyValidationError("模型 DeepSeek 不存在或未启用"));
    const { PUT } = await import("./route");

    // Act
    const response = await PUT(
      new Request(`http://localhost/api/admin/books/${validBookId}/model-strategy`, {
        method : "PUT",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({
          stages: {
            FALLBACK: { modelId: validModelId }
          }
        })
      }),
      { params: Promise.resolve({ id: validBookId }) }
    );

    // Assert
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(payload.message).toBe("模型 DeepSeek 不存在或未启用");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 404 when book does not exist", async () => {
    // Arrange
    saveBookStrategyMock.mockRejectedValue(new BookNotFoundError(validBookId));
    const { PUT } = await import("./route");

    // Act
    const response = await PUT(
      new Request(`http://localhost/api/admin/books/${validBookId}/model-strategy`, {
        method : "PUT",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({
          stages: {
            FALLBACK: { modelId: validModelId }
          }
        })
      }),
      { params: Promise.resolve({ id: validBookId }) }
    );

    // Assert
    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_NOT_FOUND");
    expect(payload.message).toBe("书籍不存在");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 500 when service throws", async () => {
    // Arrange
    saveBookStrategyMock.mockRejectedValue(new Error("write failed"));
    const { PUT } = await import("./route");

    // Act
    const response = await PUT(
      new Request(`http://localhost/api/admin/books/${validBookId}/model-strategy`, {
        method : "PUT",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({
          stages: {
            FALLBACK: { modelId: validModelId }
          }
        })
      }),
      { params: Promise.resolve({ id: validBookId }) }
    );

    // Assert
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
    expect(payload.message).toBe("书籍模型策略保存失败");
  });
});
