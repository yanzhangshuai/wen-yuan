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

import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const updateGraphLayoutMock = vi.fn();

vi.mock("@/server/modules/graph/updateGraphLayout", () => ({
  updateGraphLayout: updateGraphLayoutMock
}));

vi.mock("@/server/modules/books/errors", () => {
  class BookNotFoundError extends Error {
    readonly bookId: string;

    constructor(bookId: string) {
      super(`Book not found: ${bookId}`);
      this.bookId = bookId;
    }
  }

  return { BookNotFoundError };
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("PATCH /api/graphs/:id/layout", () => {
  afterEach(() => {
    updateGraphLayoutMock.mockReset();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("updates graph layout when admin requests", async () => {
    const graphId = "2e577160-fbc5-4ca3-8bf6-58b2ae7ab9c7";
    updateGraphLayoutMock.mockResolvedValue({
      graphId,
      savedCount       : 2,
      createdCount     : 1,
      updatedCount     : 1,
      ignoredPersonaIds: [],
      updatedAt        : "2026-03-25T00:00:00.000Z"
    });
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/graphs/${graphId}/layout`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        nodes: [
          { personaId: "4d6f2901-a3c5-4f58-bf09-bf0eb27e20f2", x: 120, y: 240 },
          { personaId: "45236d8a-a87e-4611-ad7c-dcb75887243f", x: 60, y: 90 }
        ]
      })
    }), { params: Promise.resolve({ id: graphId }) });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.code).toBe("GRAPH_LAYOUT_UPDATED");
    expect(updateGraphLayoutMock).toHaveBeenCalledWith({
      graphId,
      nodes: [
        { personaId: "4d6f2901-a3c5-4f58-bf09-bf0eb27e20f2", x: 120, y: 240 },
        { personaId: "45236d8a-a87e-4611-ad7c-dcb75887243f", x: 60, y: 90 }
      ]
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 403 when viewer requests", async () => {
    const graphId = "2e577160-fbc5-4ca3-8bf6-58b2ae7ab9c7";
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/graphs/${graphId}/layout`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.VIEWER
      },
      body: JSON.stringify({
        nodes: [
          { personaId: "4d6f2901-a3c5-4f58-bf09-bf0eb27e20f2", x: 120, y: 240 }
        ]
      })
    }), { params: Promise.resolve({ id: graphId }) });

    expect(response.status).toBe(403);
    expect(updateGraphLayoutMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 for invalid payload", async () => {
    const graphId = "2e577160-fbc5-4ca3-8bf6-58b2ae7ab9c7";
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/graphs/${graphId}/layout`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({ nodes: [] })
    }), { params: Promise.resolve({ id: graphId }) });

    expect(response.status).toBe(400);
    expect(updateGraphLayoutMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 404 when graph is missing", async () => {
    const graphId = "2e577160-fbc5-4ca3-8bf6-58b2ae7ab9c7";
    const { BookNotFoundError } = await import("@/server/modules/books/errors");
    updateGraphLayoutMock.mockRejectedValue(new BookNotFoundError(graphId));
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/graphs/${graphId}/layout`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        nodes: [
          { personaId: "4d6f2901-a3c5-4f58-bf09-bf0eb27e20f2", x: 120, y: 240 }
        ]
      })
    }), { params: Promise.resolve({ id: graphId }) });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });
});
