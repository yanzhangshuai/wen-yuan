import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const deferMergeSuggestionMock = vi.fn();
class MergeSuggestionNotFoundError extends Error {}
class MergeSuggestionStateError extends Error {}

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/roleWorkbench/mergeSuggestions", () => ({
  deferMergeSuggestion          : deferMergeSuggestionMock,
  MERGE_SUGGESTION_STATUS_VALUES: ["PENDING", "ACCEPTED", "REJECTED", "DEFERRED"] as const,
  MergeSuggestionNotFoundError,
  MergeSuggestionStateError
}));

/**
 * 文件定位（Next.js 动态管理接口单测）：
 * - 对应 `POST /api/admin/merge-suggestions/[id]/defer`，用于“暂缓处理”合并建议。
 * - 路由层负责鉴权、参数校验与错误映射，服务层负责状态机变更。
 */
describe("POST /api/admin/merge-suggestions/:id/defer", () => {
  beforeEach(() => {
    // 默认管理员身份，确保主路径可触达 defer 业务逻辑。
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    deferMergeSuggestionMock.mockReset();
    vi.resetModules();
  });

  it("defers merge suggestion", async () => {
    // 成功分支：建议单应变更为 DEFERRED，并返回管理端统一成功码。
    const suggestionId = "5f08f368-f342-4f3a-9db6-b8facf48afec";
    deferMergeSuggestionMock.mockResolvedValue({
      id    : suggestionId,
      status: "DEFERRED"
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
    expect(payload.code).toBe("ADMIN_MERGE_SUGGESTION_DEFERRED");
    expect(deferMergeSuggestionMock).toHaveBeenCalledWith(suggestionId);
  });

  it("returns 404 when suggestion does not exist", async () => {
    // 错误映射：不存在建议单 -> 404，便于前端刷新列表并提示记录已失效。
    const suggestionId = "5f08f368-f342-4f3a-9db6-b8facf48afec";
    deferMergeSuggestionMock.mockRejectedValue(new MergeSuggestionNotFoundError("not found"));
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
    // 状态机冲突：当前状态不允许 defer 时，应返回冲突语义，防止重复操作。
    const suggestionId = "5f08f368-f342-4f3a-9db6-b8facf48afec";
    deferMergeSuggestionMock.mockRejectedValue(new MergeSuggestionStateError("invalid state"));
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
    // 参数防御：动态路由 id 非法时提前拦截，避免进入服务层。
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
    expect(deferMergeSuggestionMock).not.toHaveBeenCalled();
  });
});
