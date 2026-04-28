import { afterEach, describe, expect, it, vi } from "vitest";

import { clientFetch } from "@/lib/client-api";

/**
 * 客户端 API 工具回归测试：
 * - 覆盖 Next.js 路由未命中时返回 HTML 404 的场景；
 * - 确保 UI 不再暴露 `Unexpected token '<'` 这类底层 JSON 解析错误。
 */
describe("clientFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("throws a user-facing error when the server returns non-JSON HTML", async () => {
    // Arrange
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("<!DOCTYPE html><html></html>", {
      headers: { "Content-Type": "text/html; charset=utf-8" },
      status : 404
    }));

    // Act + Assert
    await expect(clientFetch("/api/books/book-1/chapters/preview"))
      .rejects
      .toThrow("请求失败，请稍后重试");
  });
});
