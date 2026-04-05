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

const mergePersonasMock = vi.fn();

vi.mock("@/server/modules/personas/mergePersonas", () => {
  class PersonaNotFoundError extends Error {
    readonly personaId: string;

    constructor(personaId: string) {
      super(`Persona not found: ${personaId}`);
      this.personaId = personaId;
    }
  }

  class PersonaMergeInputError extends Error {
    constructor(message: string) {
      super(message);
    }
  }

  return {
    mergePersonas: mergePersonasMock,
    PersonaNotFoundError,
    PersonaMergeInputError
  };
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("POST /api/personas/merge", () => {
  afterEach(() => {
    mergePersonasMock.mockReset();
    vi.resetModules();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("merges two personas and returns 200", async () => {
    mergePersonasMock.mockResolvedValue({
      sourceId                : "6235de9d-f4c3-4b1d-bc90-03b8f09e4fd8",
      targetId                : "2fd91a82-0492-4c9a-ae0d-f3376517e578",
      redirectedRelationships : 3,
      rejectedRelationships   : 1,
      redirectedBiographyCount: 4,
      redirectedMentionCount  : 6
    });
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/personas/merge", {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        sourceId: "6235de9d-f4c3-4b1d-bc90-03b8f09e4fd8",
        targetId: "2fd91a82-0492-4c9a-ae0d-f3376517e578"
      })
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("PERSONA_MERGED");
    expect(mergePersonasMock).toHaveBeenCalledWith({
      sourceId: "6235de9d-f4c3-4b1d-bc90-03b8f09e4fd8",
      targetId: "2fd91a82-0492-4c9a-ae0d-f3376517e578"
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 403 for viewer", async () => {
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/personas/merge", {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.VIEWER
      },
      body: JSON.stringify({
        sourceId: "6235de9d-f4c3-4b1d-bc90-03b8f09e4fd8",
        targetId: "2fd91a82-0492-4c9a-ae0d-f3376517e578"
      })
    }));

    expect(response.status).toBe(403);
    expect(mergePersonasMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 when body is invalid", async () => {
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/personas/merge", {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        sourceId: "invalid-id",
        targetId: "2fd91a82-0492-4c9a-ae0d-f3376517e578"
      })
    }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(mergePersonasMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("maps PersonaNotFoundError to 404", async () => {
    const sourceId = "6235de9d-f4c3-4b1d-bc90-03b8f09e4fd8";
    const targetId = "2fd91a82-0492-4c9a-ae0d-f3376517e578";
    const { PersonaNotFoundError } = await import("@/server/modules/personas/mergePersonas");
    mergePersonasMock.mockRejectedValue(new PersonaNotFoundError(sourceId));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/personas/merge", {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        sourceId,
        targetId
      })
    }));

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("maps PersonaMergeInputError to 400", async () => {
    const sourceId = "6235de9d-f4c3-4b1d-bc90-03b8f09e4fd8";
    const targetId = "2fd91a82-0492-4c9a-ae0d-f3376517e578";
    const { PersonaMergeInputError } = await import("@/server/modules/personas/mergePersonas");
    mergePersonasMock.mockRejectedValue(new PersonaMergeInputError("源人物与目标人物不能相同"));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/personas/merge", {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        sourceId,
        targetId
      })
    }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(payload.error?.detail).toBe("源人物与目标人物不能相同");
  });
});
