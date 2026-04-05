import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const rejectMergeSuggestionMock = vi.fn();
class MergeSuggestionNotFoundError extends Error {}
class MergeSuggestionStateError extends Error {}

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/review/mergeSuggestions", () => ({
  rejectMergeSuggestion         : rejectMergeSuggestionMock,
  MERGE_SUGGESTION_STATUS_VALUES: ["PENDING", "ACCEPTED", "REJECTED", "DEFERRED"] as const,
  MergeSuggestionNotFoundError,
  MergeSuggestionStateError
}));

/**
 * 文件定位（Next.js 动态管理接口单测）：
 * - 对应 `POST /api/admin/merge-suggestions/[id]/reject`，用于显式驳回合并建议。
 * - 与 accept/defer 路由共同组成建议单状态机入口，测试目标是保证错误映射和权限语义一致。
 */
describe("POST /api/admin/merge-suggestions/:id/reject", () => {
  beforeEach(() => {
    // 默认管理员角色；非管理员分支一般由统一鉴权测试覆盖。
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    rejectMergeSuggestionMock.mockReset();
    vi.resetModules();
  });

  it("rejects merge suggestion", async () => {
    // 成功分支：业务上表示“确认不合并”，状态应落为 REJECTED。
    const suggestionId = "4c7c48b7-7801-4388-ad5f-265d14f2458d";
    rejectMergeSuggestionMock.mockResolvedValue({
      id    : suggestionId,
      status: "REJECTED"
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
    expect(payload.code).toBe("ADMIN_MERGE_SUGGESTION_REJECTED");
    expect(rejectMergeSuggestionMock).toHaveBeenCalledWith(suggestionId);
  });

  it("returns 404 when suggestion does not exist", async () => {
    // 资源缺失：建议单已删除/不存在时，路由层应稳定返回 404。
    const suggestionId = "4c7c48b7-7801-4388-ad5f-265d14f2458d";
    rejectMergeSuggestionMock.mockRejectedValue(new MergeSuggestionNotFoundError("not found"));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/merge-suggestions"),
      {
        params: Promise.resolve({ id: suggestionId })
      }
    );

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });

  it("returns 409 when suggestion status cannot be changed", async () => {
    // 状态冲突：例如已处理单据再次驳回，应返回冲突，避免错误覆盖历史决策。
    const suggestionId = "4c7c48b7-7801-4388-ad5f-265d14f2458d";
    rejectMergeSuggestionMock.mockRejectedValue(new MergeSuggestionStateError("invalid state"));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/merge-suggestions"),
      {
        params: Promise.resolve({ id: suggestionId })
      }
    );

    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
  });

  it("returns 400 when params are invalid", async () => {
    // 输入校验：非法 id 必须被拒绝，防止将脏参数传播到服务层。
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
    expect(rejectMergeSuggestionMock).not.toHaveBeenCalled();
  });
});
