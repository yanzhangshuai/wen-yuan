# Route Handler 编写规范

> Next.js App Router `route.ts` 的编写约定。基于 `src/server/http/` 既有工具层。

---

## 标准结构模板

```ts
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { failJson, okJson } from "@/server/http/route-utils";

export async function GET(req: NextRequest) {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = req.nextUrl.pathname;

  // 1. 鉴权（必须第一步）
  const authCtx = await getAuthContext(req);
  requireAdmin(authCtx); // 仅管理接口需要

  // 2. 输入解析与校验
  const { page, pageSize } = parsePagination(req.nextUrl.searchParams);

  // 3. 业务逻辑（委托给 service）
  const result = await listBooks({ page, pageSize });

  // 4. 统一响应
  return okJson(path, requestId, startedAt, "BOOKS_LISTED", "查询成功", result);
}
```

---

## 鉴权约定

- **鉴权必须是 handler 第一步**，在 Zod 解析之前
- 管理接口调 `requireAdmin(authCtx)`，调用者接口调 `requireViewer(authCtx)`
- `getAuthContext` 从 request header（由 middleware 注入）读取角色，不解 JWT
- 鉴权失败时 `requireAdmin` 直接抛 `AuthError`，由 `failJson` 映射为 401/403

```ts
// 禁止：先解析参数再鉴权
const body = await req.json();
const authCtx = await getAuthContext(req); // 顺序错误

// 正确：鉴权在最前
const authCtx = await getAuthContext(req);
requireAdmin(authCtx);
const body = await req.json();
```

---

## 输入校验

所有 request body / query params 必须经过 Zod 校验，**不允许直接访问未校验字段**：

```ts
// query params
const schema = z.object({
  bookId: z.string().uuid(),
  page  : z.coerce.number().int().min(1).default(1),
});
const parsed = schema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
if (!parsed.success) {
  return failJson(path, requestId, startedAt, new ZodError(parsed.error.issues));
}

// body（JSON）
const body = await req.json();
const result = bodySchema.safeParse(body);
```

**FormData（文件上传）**：先用 `request.formData()` 解析，再逐字段用 `z.preprocess` 做类型收窄。

---

## 响应工具（`src/server/http/route-utils.ts`）

| 函数 | 用途 |
|------|------|
| `okJson(path, requestId, startedAt, code, message, data)` | 成功响应（200） |
| `failJson(path, requestId, startedAt, error)` | 错误响应，自动映射状态码 |
| `parsePagination(searchParams)` | 标准分页解析（page/pageSize，有上限） |

**failJson 错误映射矩阵**：

| 错误类型 | HTTP 状态码 |
|---------|------------|
| `AuthError` (UNAUTHORIZED) | 401 |
| `AuthError` (FORBIDDEN) | 403 |
| `ZodError` | 400 |
| `NotFoundError` | 404 |
| 其他 `Error` | 500 |

---

## 分页约定

使用 `parsePagination` 解析，**不手动解析 page/pageSize**：

```ts
// 正例
const { page, pageSize } = parsePagination(req.nextUrl.searchParams);

// 反例：手动解析
const page = Number(req.nextUrl.searchParams.get("page") ?? 1);
```

`parsePagination` 有默认值（page=1，pageSize=20）和上限（pageSize≤100），业务方无需自行防御。

---

## 路径参数类型

Next.js 15+ 中 `params` 是 `Promise<{ id: string }>`，必须 `await`：

```ts
// 正例
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // ...
}

// 反例（旧写法，类型错误）
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { id } = params; // ← params 未 await，类型声明错误
}
```

详见 `nextjs-best-practices.md` 第三节。

---

## 禁止模式

| 禁止 | 原因 |
|------|------|
| 在 route.ts 内写业务逻辑（直接调 prisma） | 业务逻辑必须委托给 `modules/` 下的 service |
| `NextResponse.json({ ok: false, msg: "..." })` | 必须用 `failJson` 保持统一 envelope |
| 向客户端返回原始异常对象（`catch (e) { return json(e) }`） | 可能泄露堆栈与内部信息；用 `failJson` 统一处理 |
| 鉴权在业务逻辑之后 | 未鉴权的业务调用可能已经产生副作用 |
| 直接访问未经 Zod 校验的 `req.nextUrl.searchParams.get(...)` | 输入未校验，类型不安全 |
