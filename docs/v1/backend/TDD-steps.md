# 文渊后端 — 测试执行实操手册

> 版本：1.0  日期：2026-03-26  
> 本文是 `TDD.md` 的**配套实操指南**，TDD.md 说明"验什么"，本文说明"怎么做"。  
> 所有示例代码均对应 `src/` 现有实现，可直接复制执行。

---

## 目录

1. [环境准备（必读，最先执行）](#1-环境准备)
2. [Token / 认证的写法](#2-token--认证的写法)
3. [文件上传的写法（multipart/form-data）](#3-文件上传的写法)
4. [单元测试的标准结构](#4-单元测试的标准结构)
5. [集成测试的写法（真实数据库）](#5-集成测试的写法真实数据库)
6. [Phase 1：DB + 存储 + 鉴权 执行步骤](#6-phase-1-执行步骤)
7. [Phase 2：书籍导入 + AI 解析 执行步骤](#7-phase-2-执行步骤)
8. [Phase 3：图谱 + 人物 执行步骤](#8-phase-3-执行步骤)
9. [Phase 4：审核 + 合并 执行步骤](#9-phase-4-执行步骤)
10. [Phase 5：模型 + 加密 + 安全 执行步骤](#10-phase-5-执行步骤)
11. [覆盖率达标检查](#11-覆盖率达标检查)
12. [常见报错与解法](#12-常见报错与解法)

---

## 1. 环境准备

> **必须严格按顺序执行，缺任何一步后续测试都会失败。**

### 步骤 1-1：安装依赖

```bash
pnpm install
```

验收：`node_modules/` 存在，`pnpm-lock.yaml` 未变化。

---

### 步骤 1-2：生成 Prisma 类型文件

```bash
pnpm prisma:generate
```

验收：`src/generated/prisma/` 目录下文件时间戳更新。  
**说明**：Prisma 的枚举（`AppRole`、`BioCategory` 等）从这里生成，测试代码用到的 `@/generated/prisma/enums` 来自这一步。

---

### 步骤 1-3：应用数据库迁移

> 注意：必须先有 `DATABASE_URL`（见下方环境变量说明）。

```bash
pnpm prisma:migrate
```

验收输出：

```
All migrations have been successfully applied. Database schema is up to date!
```

如果提示有 pending migration，运行：

```bash
pnpm exec prisma migrate dev
```

---

### 步骤 1-4：注入种子数据（Admin 账号 + 模型预置）

```bash
pnpm prisma:seed
```

验收（重复运行不报错）：

```
✅ Admin seeding complete
✅ AI model seeding complete
```

---

### 步骤 1-5：配置测试环境变量

在项目根目录创建 `.env.test`（**不要提交到 Git**）：

```dotenv
# ── 数据库（绝对不能用生产库）────────────────────────────
DATABASE_URL=postgresql://postgres:password@127.0.0.1:5432/wenyuan_test

# ── 认证 ────────────────────────────────────────────────
JWT_SECRET=test-jwt-secret-at-least-32-bytes-001!
# 注意：JWT_SECRET 必须 >= 32 字节，否则 token.ts 会抛错

# ── 加密（AES-256-GCM 的 master key）────────────────────
APP_ENCRYPTION_KEY=test-enc-key-at-least-32-bytes-002!

# ── 存储 ─────────────────────────────────────────────────
STORAGE_PROVIDER=local
STORAGE_LOCAL_ROOT=./storage-test
STORAGE_PUBLIC_BASE_URL=/api/assets

# ── 运行时 ───────────────────────────────────────────────
NODE_ENV=test
```

`vitest.setup.ts` 已有兜底：

```typescript
process.env.DATABASE_URL ??= "postgresql://user:pass@127.0.0.1:5432/testdb";
```

但 `JWT_SECRET` / `APP_ENCRYPTION_KEY` **必须在 `.env.test` 中显式设置**，`token.ts` 和 `encryption.ts` 无兜底默认值。

---

### 步骤 1-6：确认 TypeScript 编译与 Lint 全绿

```bash
pnpm build   # 期望：0 TypeScript errors
pnpm lint    # 期望：0 errors, 0 warnings
```

---

## 2. Token / 认证的写法

### 2.1 单元测试：用 `x-auth-role` 头（推荐）

单元测试不走真实 JWT 验证。Route Handler 中 `getAuthContext()` 会先读 `x-auth-role` 请求头（由 Middleware 注入），测试中直接伪造这个头即可。

```typescript
import { AppRole } from "@/generated/prisma/enums";

// ✅ 模拟管理员请求
const adminRequest = new Request("http://localhost/api/books", {
  method : "POST",
  headers: {
    "x-auth-role": AppRole.ADMIN,   // "ADMIN"
    "content-type": "application/json",
  },
  body: JSON.stringify({ ... }),
});

// ✅ 模拟游客请求（或不传 header，默认也是 VIEWER）
const viewerRequest = new Request("http://localhost/api/books", {
  headers: {
    "x-auth-role": AppRole.VIEWER,  // "VIEWER"
  },
});
```

**原理**：`src/server/modules/auth/index.ts` 的 `getAuthContext()` 实现如下优先级：  
`Cookie token（若有效）> x-auth-role header > 默认 VIEWER`

---

### 2.2 真实 JWT Token 的生成方式（集成测试用）

若需要真实 JWT（如测试中间件、Cookie 验证），用 `issueAuthToken()` 生成：

```typescript
// 在测试文件或 helper 中
import { issueAuthToken } from "@/server/modules/auth/token";

// 生成一个有效的 Admin JWT（需要 JWT_SECRET 环境变量）
const token = await issueAuthToken();
// 结果：eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xxx.xxx

// 把 Token 放入 Cookie 头
const request = new Request("http://localhost/admin/page", {
  headers: {
    cookie: `token=${token}`,
  },
});
```

---

### 2.3 生成已过期 Token（用于测试拒绝逻辑）

```typescript
import { issueAuthToken } from "@/server/modules/auth/token";

// now 传一个 7 天前的时间戳，让 token 在生成时就过期
const pastNow = Math.floor(Date.now() / 1000) - 60 * 60 * 24 * 8; // 8天前
const expiredToken = await issueAuthToken(pastNow);

// 验证时会被拒绝（verifyAuthToken 返回 null）
const result = await verifyAuthToken(expiredToken);
expect(result).toBeNull();
```

---

### 2.4 生成被篡改 Token（用于测试签名验证）

```typescript
const validToken = await issueAuthToken();
const parts = validToken.split(".");
// 篡改 payload 部分（第二段）
const tamperedToken = parts[0] + "." + btoa("tampered-payload") + "." + parts[2];

const result = await verifyAuthToken(tamperedToken);
expect(result).toBeNull();
```

---

### 2.5 登录接口的 Origin 同源校验

`POST /api/auth/login` 强制校验 `Origin` 头。在测试中必须传：

```typescript
const response = await POST(new Request("http://localhost/api/auth/login", {
  method : "POST",
  headers: {
    "content-type": "application/json",
    origin        : "http://localhost",    // ← 必须有，且必须同源
  },
  body: JSON.stringify({
    identifier: "admin@example.com",
    password  : "Test@2026Pass!",
  }),
}));
```

测试"非同源被拒绝"时：

```typescript
const response = await POST(new Request("http://localhost/api/auth/login", {
  method : "POST",
  headers: {
    "content-type": "application/json",
    origin        : "http://evil.com",     // ← 非同源，期望 403
  },
  body: JSON.stringify({ identifier: "admin", password: "xxx" }),
}));
expect(response.status).toBe(403);
```

---

## 3. 文件上传的写法

### 3.1 `POST /api/books` — 文本书籍上传

Route Handler 接收 `multipart/form-data`，在测试中使用浏览器原生 `FormData` + `File` API：

```typescript
// 构造 FormData（Node.js 18+ 原生支持 / Vitest environment=node 已内置）
const formData = new FormData();
formData.set("title",   "儒林外史");
formData.set("author",  "吴敬梓");
formData.set("dynasty", "清");
formData.set(
  "file",
  new File(
    ["第一回 说楔子敷陈大义 借名流隐括全文\n\n话说成化末年..."],
    "rulin.txt",
    { type: "text/plain" }
  )
);

// 发送请求（注意：不要手动设置 Content-Type，FormData 会自动加 boundary）
const response = await POST(new Request("http://localhost/api/books", {
  method : "POST",
  headers: {
    "x-auth-role": AppRole.ADMIN,
    // ❌ 不要写 "content-type": "multipart/form-data"，会丢 boundary
  },
  body: formData,
}));

expect(response.status).toBe(201);
const payload = await response.json();
expect(payload.data.sourceFile.key).toMatch(/^books\/.+\/source\/.+\.txt$/);
```

---

### 3.2 模拟文件超过 50MB 的情况

```typescript
// 构造一个声明为 60MB 大小的 File（content 可以很短，依赖 file.size）
const bigFile = new File(["x"], "big.txt", { type: "text/plain" });
// File 对象的 size 是只读的，但可通过子类 mock
// 推荐方式：mock createBook 模块，直接测试路由的校验逻辑
const mockFile = {
  name: "big.txt",
  type: "text/plain",
  size: 60 * 1024 * 1024,   // 60MB，通过 formData.get("file").size 判断
  arrayBuffer: async () => new ArrayBuffer(0),
  text: async () => "",
  stream: () => new ReadableStream(),
} as unknown as File;
```

更简洁的方式是 mock `createBook` 模块，让路由层的校验（大小判断）在 Route Handler 内直接测：

```typescript
// 在 route.test.ts 中用真实 FormData，但 mock 存储
vi.mock("@/server/providers/storage", () => ({
  provideStorage: () => ({
    putObject: vi.fn().mockResolvedValue(undefined),
    getObjectUrl: (key: string) => `/api/assets/${key}`,
  }),
}));

const hugeContent = "x".repeat(100); // 实际数据小
const formData = new FormData();
formData.set("file", new File([hugeContent], "big.txt", { type: "text/plain" }));
// 路由层检查的是 formData.get("file").size，可在测试中重写 getter
Object.defineProperty(formData.get("file"), "size", { value: 60 * 1024 * 1024 });
```

---

### 3.3 非 `.txt` 类型文件被拒绝

```typescript
const pdfFile = new File(["fake pdf"], "book.pdf", { type: "application/pdf" });
const formData = new FormData();
formData.set("title", "测试书");
formData.set("file", pdfFile);

const response = await POST(new Request("http://localhost/api/books", {
  method : "POST",
  headers: { "x-auth-role": AppRole.ADMIN },
  body   : formData,
}));

expect(response.status).toBe(400);
const payload = await response.json();
expect(payload.code).toBe("COMMON_BAD_REQUEST");
expect(payload.error.detail).toContain("txt");
```

---

## 4. 单元测试的标准结构

每个测试文件需遵循以下结构（与现有代码一致）：

```typescript
// src/server/modules/example/someService.test.ts

import { afterEach, describe, expect, it, vi } from "vitest";

// ─── Step 1: 声明 mock 函数变量 ─────────────────────────────────────────────
const prismaMock = {
  persona: {
    findMany: vi.fn(),
    create  : vi.fn(),
    update  : vi.fn(),
  },
  $transaction: vi.fn(),
};

// ─── Step 2: mock 外部依赖（必须在 import 之前，hoisted 到文件顶部）──────────
vi.mock("@/server/db/prisma", () => ({
  prisma: prismaMock,
}));

// ─── Step 3: 懒加载被测模块（在 describe/it 内 import，保证 mock 先生效）──
describe("someService", () => {

  afterEach(() => {
    // ── Step 4: 每个用例后重置 mock ─────────────────────────────────────────
    vi.resetAllMocks();
  });

  it("做某件事时返回正确结果", async () => {
    // Arrange：配置 mock 预期返回值
    prismaMock.persona.findMany.mockResolvedValue([
      { id: "p1", name: "贾宝玉", aliases: [] },
    ]);

    // 懒加载（关键：确保 mock 已经注册后再 import）
    const { someService } = await import("./someService");

    // Act：调用被测函数
    const result = await someService("book-1");

    // Assert：验证结果
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("贾宝玉");

    // 验证 mock 调用参数
    expect(prismaMock.persona.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { bookId: "book-1" } })
    );
  });
});
```

---

### 4.1 Route Handler 的测试结构

Route Handler 有参数 `(request, context)` 两个参数，`context.params` 是 `Promise`：

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRole } from "@/generated/prisma/enums";

// mock 业务模块（Route Handler 直接调用的那层）
const getBookByIdMock = vi.fn();

vi.mock("@/server/modules/books/getBookById", () => {
  // 同时导出错误类，供 Route Handler 的 catch 分支使用
  class BookNotFoundError extends Error {
    constructor(public readonly bookId: string) {
      super(`Book not found: ${bookId}`);
    }
  }
  return {
    getBookById     : getBookByIdMock,
    BookNotFoundError,
  };
});

describe("GET /api/books/:id", () => {
  afterEach(() => {
    getBookByIdMock.mockReset();
    vi.resetModules(); // ← 重置模块缓存，避免懒加载污染
  });

  it("返回 200 和书籍详情", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";

    getBookByIdMock.mockResolvedValue({
      id    : bookId,
      title : "红楼梦",
      status: "COMPLETED",
    });

    // 懒加载 Route Handler
    const { GET } = await import("@/app/api/books/[id]/route");

    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}`),
      // context.params 是 Promise（Next.js 15+ 约定）
      { params: Promise.resolve({ id: bookId }) },
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.data.id).toBe(bookId);
  });

  it("bookId 非 UUID 格式时返回 400", async () => {
    const { GET } = await import("@/app/api/books/[id]/route");

    const response = await GET(
      new Request("http://localhost/api/books/not-a-uuid"),
      { params: Promise.resolve({ id: "not-a-uuid" }) },
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
  });
});
```

---

### 4.2 验证 envelope 格式的通用断言

把这段封装为 helper，所有测试复用：

```typescript
// src/test-utils/assertions.ts

export function expectSuccessEnvelope(payload: unknown) {
  expect(payload).toMatchObject({
    success: true,
    code   : expect.any(String),
    message: expect.any(String),
    data   : expect.anything(),
    meta   : {
      requestId: expect.any(String),
      timestamp: expect.any(String),
      path     : expect.any(String),
      durationMs: expect.any(Number),
    },
  });
}

export function expectErrorEnvelope(payload: unknown, expectedCode?: string) {
  expect(payload).toMatchObject({
    success: false,
    code   : expectedCode ?? expect.any(String),
    message: expect.any(String),
    error  : {
      type  : expect.any(String),
      detail: expect.any(String),
    },
    meta: expect.objectContaining({
      requestId: expect.any(String),
    }),
  });
}
```

使用方式：

```typescript
import { expectSuccessEnvelope, expectErrorEnvelope } from "@/test-utils/assertions";

const payload = await response.json();
expectSuccessEnvelope(payload);
```

---

## 5. 集成测试的写法（真实数据库）

> 集成测试使用真实数据库，需要先完成 §1 的所有步骤。

### 5.1 测试数据库隔离策略

每个集成测试用例前后清理数据，推荐用事务回滚方式：

```typescript
// src/test-utils/db-helpers.ts
import { prisma } from "@/server/db/prisma";

// 测试用创建数据的 helper
export async function createTestBook(override?: Partial<{
  title : string;
  author: string;
}>) {
  return prisma.book.create({
    data: {
      title      : override?.title  ?? "测试书籍",
      author     : override?.author ?? "作者",
      dynasty    : "清",
      description: "用于测试",
      status     : "PENDING",
    },
  });
}

export async function createTestPersona(bookId: string, name: string) {
  return prisma.persona.create({
    data: { name, type: "PERSON", bookId },
  });
}

// 清理所有测试数据（按依赖顺序删除）
export async function cleanTestData() {
  await prisma.relationship.deleteMany({});
  await prisma.biographyRecord.deleteMany({});
  await prisma.mention.deleteMany({});
  await prisma.profile.deleteMany({});
  await prisma.persona.deleteMany({});
  await prisma.chapter.deleteMany({});
  await prisma.analysisJob.deleteMany({});
  await prisma.book.deleteMany({});
}
```

在集成测试中使用：

```typescript
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanTestData, createTestBook } from "@/test-utils/db-helpers";
import { prisma } from "@/server/db/prisma";

describe("书籍导入集成测试", () => {
  beforeAll(async () => {
    await cleanTestData(); // 清理历史残留
  });

  afterAll(async () => {
    await cleanTestData(); // 清理本次产生的数据
    await prisma.$disconnect();
  });

  it("场景A：完整书籍导入链路", async () => {
    // Step 1: 创建书籍记录
    const book = await createTestBook({ title: "儒林外史" });
    expect(book.id).toBeTruthy();
    expect(book.status).toBe("PENDING");

    // Step 2: 确认书籍详情
    const fetched = await prisma.book.findUnique({ where: { id: book.id } });
    expect(fetched).not.toBeNull();

    // ... 后续步骤
  });
});
```

---

### 5.2 集成测试完整场景 A：书籍导入链路

```typescript
describe("场景A：完整书籍导入链路（集成，真实DB）", () => {
  let bookId: string;

  beforeAll(async () => await cleanTestData());
  afterAll(async () => { await cleanTestData(); await prisma.$disconnect(); });

  it("Step 1: POST /api/auth/login 获取 cookie token", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(new Request("http://localhost/api/auth/login", {
      method : "POST",
      headers: {
        "content-type": "application/json",
        origin        : "http://localhost",
      },
      body: JSON.stringify({
        identifier: process.env.ADMIN_USERNAME ?? "admin",
        password  : process.env.ADMIN_PASSWORD ?? "Admin@2026!!",
      }),
    }));

    expect(response.status).toBe(200);
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("token=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Strict");

    // 提取 token 供后续 Cookie 请求使用
    const tokenMatch = setCookie?.match(/token=([^;]+)/);
    expect(tokenMatch).not.toBeNull();
    // 存到外部变量：process.env.TEST_TOKEN = tokenMatch![1];
  });

  it("Step 2: POST /api/books 上传书籍", async () => {
    const formData = new FormData();
    formData.set("title",   "儒林外史集成测试");
    formData.set("author",  "吴敬梓");
    formData.set("dynasty", "清");
    formData.set(
      "file",
      new File(["第一回 说楔子敷陈大义..."], "rulin.txt", { type: "text/plain" })
    );

    const { POST } = await import("@/app/api/books/route");
    const response = await POST(new Request("http://localhost/api/books", {
      method : "POST",
      headers: { "x-auth-role": "ADMIN" },
      body   : formData,
    }));

    expect(response.status).toBe(201);
    const payload = await response.json();
    bookId = payload.data.id;  // 保存 bookId 给后续步骤

    expect(payload.data.status).toBe("PENDING");
    expect(payload.data.sourceFile.key).toMatch(/^books\/.+\/source\//);
  });

  it("Step 3: GET /api/books/:id 确认书籍详情", async () => {
    const { GET } = await import("@/app/api/books/[id]/route");
    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}`),
      { params: Promise.resolve({ id: bookId }) },
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.id).toBe(bookId);
    expect(payload.data.status).toBe("PENDING");
  });

  it("Step 4: GET /api/books/:id/chapters/preview 预览章节", async () => {
    const { GET } = await import("@/app/api/books/[id]/chapters/preview/route");
    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/chapters/preview`),
      { params: Promise.resolve({ id: bookId }) },
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(Array.isArray(payload.data.chapters)).toBe(true);
  });

  it("Step 5: POST /api/books/:id/chapters/confirm 确认章节", async () => {
    const { POST } = await import("@/app/api/books/[id]/chapters/confirm/route");
    const response = await POST(
      new Request(`http://localhost/api/books/${bookId}/chapters/confirm`, {
        method : "POST",
        headers: {
          "x-auth-role" : "ADMIN",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          chapters: [
            { type: "CHAPTER", no: 1, title: "第一回", content: "第一回 说楔子..." },
          ],
        }),
      }),
      { params: Promise.resolve({ id: bookId }) },
    );

    expect(response.status).toBe(200);
    const chapterCount = await prisma.chapter.count({ where: { bookId } });
    expect(chapterCount).toBe(1);
  });

  it("Step 6: POST /api/books/:id/analyze 启动解析任务", async () => {
    // 需要先确保有可用的 AI 模型
    const model = await prisma.aiModel.findFirst({ where: { isEnabled: true } });
    if (!model) {
      console.warn("⚠️ 无可用 AI 模型，跳过解析启动测试");
      return;
    }

    const { POST } = await import("@/app/api/books/[id]/analyze/route");
    const response = await POST(
      new Request(`http://localhost/api/books/${bookId}/analyze`, {
        method : "POST",
        headers: {
          "x-auth-role" : "ADMIN",
          "content-type": "application/json",
        },
        body: JSON.stringify({ scope: "FULL_BOOK" }),
      }),
      { params: Promise.resolve({ id: bookId }) },
    );

    // 正确状态码：202 Accepted（不是 200）
    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("BOOK_ANALYSIS_STARTED");

    // 确认任务入队
    const job = await prisma.analysisJob.findFirst({
      where: { bookId },
      orderBy: { createdAt: "desc" },
    });
    expect(job?.status).toBe("QUEUED");

    // 确认书籍状态联动（任务创建时立即写入初始进度）
    const updatedBook = await prisma.book.findUnique({ where: { id: bookId } });
    expect(updatedBook?.status).toBe("PROCESSING");
    expect(updatedBook?.parseProgress).toBe(0);
    expect(updatedBook?.parseStage).toBe("文本清洗");
    // 注意：路由是 fire-and-forget，此处任务状态仍为 QUEUED
    // runAnalysisJobById 已被异步调用但不影响响应
  });
});
```

---

## 6. Phase 1 执行步骤

### 6.1 DB Schema 验收执行

```bash
# 步骤 6.1.1：迁移状态检查
pnpm exec prisma migrate status
# 期望：Database schema is up to date!

# 步骤 6.1.2：用 Prisma Studio 或 psql 查看枚举值
pnpm exec prisma studio
# 或 psql 查询枚举：
# SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid
# WHERE pg_type.typname = 'bio_category';

# 步骤 6.1.3：运行 Schema 枚举对齐测试
pnpm test:unit -- --testNamePattern="enum values are aligned"
```

---

### 6.2 Storage Provider 验收执行

```bash
# 步骤 6.2.1：运行存储测试
pnpm test:unit -- src/server/providers/storage/

# 步骤 6.2.2：验证路径穿越防护（人工检查测试是否覆盖）
grep -r "path traversal\|../\.\." src/server/providers/storage/
```

---

### 6.3 鉴权验收执行

```bash
# 步骤 6.3.1：运行所有 auth 相关测试
pnpm test:unit -- src/server/modules/auth/
pnpm test:unit -- src/app/api/auth/
pnpm test:unit -- src/middleware.test.ts

# 步骤 6.3.2：确认 Cookie 属性（用真实登录，检查 Response header）
curl -s -X POST http://localhost:3060/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3060" \
  -d '{"identifier":"admin","password":"your-admin-password"}' \
  -v 2>&1 | grep -i "set-cookie"
# 期望：token=xxx; Path=/; HttpOnly; Max-Age=604800; SameSite=Strict

# 步骤 6.3.3：测试 CSRF（非同源被拒绝）
curl -s -X POST http://localhost:3060/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Origin: http://evil.com" \
  -d '{"identifier":"admin","password":"xxx"}' | jq .
# 期望：{"success":false,"code":"AUTH_FORBIDDEN",...}
```

---

### 6.4 限流验收执行

```bash
# 步骤 6.4.1：运行限流单元测试
pnpm test:unit -- src/app/api/auth/login/route.test.ts --testNamePattern="rate limit"

# 步骤 6.4.2：手动压测限流（需本地服务运行中）
# 连续发送 11 次失败登录，第 11 次应返回 429
for i in {1..11}; do
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST http://localhost:3060/api/auth/login \
    -H "Content-Type: application/json" \
    -H "Origin: http://localhost:3060" \
    -d '{"identifier":"admin","password":"wrong-password"}')
  echo "第 $i 次: HTTP $STATUS"
done
```

---

## 7. Phase 2 执行步骤

### 7.1 书籍导入验收执行

```bash
# 步骤 7.1.1：运行书籍 CRUD 测试
pnpm test:unit -- src/app/api/books/
pnpm test:unit -- src/server/modules/books/

# 步骤 7.1.2：手动测试文件上传（本地服务运行中）
# 先登录获取 Cookie
LOGIN_RESP=$(curl -s -i -X POST http://localhost:3060/api/auth/login \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3060" \
  -d '{"identifier":"admin","password":"your-password"}')
TOKEN=$(printf '%s' "$LOGIN_RESP" | tr -d '\r' \
  | awk 'BEGIN{IGNORECASE=1} /^set-cookie: token=/{line=$0; sub(/^.*token=/,"",line); sub(/;.*$/,"",line); print line; exit}')
COOKIE="token=${TOKEN}"

# 上传书籍（需要准备一个 .txt 文件）
curl -s -X POST http://localhost:3060/api/books \
  -b "$COOKIE" \
  -F "title=红楼梦" \
  -F "author=曹雪芹" \
  -F "dynasty=清" \
  -F "file=@/tmp/hongloumeng.txt;type=text/plain"
# 如本机安装了 jq，可追加 `| jq .` 便于阅读

# 步骤 7.1.3：验证文件落盘（STORAGE_LOCAL_ROOT 下有物理文件）
# 以当前项目 .env 默认配置为准：STORAGE_LOCAL_ROOT=data/storage
ls -la ./data/storage/books/
```

---

### 7.2 AI 解析任务验收执行

```bash
# 步骤 7.2.1：运行解析启动测试
pnpm test:unit -- src/server/modules/books/startBookAnalysis.test.ts

# 步骤 7.2.2：运行 ChapterAnalysisService 单元测试（如果文件已创建）
pnpm test:unit -- src/server/modules/analysis/services/ChapterAnalysisService.test.ts

# 步骤 7.2.3：检查关键常量值
grep -n "MAX_CHUNK_LENGTH\|AI_CONCURRENCY\|AI_MAX_RETRIES\|AI_RETRY_BASE_MS" \
  src/server/modules/analysis/services/ChapterAnalysisService.ts
# 期望：MAX_CHUNK_LENGTH=3500, AI_CONCURRENCY=3, AI_MAX_RETRIES=2, AI_RETRY_BASE_MS=600
```

---

### 7.3 解析任务执行器（runAnalysisJob）验收执行

> **关键点**：`POST /api/books/:id/analyze` 是 fire-and-forget，路由仅返回 202，  
> `runAnalysisJobById` 在后台异步执行。此节验收执行器本身的状态机逻辑。

```bash
# 步骤 7.3.1：运行执行器单元测试
pnpm test:unit -- src/server/modules/analysis/jobs/runAnalysisJob.test.ts
```

**状态机验收检查清单（单测必须覆盖）：**

```typescript
// 关键 mock 结构（在 runAnalysisJob.test.ts 中）
describe("runAnalysisJob 状态机", () => {
  it("QUEUED → RUNNING：原子抢占，started_at 写入", async () => { ... });

  it("已是 RUNNING 的任务被其他进程抢占后，本进程不重复执行", async () => { ... });

  it("进程启动时发现遗留 RUNNING 任务，恢复继续执行", async () => { ... });

  it("所有章节成功 → RUNNING → SUCCEEDED，书籍置 COMPLETED + progress=100", async () => { ... });

  it("某章节 AI 失败 → RUNNING → FAILED，error_log 写入，书籍置 ERROR", async () => { ... });

  it("每章完成后 books.parse_progress 递增，books.parse_stage 更新", async () => { ... });

  it("CANCELED 状态任务不被执行器处理", async () => { ... });
});
```

```bash
# 步骤 7.3.2：验证 202 状态码和 fire-and-forget 行为（单测层）
# zsh 需加引号避免 [id] 被当成通配符
pnpm test:unit -- 'src/app/api/books/[id]/analyze/route.test.ts'

# 步骤 7.3.3：验证接口返回的正确业务码
# 若当前 shell 没有 COOKIE，可先复用 7.1.2 的登录步骤重新获取
if [ -z "${COOKIE:-}" ]; then
  LOGIN_RESP=$(curl -s -i -X POST http://localhost:3060/api/auth/login \
    -H "Content-Type: application/json" \
    -H "Origin: http://localhost:3060" \
    -d '{"identifier":"admin","password":"your-password"}')
  TOKEN=$(printf '%s' "$LOGIN_RESP" | tr -d '\r' \
    | awk 'BEGIN{IGNORECASE=1} /^set-cookie: token=/{line=$0; sub(/^.*token=/,"",line); sub(/;.*$/,"",line); print line; exit}')
  COOKIE="token=${TOKEN}"
fi

HTTP_CODE=$(curl -s -o /tmp/analyze-response.json -w "%{http_code}" \
  -X POST http://localhost:3060/api/books/${BOOK_ID}/analyze \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3060" \
  -b "$COOKIE" \
  -d '{"scope":"FULL_BOOK"}')
cat /tmp/analyze-response.json | jq '{status: .success, code: .code}'
echo "HTTP ${HTTP_CODE}"
# 若无 jq，可直接去掉 `| jq ...` 查看原始 JSON
# 期望：{ "status": true, "code": "BOOK_ANALYSIS_STARTED" }
# HTTP 状态码：202（用 -w "%{http_code}" 验证）

# 步骤 7.3.4：验证任务创建后书籍初始进度字段
# 立即查询书籍状态（在 fire-and-forget 执行器跑完之前）
curl -s "http://localhost:3060/api/books/${BOOK_ID}/status" \
  -b "$COOKIE" | jq '{
  status  : .data.status,
  progress: .data.progress,
  stage   : .data.stage
}'
# 若无 jq，可直接去掉 `| jq ...` 查看原始 JSON
# 期望：{ "status": "PROCESSING", "progress": 0, "stage": "文本清洗" }
```

---

## 8. Phase 3 执行步骤

### 8.1 图谱数据验收执行

```bash
# 步骤 8.1.1：运行图谱模块测试
pnpm test:unit -- src/server/modules/books/getBookGraph.test.ts

# 步骤 8.1.2：验证 sentiment 映射表覆盖所有关系类型
grep -A 30 "RELATION_SENTIMENT_MAP" src/server/modules/books/getBookGraph.ts | head -35

# 步骤 8.1.3：手动测试图谱接口（本地服务运行中）
BOOK_ID="your-book-id"
curl -s "http://localhost:3060/api/books/${BOOK_ID}/graph" | jq '{ 
  nodeCount: (.data.nodes | length), 
  edgeCount: (.data.edges | length),
  sampleSentiment: .data.edges[0].sentiment
}'
```

---

### 8.2 最短路径验收执行（含 Neo4j 降级）

```bash
# 步骤 8.2.1：运行路径查询测试
pnpm test:unit -- src/server/modules/graph/findPersonaPath.test.ts

# 步骤 8.2.2：确认 Neo4j 未配置时走 PostgreSQL + BFS 降级
# 临时取消 NEO4J_* 环境变量，测试仍能正常返回
NEO4J_URI="" NEO4J_USER="" NEO4J_PASSWORD="" \
  curl -s -X POST http://localhost:3060/api/graph/path \
  -H "Content-Type: application/json" \
  -d '{
    "bookId"         : "your-book-id",
    "sourcePersonaId": "persona-a-id",
    "targetPersonaId": "persona-b-id"
  }' | jq .success
# 期望：true（降级生效，不报 500）
```

---

## 9. Phase 4 执行步骤

### 9.1 批量审核验收执行

```bash
# 步骤 9.1.1：运行批量审核测试
pnpm test:unit -- src/server/modules/review/

# 步骤 9.1.2：手动测试批量确认（本地服务运行中）
curl -s -X POST http://localhost:3060/api/admin/bulk-verify \
  -H "Content-Type: application/json" \
  -b "token=your-jwt-token" \
  -d '{"ids": ["draft-id-1", "draft-id-2"]}' | jq .

# 步骤 9.1.3：确认状态变更
# 通过数据库验证
pnpm exec prisma studio  # 在 biographyRecord/relationship 表中查 status=VERIFIED
```

---

### 9.2 人物合并验收执行

```bash
# 步骤 9.2.1：运行合并测试（事务完整性验证）
pnpm test:unit -- src/server/modules/personas/mergePersonas.test.ts

# 步骤 9.2.2：手工验证合并场景（在集成测试环境）

# 先创建测试数据（用 prisma studio 或 seed 脚本）
# 然后调用合并接口
curl -s -X POST http://localhost:3060/api/personas/merge \
  -H "Content-Type: application/json" \
  -b "token=your-admin-jwt" \
  -d '{
    "sourceId": "source-persona-uuid",
    "targetId": "target-persona-uuid"
  }' | jq .

# 步骤 9.2.3：验证合并结果
# source persona 应软删除（deleted_at 不为 null）
# target persona 的 aliases 应包含 source 的别名
```

---

## 10. Phase 5 执行步骤

### 10.1 加密模块验收执行

> **前置**：`encryption.test.ts` 若不存在，必须先创建。

```typescript
// src/server/security/encryption.test.ts

import { afterAll, beforeAll, describe, expect, it } from "vitest";

// 必须在 import 前设置环境变量
process.env.APP_ENCRYPTION_KEY = "test-enc-key-exactly-32-bytes-ok!";

describe("encryption module", () => {
  let encryptValue: (plain: string) => string;
  let decryptValue: (cipher: string) => string;
  let maskApiKey:   (key: string) => string;

  beforeAll(async () => {
    const mod = await import("./encryption");
    encryptValue = mod.encryptValue;
    decryptValue = mod.decryptValue;
    maskApiKey   = mod.maskApiKey;
  });

  it("encryptValue 输出以 enc:v1: 开头", () => {
    const cipher = encryptValue("sk-test-api-key");
    expect(cipher).toMatch(/^enc:v1:/);
  });

  it("decryptValue 还原明文（往返一致）", () => {
    const plain  = "sk-test-api-key-12345";
    const cipher = encryptValue(plain);
    const result = decryptValue(cipher);
    expect(result).toBe(plain);
  });

  it("空字符串透传（不加密）", () => {
    expect(encryptValue("")).toBe("");
    expect(decryptValue("")).toBe("");
  });

  it("相同明文两次加密产生不同密文（随机 IV）", () => {
    const plain   = "sk-same-key";
    const cipher1 = encryptValue(plain);
    const cipher2 = encryptValue(plain);
    expect(cipher1).not.toBe(cipher2);   // IV 不同
    // 但两者均能正确解密
    expect(decryptValue(cipher1)).toBe(plain);
    expect(decryptValue(cipher2)).toBe(plain);
  });

  it("篡改密文后解密抛错（GCM 认证失败）", () => {
    const cipher  = encryptValue("original-key");
    const tampered = cipher.slice(0, -4) + "XXXX"; // 破坏末尾
    expect(() => decryptValue(tampered)).toThrow();
  });

  it("maskApiKey 格式：前缀+遮码+末4位", () => {
    expect(maskApiKey("sk-abcdefgh1234")).toBe("sk-****1234");
    expect(maskApiKey("sk-short")).toMatch(/\*+/);
    expect(maskApiKey("")).toBe("");
  });

  it("缺失 APP_ENCRYPTION_KEY 时抛明确错误", async () => {
    const savedKey = process.env.APP_ENCRYPTION_KEY;
    delete process.env.APP_ENCRYPTION_KEY;

    // 需要重新 import 以触发初始化错误
    vi.resetModules();
    await expect(import("./encryption")).rejects.toThrow(/APP_ENCRYPTION_KEY/);

    process.env.APP_ENCRYPTION_KEY = savedKey;
  });
});
```

```bash
# 执行加密模块测试
pnpm test:unit -- src/server/security/encryption.test.ts
```

---

### 10.2 SSRF 防护验收执行

```bash
# 步骤 10.2.1：确认白名单域列表
grep -n "MODEL_TEST_ALLOWED_HOSTS\|allowedHosts\|deepseek\|dashscope" \
  src/app/api/admin/models/\[id\]/test/route.ts

# 步骤 10.2.2：SSRF 攻击向量测试（单元测试中）
# 在 route.test.ts 中已有 SSRF 测试用例，执行：
pnpm test:unit -- src/app/api/admin/models/

# 步骤 10.2.3：手动验证非白名单域被拒绝
curl -s -X POST http://localhost:3060/api/admin/models/some-model-id/test \
  -H "Content-Type: application/json" \
  -b "token=admin-jwt-token" \
  -d '{"overrideBaseUrl": "http://internal-service.local"}' | jq .
# 期望：{"success":false,"code":"COMMON_BAD_REQUEST",...}
```

---

### 10.3 安全基线扫描

```bash
# 步骤 10.3.1：检查原始 SQL 查询（不应存在）
grep -r "\$queryRawUnsafe\|queryRawUnsafe" src/ --include="*.ts"
# 期望：无输出（0 matches）

# 步骤 10.3.2：检查字符串拼接 SQL（不应存在）
grep -rn "WHERE.*\${" src/ --include="*.ts" | grep -v ".test.ts"
# 期望：无输出

# 步骤 10.3.3：检查 API Key 明文存储风险
grep -rn "api_key.*=.*sk-" src/ --include="*.ts" | grep -v ".test.ts"
# 期望：无（所有 api_key 写入前须经 encryptValue）

# 步骤 10.3.4：检查 console.log 泄露敏感值
grep -rn "console\.log.*decrypt\|console\.log.*apiKey\|console\.log.*password" \
  src/ --include="*.ts" | grep -v ".test.ts"
# 期望：无输出
```

---

## 11. 覆盖率达标检查

### 步骤 11-1：运行全量测试 + 覆盖率收集

```bash
pnpm test:unit
```

报告输出路径：`coverage/unit/index.html`

---

### 步骤 11-2：查看覆盖率摘要

```bash
# 快速查看文本摘要
cat coverage/unit/lcov.info | grep -E "^(SF|LH|LF)" | \
  awk -F: '
    /^SF/ { file=$2 }
    /^LH/ { hit=$2 }
    /^LF/ { total=$2; if(total>0) printf "%s: %.1f%%\n", file, hit/total*100 }
  ' | sort -t: -k2 -n | head -20
# 显示覆盖率最低的 20 个文件
```

---

### 步骤 11-3：覆盖率未达标时的处理流程

```
如果 pnpm test:unit 报 Coverage threshold not met：

1. 打开 coverage/unit/index.html 找到红色文件
2. 找到未覆盖的分支（红色代码行）
3. 添加对应测试用例覆盖该分支
4. 重新运行 pnpm test:unit，直到所有阈值通过：
   - lines    ≥ 80%
   - branches ≥ 70%
   - functions ≥ 80%
   - statements ≥ 80%
```

**注意**：以下路径被排除在覆盖率统计之外（`vitest.config.ts` 配置）：

```
src/generated/**          # Prisma 生成文件
src/server/providers/**   # 存储/AI Provider 抽象层
**/*.test.ts              # 测试文件本身
**/*.config.*             # 配置文件
```

---

## 12. 常见报错与解法

### 报错 1：`JWT_SECRET must be at least 32 bytes`

**原因**：`.env.test` 的 `JWT_SECRET` 太短。  
**解法**：确保值 ≥ 32 个字节（ASCII 字符 32 个），如：

```dotenv
JWT_SECRET=my-super-secret-key-for-tests-2026!
```

---

### 报错 2：`The column (...) does not exist` (Prisma P2022)

**原因**：Prisma 生成文件与数据库 Schema 不一致。  
**解法**：

```bash
pnpm prisma:generate  # 重新生成类型
pnpm prisma:migrate   # 应用迁移
```

---

### 报错 3：测试中 `vi.mock` 未生效（模块已被缓存）

**原因**：多个测试共用模块缓存。  
**解法**：在 `afterEach` 中加 `vi.resetModules()`，并使用懒加载（在 `it()` 内 `await import()`）：

```typescript
afterEach(() => {
  vi.resetModules();
  mockFn.mockReset();
});

it("...", async () => {
  const { handler } = await import("./route"); // 懒加载
  // ...
});
```

---

### 报错 4：FormData 文件上传 `content-type` 报错

**原因**：手动设置了 `"content-type": "multipart/form-data"` 导致丢失 `boundary`。  
**解法**：不要手动设置 content-type，让 `FormData` 自动生成带 boundary 的值：

```typescript
// ❌ 错误写法
headers: { "content-type": "multipart/form-data" }

// ✅ 正确写法（不设置 content-type）
headers: { "x-auth-role": "ADMIN" }
body: formData
```

---

### 报错 5：`node:crypto is not supported in the Edge Runtime`

**原因**：`middleware.ts` 的依赖链引入了 Node 模块（如 Prisma）。  
**解法**：检查 `middleware.ts` 只依赖 `@/server/modules/auth/edge-token`（使用 `jose`），绝不能直接 import Prisma。

---

### 报错 6：集成测试数据互相污染

**原因**：多个集成测试共用同一数据库且未清理。  
**解法**：每个集成测试 suite 的 `beforeAll`/`afterAll` 都调用 `cleanTestData()`：

```typescript
beforeAll(async () => {
  await cleanTestData();
});

afterAll(async () => {
  await cleanTestData();
  await prisma.$disconnect();
});
```

---

### 报错 7：`context.params` 不是 Promise 导致类型错误

**原因**：Next.js 15+ Route Handler 的 params 改为 `Promise`，测试中直接传对象。  
**解法**：

```typescript
// ❌ 错误写法（Next.js 14 及以前）
{ params: { id: "book-1" } }

// ✅ 正确写法（Next.js 15+）
{ params: Promise.resolve({ id: "book-1" }) }
```

---

*End of TDD-steps.md*
