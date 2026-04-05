import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const listMergeSuggestionsMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/review/mergeSuggestions", () => ({
  listMergeSuggestions          : listMergeSuggestionsMock,
  MERGE_SUGGESTION_STATUS_VALUES: ["PENDING", "ACCEPTED", "REJECTED", "DEFERRED"] as const
}));

/**
 * 文件定位（Next.js Route Handler 单测）：
 * - 对应 `app/api/admin/merge-suggestions/route.ts`，在 `app/` 目录约定下暴露为 `GET /api/admin/merge-suggestions`。
 * - 覆盖管理端“合并建议列表”接口的鉴权、查询参数校验、成功返回契约。
 *
 * Next.js 语义说明：
 * - Route Handler 在服务端执行，本测试通过直接调用导出的 `GET` 函数模拟请求流转。
 * - `next/headers` 在真实运行时读取请求头，这里通过 mock 注入角色头以覆盖权限分支。
 */
describe("GET /api/admin/merge-suggestions", () => {
  beforeEach(() => {
    // 默认场景为管理员，便于聚焦业务成功路径；非管理员分支在独立用例覆盖。
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    listMergeSuggestionsMock.mockReset();
    vi.resetModules();
  });

  it("returns merge suggestion list", async () => {
    // 成功分支：校验 query status 被正确解析并传给服务层，保证筛选行为一致。
    listMergeSuggestionsMock.mockResolvedValue([
      {
        id        : "b7b636b5-9a36-4e0a-8f0f-31a8eaa4845b",
        status    : "PENDING",
        sourceName: "范进",
        targetName: "周进"
      }
    ]);
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/admin/merge-suggestions?status=PENDING"));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_MERGE_SUGGESTIONS_LISTED");
    expect(listMergeSuggestionsMock).toHaveBeenCalledWith({ status: "PENDING" });
  });

  it("returns 403 when auth guard fails", async () => {
    // 权限边界：该接口只允许 ADMIN 调用，VIEWER 必须被拒绝，防止越权审校操作。
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/admin/merge-suggestions"));

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
  });

  it("returns 400 when query is invalid", async () => {
    // 防御分支：非法枚举值应在路由层被拦截，避免脏参数进入服务层造成语义不确定。
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/admin/merge-suggestions?status=INVALID"));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(listMergeSuggestionsMock).not.toHaveBeenCalled();
  });
});
