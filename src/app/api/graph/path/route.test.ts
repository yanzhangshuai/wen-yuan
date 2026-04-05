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

const findPersonaPathMock = vi.fn();

vi.mock("@/server/modules/graph/findPersonaPath", () => {
  class PersonaNotFoundError extends Error {
    readonly personaId: string;

    constructor(personaId: string) {
      super(`Persona not found: ${personaId}`);
      this.personaId = personaId;
    }
  }

  return {
    findPersonaPath: findPersonaPathMock,
    PersonaNotFoundError
  };
});

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
describe("POST /api/graph/path", () => {
  afterEach(() => {
    findPersonaPathMock.mockReset();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns shortest path data", async () => {
    const payload = {
      bookId         : "9f2507a6-f363-4562-ad4d-7a6ecbf75e9e",
      sourcePersonaId: "6a6cb0bc-8a49-4122-ba49-d24a1002d2d8",
      targetPersonaId: "d7d8b685-fef8-4195-bbe7-b903c1d4e0e2"
    };

    findPersonaPathMock.mockResolvedValue({
      ...payload,
      found   : true,
      hopCount: 2,
      nodes   : [
        { id: payload.sourcePersonaId, name: "王冕" },
        { id: "70169163-7d0a-43b9-88f6-58d4ee26af4f", name: "周进" },
        { id: payload.targetPersonaId, name: "范进" }
      ],
      edges: [
        {
          id       : "rel-1",
          source   : payload.sourcePersonaId,
          target   : "70169163-7d0a-43b9-88f6-58d4ee26af4f",
          type     : "师生",
          weight   : 1,
          chapterId: "c1",
          chapterNo: 1
        },
        {
          id       : "rel-2",
          source   : "70169163-7d0a-43b9-88f6-58d4ee26af4f",
          target   : payload.targetPersonaId,
          type     : "同僚",
          weight   : 1,
          chapterId: "c2",
          chapterNo: 2
        }
      ]
    });

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/graph/path", {
      method : "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.code).toBe("GRAPH_PATH_SEARCHED");
    expect(findPersonaPathMock).toHaveBeenCalledWith(payload);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 for invalid body", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/graph/path", {
      method : "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        bookId         : "invalid",
        sourcePersonaId: "invalid",
        targetPersonaId: "invalid"
      })
    }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.code).toBe("COMMON_BAD_REQUEST");
    expect(findPersonaPathMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 404 for missing persona", async () => {
    const payload = {
      bookId         : "9f2507a6-f363-4562-ad4d-7a6ecbf75e9e",
      sourcePersonaId: "6a6cb0bc-8a49-4122-ba49-d24a1002d2d8",
      targetPersonaId: "d7d8b685-fef8-4195-bbe7-b903c1d4e0e2"
    };

    const { PersonaNotFoundError } = await import("@/server/modules/graph/findPersonaPath");
    findPersonaPathMock.mockRejectedValue(new PersonaNotFoundError(payload.targetPersonaId));

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/graph/path", {
      method : "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    }));

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.code).toBe("COMMON_NOT_FOUND");
  });
});
