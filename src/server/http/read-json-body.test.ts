/**
 * 文件定位（服务端 HTTP 工具单测）：
 * - 覆盖 server/http 层通用能力，位于业务模块与 Next.js Route Handler 之间的基础设施层。
 * - 该层不直接承载业务页面，但会影响所有 API 路由的输入解析与响应格式。
 *
 * 业务职责：
 * - 保证请求读取、参数处理、统一响应封装、异常映射等通用规则稳定。
 * - 降低各接口重复实现风险，确保全局 API 行为一致。
 */

import { describe, expect, it, vi } from "vitest";

import { readJsonBody } from "@/server/http/read-json-body";

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("readJsonBody", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("parses a valid JSON object body", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body  : JSON.stringify({ title: "儒林外史", chapter: 1 })
    });

    await expect(readJsonBody(request)).resolves.toEqual({
      title  : "儒林外史",
      chapter: 1
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("parses a valid JSON array body", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body  : JSON.stringify(["a", "b", "c"])
    });

    await expect(readJsonBody(request)).resolves.toEqual(["a", "b", "c"]);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("parses valid JSON primitive body", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body  : "123"
    });

    await expect(readJsonBody(request)).resolves.toBe(123);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns empty object when body is empty", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body  : ""
    });

    await expect(readJsonBody(request)).resolves.toEqual({});
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns empty object when body is whitespace only", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body  : "   \n\t   "
    });

    await expect(readJsonBody(request)).resolves.toEqual({});
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns empty object when JSON is invalid", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body  : "{invalid-json"
    });

    await expect(readJsonBody(request)).resolves.toEqual({});
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns empty object when request body is already consumed", async () => {
    const request = new Request("http://localhost/api/test", {
      method: "POST",
      body  : JSON.stringify({ once: true })
    });

    await expect(readJsonBody(request)).resolves.toEqual({ once: true });
    await expect(readJsonBody(request)).resolves.toEqual({});
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns empty object when request.text throws", async () => {
    const fakeRequest = {
      text: vi.fn().mockRejectedValue(new Error("read failed"))
    } as unknown as Request;

    await expect(readJsonBody(fakeRequest)).resolves.toEqual({});
  });
});
