import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const acceptMergeSuggestionMock = vi.fn();
class MergeSuggestionNotFoundError extends Error {}
class MergeSuggestionStateError extends Error {}
class PersonaMergeConflictError extends Error {}

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/roleWorkbench/mergeSuggestions", () => ({
  acceptMergeSuggestion         : acceptMergeSuggestionMock,
  MERGE_SUGGESTION_STATUS_VALUES: ["PENDING", "ACCEPTED", "REJECTED", "DEFERRED"] as const,
  MergeSuggestionNotFoundError,
  MergeSuggestionStateError,
  PersonaMergeConflictError
}));

/**
 * 文件定位（Next.js 动态路由接口单测）：
 * - 对应 `app/api/admin/merge-suggestions/[id]/accept/route.ts`，处理“接受合并建议”动作。
 * - `[id]` 来自动态路由参数，本测试通过 `params: Promise.resolve({ id })` 模拟 Next.js 传参机制。
 *
 * 业务职责：
 * - 管理员确认两个人物应合并时，调用服务层推进状态流转。
 * - 路由层负责参数格式与鉴权兜底，服务层负责真正的合并规则。
 */
describe("POST /api/admin/merge-suggestions/:id/accept", () => {
  beforeEach(() => {
    // 默认使用管理员角色，确保主场景能够触达 accept 逻辑。
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    acceptMergeSuggestionMock.mockReset();
    vi.resetModules();
  });

  it("accepts merge suggestion", async () => {
    // 成功分支：断言路由参数被原样传入服务层，避免错误映射导致误操作其他建议单。
    const suggestionId = "e23d523f-0e66-4fb4-b475-d57f86886d9f";
    acceptMergeSuggestionMock.mockResolvedValue({
      id    : suggestionId,
      status: "ACCEPTED"
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/merge-suggestions"),
      {
        params: Promise.resolve({ id: suggestionId })
      }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_MERGE_SUGGESTION_ACCEPTED");
    expect(acceptMergeSuggestionMock).toHaveBeenCalledWith(suggestionId);
  });

  it("returns 400 when params are invalid", async () => {
    // 防御分支：ID 非 UUID 时在入口拒绝，减少无意义数据库查询并统一错误码。
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/merge-suggestions"),
      {
        params: Promise.resolve({ id: "invalid-id" })
      }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(acceptMergeSuggestionMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the merge suggestion no longer exists", async () => {
    const suggestionId = "e23d523f-0e66-4fb4-b475-d57f86886d9f";
    acceptMergeSuggestionMock.mockRejectedValue(new MergeSuggestionNotFoundError("missing"));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/merge-suggestions"),
      {
        params: Promise.resolve({ id: suggestionId })
      }
    );

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });

  it("returns 409 when the merge suggestion state already changed", async () => {
    const suggestionId = "e23d523f-0e66-4fb4-b475-d57f86886d9f";
    acceptMergeSuggestionMock.mockRejectedValue(new MergeSuggestionStateError("already handled"));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/merge-suggestions"),
      {
        params: Promise.resolve({ id: suggestionId })
      }
    );

    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
  });

  it("returns 409 when persona merge validation detects a conflict", async () => {
    const suggestionId = "e23d523f-0e66-4fb4-b475-d57f86886d9f";
    acceptMergeSuggestionMock.mockRejectedValue(new PersonaMergeConflictError("conflict"));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/merge-suggestions"),
      {
        params: Promise.resolve({ id: suggestionId })
      }
    );

    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
  });

  it("returns 500 for unexpected failures", async () => {
    const suggestionId = "e23d523f-0e66-4fb4-b475-d57f86886d9f";
    acceptMergeSuggestionMock.mockRejectedValue(new Error("boom"));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/merge-suggestions"),
      {
        params: Promise.resolve({ id: suggestionId })
      }
    );

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
  });
});
