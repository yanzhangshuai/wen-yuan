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

import { AppRole, BioCategory, ProcessingStatus, RecordSource } from "@/generated/prisma/enums";

const createPersonaBiographyMock = vi.fn();

vi.mock("@/server/modules/biography/createPersonaBiography", () => ({
  createPersonaBiography: createPersonaBiographyMock
}));

vi.mock("@/server/modules/personas/errors", () => {
  class PersonaNotFoundError extends Error {
    readonly personaId: string;

    constructor(personaId: string) {
      super(`Persona not found: ${personaId}`);
      this.personaId = personaId;
    }
  }

  return { PersonaNotFoundError };
});

vi.mock("@/server/modules/biography/errors", () => {
  class BiographyInputError extends Error {
    constructor(message: string) {
      super(message);
    }
  }

  return { BiographyInputError };
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("POST /api/personas/:id/biography", () => {
  afterEach(() => {
    createPersonaBiographyMock.mockReset();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("creates manual biography record", async () => {
    const personaId = "deb2ea4c-e758-4ea8-b40b-5e7e4376e12b";
    const chapterId = "b53fc2ca-6f86-4cd6-ac3d-694f402e570e";
    createPersonaBiographyMock.mockResolvedValue({
      id          : "biography-1",
      personaId,
      chapterId,
      chapterNo   : 1,
      category    : BioCategory.EVENT,
      title       : "中举",
      location    : "会稽",
      event       : "周进中举",
      virtualYear : null,
      recordSource: RecordSource.MANUAL,
      status      : ProcessingStatus.VERIFIED,
      createdAt   : "2026-03-25T00:00:00.000Z"
    });
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/personas/${personaId}/biography`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        chapterId,
        event: "周进中举"
      })
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.code).toBe("PERSONA_BIOGRAPHY_CREATED");
    expect(createPersonaBiographyMock).toHaveBeenCalledWith(personaId, {
      chapterId,
      event: "周进中举"
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 403 when viewer requests", async () => {
    const personaId = "deb2ea4c-e758-4ea8-b40b-5e7e4376e12b";
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/personas/${personaId}/biography`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.VIEWER
      },
      body: JSON.stringify({})
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(403);
    expect(createPersonaBiographyMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 when body is invalid", async () => {
    const personaId = "deb2ea4c-e758-4ea8-b40b-5e7e4376e12b";
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/personas/${personaId}/biography`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        chapterId: "invalid",
        event    : ""
      })
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(400);
    expect(createPersonaBiographyMock).not.toHaveBeenCalled();
  });

  it("returns 400 when route params are invalid", async () => {
    const chapterId = "b53fc2ca-6f86-4cd6-ac3d-694f402e570e";
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/personas/invalid/biography", {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        chapterId,
        event: "周进中举"
      })
    }), { params: Promise.resolve({ id: "invalid" }) });

    expect(response.status).toBe(400);
    expect(createPersonaBiographyMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 404 when persona missing", async () => {
    const personaId = "deb2ea4c-e758-4ea8-b40b-5e7e4376e12b";
    const chapterId = "b53fc2ca-6f86-4cd6-ac3d-694f402e570e";
    const { PersonaNotFoundError } = await import("@/server/modules/personas/errors");
    createPersonaBiographyMock.mockRejectedValue(new PersonaNotFoundError(personaId));
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/personas/${personaId}/biography`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        chapterId,
        event: "周进中举"
      })
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });

  it("returns 400 when the biography payload is rejected by the service", async () => {
    const personaId = "deb2ea4c-e758-4ea8-b40b-5e7e4376e12b";
    const chapterId = "b53fc2ca-6f86-4cd6-ac3d-694f402e570e";
    const { BiographyInputError } = await import("@/server/modules/biography/errors");
    createPersonaBiographyMock.mockRejectedValue(new BiographyInputError("事件内容不能为空"));
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/personas/${personaId}/biography`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        chapterId,
        event: "周进中举"
      })
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
  });

  it("returns 500 for unexpected creation failures", async () => {
    const personaId = "deb2ea4c-e758-4ea8-b40b-5e7e4376e12b";
    const chapterId = "b53fc2ca-6f86-4cd6-ac3d-694f402e570e";
    createPersonaBiographyMock.mockRejectedValue(new Error("db unavailable"));
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/personas/${personaId}/biography`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        chapterId,
        event: "周进中举"
      })
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
  });
});
