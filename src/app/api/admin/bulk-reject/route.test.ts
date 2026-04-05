import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole, ProcessingStatus } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const bulkRejectDraftsMock = vi.fn();
class BulkReviewInputError extends Error {}

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/review/bulkReview", () => ({
  bulkRejectDrafts: bulkRejectDraftsMock,
  BulkReviewInputError
}));

/**
 * 文件定位（Next.js 管理端批量驳回接口单测）：
 * - 对应 `POST /api/admin/bulk-reject`，用于一次性驳回多条草稿。
 * - 该接口处于审校工作流关键路径，直接影响后台批量操作效率。
 *
 * Next.js 语义说明：
 * - `route.ts` 运行于服务端；本测试通过构造 `Request` 模拟 JSON body 与权限头。
 * - 鉴权仍通过 `next/headers` 读取请求上下文，这里使用 mock 控制角色分支。
 */
describe("POST /api/admin/bulk-reject", () => {
  beforeEach(() => {
    // 默认管理员角色，优先覆盖主业务成功路径。
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    bulkRejectDraftsMock.mockReset();
    vi.resetModules();
  });

  it("bulk rejects drafts", async () => {
    // 成功分支：校验请求体 ids 会按原顺序传入服务层，并返回批处理统计结果。
    bulkRejectDraftsMock.mockResolvedValue({
      ids                 : ["8f53a01e-a9b4-420c-a55d-f4f1452f52bc"],
      status              : ProcessingStatus.REJECTED,
      relationshipCount   : 2,
      biographyRecordCount: 1,
      totalCount          : 3
    });
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/bulk-reject", {
      method : "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        ids: ["8f53a01e-a9b4-420c-a55d-f4f1452f52bc"]
      })
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_DRAFTS_BULK_REJECTED");
    expect(bulkRejectDraftsMock).toHaveBeenCalledWith(["8f53a01e-a9b4-420c-a55d-f4f1452f52bc"]);
  });

  it("returns 403 when viewer calls the API", async () => {
    // 权限边界：VIEWER 不得执行批量驳回，防止越权修改审校状态。
    headersMock.mockResolvedValueOnce(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/bulk-reject", {
      method : "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        ids: ["8f53a01e-a9b4-420c-a55d-f4f1452f52bc"]
      })
    }));

    expect(response.status).toBe(403);
    expect(bulkRejectDraftsMock).not.toHaveBeenCalled();
  });

  it("returns 400 when body is invalid", async () => {
    // 参数防御：非法 ID 需在入口层拒绝，避免服务层接收脏数据。
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/bulk-reject", {
      method : "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        ids: ["invalid-id"]
      })
    }));

    expect(response.status).toBe(400);
    expect(bulkRejectDraftsMock).not.toHaveBeenCalled();
  });

  it("maps service input error to 400", async () => {
    // 错误映射：服务层输入异常统一转为 400，便于前端提示“请求参数问题”而非系统故障。
    bulkRejectDraftsMock.mockRejectedValue(new BulkReviewInputError("至少需要传入一个草稿 ID"));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/bulk-reject", {
      method : "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        ids: ["8f53a01e-a9b4-420c-a55d-f4f1452f52bc"]
      })
    }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
  });
});
