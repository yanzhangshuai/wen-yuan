---
stage: growth
---

# 安全规范

> 后端安全基线，覆盖鉴权、输入校验、敏感信息处理。

---

## 必须遵守

- 所有外部入口（API Route/Server Action）在业务逻辑前完成鉴权与授权。
- 所有外部输入先按 `unknown` 处理并做运行时校验。
- 日志中禁止直接输出 token、密钥、原始用户隐私字段。
- 安全相关配置只读 `process.env`，禁止写死在代码中。

---

## 代码案例

反例：
```ts
export async function POST(request: Request) {
  const body = await request.json();
  console.log("raw body", body);
  return new Response(JSON.stringify(await dangerousRun(body)), { status: 200 });
}
```

正例：
```ts
import { errorResponse, successResponse, toNextJson } from "@/server/http/api-response";

export async function POST(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (!authHeader) {
    return toNextJson(
      errorResponse("AUTH_UNAUTHORIZED", "未授权", { type: "AuthError" }, getMeta()),
      401,
    );
  }

  const body: unknown = await request.json();
  const chapterId = typeof (body as { chapterId?: unknown })?.chapterId === "string"
    ? (body as { chapterId: string }).chapterId
    : undefined;

  if (!chapterId) {
    return toNextJson(
      errorResponse("COMMON_BAD_REQUEST", "参数错误", { type: "ValidationError" }, getMeta()),
      400,
    );
  }

  return toNextJson(successResponse("OK", "成功", { chapterId }, getMeta()), 200);
}
```

---

## 原因

- 入口统一校验与鉴权可阻断大部分越权和脏数据注入问题。
- 错误码标准化后，安全事件可被监控与审计系统稳定识别。
- 禁止敏感信息明文日志可显著降低泄露面。

---

## 验收清单

- [ ] 未授权请求返回 401 + 稳定错误码
- [ ] 非法输入返回 400 + ValidationError
- [ ] 日志无 token/密码/原文敏感字段
- [ ] 安全配置项来自 env 且有文档说明
