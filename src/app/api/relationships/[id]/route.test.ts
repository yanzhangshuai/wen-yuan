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

import { AppRole, ProcessingStatus } from "@/generated/prisma/enums";

const updateRelationshipMock = vi.fn();
const deleteRelationshipMock = vi.fn();

vi.mock("@/server/modules/relationships/updateRelationship", () => ({
  updateRelationship: updateRelationshipMock
}));

vi.mock("@/server/modules/relationships/deleteRelationship", () => ({
  deleteRelationship: deleteRelationshipMock
}));

vi.mock("@/server/modules/relationships/errors", () => {
  class RelationshipNotFoundError extends Error {
    readonly relationshipId: string;

    constructor(relationshipId: string) {
      super(`Relationship not found: ${relationshipId}`);
      this.relationshipId = relationshipId;
    }
  }

  class RelationshipInputError extends Error {
    constructor(message: string) {
      super(message);
    }
  }

  return {
    RelationshipNotFoundError,
    RelationshipInputError
  };
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("PATCH /api/relationships/:id", () => {
  afterEach(() => {
    updateRelationshipMock.mockReset();
    deleteRelationshipMock.mockReset();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("updates relationship when admin requests", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    updateRelationshipMock.mockResolvedValue({
      id         : relationshipId,
      chapterId  : "chapter-1",
      sourceId   : "persona-1",
      targetId   : "persona-2",
      type       : "师生",
      weight     : 0.8,
      description: null,
      evidence   : null,
      confidence : 0.9,
      status     : ProcessingStatus.VERIFIED,
      updatedAt  : "2026-03-25T00:00:00.000Z"
    });
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/relationships/${relationshipId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        type      : "师生",
        confidence: 0.9
      })
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.code).toBe("RELATIONSHIP_UPDATED");
    expect(updateRelationshipMock).toHaveBeenCalledWith(relationshipId, {
      type      : "师生",
      confidence: 0.9
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 403 when viewer requests", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/relationships/${relationshipId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.VIEWER
      },
      body: JSON.stringify({ type: "师生" })
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(403);
    expect(updateRelationshipMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 for invalid body", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/relationships/${relationshipId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({})
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(400);
    expect(updateRelationshipMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid route id", async () => {
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request("http://localhost/api/relationships/invalid-id", {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({ type: "师生" })
    }), { params: Promise.resolve({ id: "invalid-id" }) });

    expect(response.status).toBe(400);
    expect(updateRelationshipMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 404 when relationship missing", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    const { RelationshipNotFoundError } = await import("@/server/modules/relationships/errors");
    updateRelationshipMock.mockRejectedValue(new RelationshipNotFoundError(relationshipId));
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/relationships/${relationshipId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({ type: "师生" })
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });

  it("returns 400 when the service rejects the relationship payload", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    const { RelationshipInputError } = await import("@/server/modules/relationships/errors");
    updateRelationshipMock.mockRejectedValue(new RelationshipInputError("关系类型不能为空"));
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/relationships/${relationshipId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({ type: "师生" })
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
  });

  it("returns 500 for unexpected update failures", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    updateRelationshipMock.mockRejectedValue(new Error("db unavailable"));
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/relationships/${relationshipId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({ type: "师生" })
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("DELETE /api/relationships/:id", () => {
  afterEach(() => {
    updateRelationshipMock.mockReset();
    deleteRelationshipMock.mockReset();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("soft deletes relationship when admin requests", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    deleteRelationshipMock.mockResolvedValue({
      id       : relationshipId,
      status   : ProcessingStatus.REJECTED,
      deletedAt: "2026-03-25T00:00:00.000Z"
    });
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request(`http://localhost/api/relationships/${relationshipId}`, {
      method : "DELETE",
      headers: {
        "x-auth-role": AppRole.ADMIN
      }
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.code).toBe("RELATIONSHIP_DELETED");
    expect(deleteRelationshipMock).toHaveBeenCalledWith(relationshipId);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 403 when viewer requests", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request(`http://localhost/api/relationships/${relationshipId}`, {
      method : "DELETE",
      headers: {
        "x-auth-role": AppRole.VIEWER
      }
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(403);
    expect(deleteRelationshipMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 404 when relationship missing", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    const { RelationshipNotFoundError } = await import("@/server/modules/relationships/errors");
    deleteRelationshipMock.mockRejectedValue(new RelationshipNotFoundError(relationshipId));
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request(`http://localhost/api/relationships/${relationshipId}`, {
      method : "DELETE",
      headers: {
        "x-auth-role": AppRole.ADMIN
      }
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });

  it("returns 400 for invalid route id", async () => {
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request("http://localhost/api/relationships/invalid-id", {
      method : "DELETE",
      headers: {
        "x-auth-role": AppRole.ADMIN
      }
    }), { params: Promise.resolve({ id: "invalid-id" }) });

    expect(response.status).toBe(400);
    expect(deleteRelationshipMock).not.toHaveBeenCalled();
  });

  it("returns 500 for unexpected delete failures", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    deleteRelationshipMock.mockRejectedValue(new Error("db unavailable"));
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request(`http://localhost/api/relationships/${relationshipId}`, {
      method : "DELETE",
      headers: {
        "x-auth-role": AppRole.ADMIN
      }
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
  });
});
