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

import { AppRole, NameType } from "@/generated/prisma/enums";

const getLegacyPersonaDetailMock = vi.fn();
const getPersonaByIdMock = vi.fn();
const updatePersonaMock = vi.fn();
const deletePersonaMock = vi.fn();

vi.mock("@/server/modules/review/evidence-review/persona-detail-read", () => ({
  getLegacyPersonaDetail: getLegacyPersonaDetailMock
}));

vi.mock("@/server/modules/personas/getPersonaById", () => ({
  getPersonaById: getPersonaByIdMock
}));

vi.mock("@/server/modules/personas/updatePersona", () => ({
  updatePersona: updatePersonaMock
}));

vi.mock("@/server/modules/personas/deletePersona", () => ({
  deletePersona: deletePersonaMock
}));

vi.mock("@/server/modules/personas/errors", () => {
  class PersonaNotFoundError extends Error {
    readonly personaId: string;

    constructor(personaId: string) {
      super(`Persona not found: ${personaId}`);
      this.personaId = personaId;
    }
  }

  return {
    PersonaNotFoundError
  };
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("GET /api/personas/:id", () => {
  afterEach(() => {
    getLegacyPersonaDetailMock.mockReset();
    getPersonaByIdMock.mockReset();
    updatePersonaMock.mockReset();
    deletePersonaMock.mockReset();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns persona detail", async () => {
    const personaId = "6d97e7f0-72b8-4855-b902-14f32eaf226e";
    getLegacyPersonaDetailMock.mockResolvedValue({
      id           : personaId,
      name         : "周进",
      aliases      : ["周学道"],
      gender       : "男",
      hometown     : "会稽",
      nameType     : "NAMED",
      recordSource : "AI",
      confidence   : 0.9,
      status       : "VERIFIED",
      profiles     : [],
      timeline     : [],
      relationships: []
    });
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/personas/${personaId}`),
      { params: Promise.resolve({ id: personaId }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("PERSONA_FETCHED");
    expect(payload.data.relationships).toEqual([]);
    expect(getLegacyPersonaDetailMock).toHaveBeenCalledWith(personaId);
    expect(getPersonaByIdMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 when id is invalid", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/personas/invalid"),
      { params: Promise.resolve({ id: "invalid" }) }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(getLegacyPersonaDetailMock).not.toHaveBeenCalled();
    expect(getPersonaByIdMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 404 when persona is missing", async () => {
    const personaId = "6d97e7f0-72b8-4855-b902-14f32eaf226e";
    const { PersonaNotFoundError } = await import("@/server/modules/personas/errors");
    getLegacyPersonaDetailMock.mockRejectedValue(new PersonaNotFoundError(personaId));
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/personas/${personaId}`),
      { params: Promise.resolve({ id: personaId }) }
    );

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_NOT_FOUND");
    expect(getPersonaByIdMock).not.toHaveBeenCalled();
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("PATCH /api/personas/:id", () => {
  afterEach(() => {
    getLegacyPersonaDetailMock.mockReset();
    getPersonaByIdMock.mockReset();
    updatePersonaMock.mockReset();
    deletePersonaMock.mockReset();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("updates persona when admin requests", async () => {
    const personaId = "6d97e7f0-72b8-4855-b902-14f32eaf226e";
    updatePersonaMock.mockResolvedValue({
      id        : personaId,
      name      : "周进",
      aliases   : ["周学道"],
      gender    : "男",
      hometown  : "会稽",
      nameType  : NameType.NAMED,
      globalTags: ["儒生"],
      confidence: 0.88,
      updatedAt : "2026-03-25T00:00:00.000Z"
    });
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/personas/${personaId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        name      : "周进",
        aliases   : ["周学道"],
        confidence: 0.88
      })
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.code).toBe("PERSONA_UPDATED");
    expect(updatePersonaMock).toHaveBeenCalledWith(personaId, {
      name      : "周进",
      aliases   : ["周学道"],
      confidence: 0.88
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 403 for viewer", async () => {
    const personaId = "6d97e7f0-72b8-4855-b902-14f32eaf226e";
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/personas/${personaId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.VIEWER
      },
      body: JSON.stringify({ name: "周进" })
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(403);
    expect(updatePersonaMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 when body is invalid", async () => {
    const personaId = "6d97e7f0-72b8-4855-b902-14f32eaf226e";
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/personas/${personaId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({ confidence: 1.5 })
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(400);
    expect(updatePersonaMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 404 when persona is missing", async () => {
    const personaId = "6d97e7f0-72b8-4855-b902-14f32eaf226e";
    const { PersonaNotFoundError } = await import("@/server/modules/personas/errors");
    updatePersonaMock.mockRejectedValue(new PersonaNotFoundError(personaId));
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/personas/${personaId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({ name: "周进" })
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("DELETE /api/personas/:id", () => {
  afterEach(() => {
    getLegacyPersonaDetailMock.mockReset();
    getPersonaByIdMock.mockReset();
    updatePersonaMock.mockReset();
    deletePersonaMock.mockReset();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("deletes persona when admin requests", async () => {
    const personaId = "6d97e7f0-72b8-4855-b902-14f32eaf226e";
    deletePersonaMock.mockResolvedValue({
      id       : personaId,
      deletedAt: "2026-03-25T00:00:00.000Z",
      cascaded : {
        relationshipCount: 2,
        biographyCount   : 1,
        mentionCount     : 1,
        profileCount     : 1
      }
    });
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request(`http://localhost/api/personas/${personaId}`, {
      method : "DELETE",
      headers: {
        "x-auth-role": AppRole.ADMIN
      }
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.code).toBe("PERSONA_DELETED");
    expect(deletePersonaMock).toHaveBeenCalledWith(personaId);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 403 for viewer", async () => {
    const personaId = "6d97e7f0-72b8-4855-b902-14f32eaf226e";
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request(`http://localhost/api/personas/${personaId}`, {
      method : "DELETE",
      headers: {
        "x-auth-role": AppRole.VIEWER
      }
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(403);
    expect(deletePersonaMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 when id is invalid", async () => {
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request("http://localhost/api/personas/invalid", {
      method : "DELETE",
      headers: {
        "x-auth-role": AppRole.ADMIN
      }
    }), { params: Promise.resolve({ id: "invalid" }) });

    expect(response.status).toBe(400);
    expect(deletePersonaMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 404 when persona is missing", async () => {
    const personaId = "6d97e7f0-72b8-4855-b902-14f32eaf226e";
    const { PersonaNotFoundError } = await import("@/server/modules/personas/errors");
    deletePersonaMock.mockRejectedValue(new PersonaNotFoundError(personaId));
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request(`http://localhost/api/personas/${personaId}`, {
      method : "DELETE",
      headers: {
        "x-auth-role": AppRole.ADMIN
      }
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });
});
