# 测试规范

> Vitest 单元测试的编写约定，涵盖 mock 策略、fixture 管理与各层测试模式。

---

## 核心要求

- 行/分支/函数/语句覆盖率门禁：**90%**（vitest.config.ts 配置，不可降低）
- 测试文件与被测文件同目录，命名为 `xxx.test.ts`
- 使用 `vitest` 的 `describe` / `it` / `expect`；不使用 `jest`
- 测试注释遵循 `guides/comment-guidelines.md` 的单元测试注释模板

---

## Mock 策略

### vi.hoisted + vi.mock（推荐模式）

外部模块（Prisma、Neo4j、Storage、AI Client）必须用 `vi.hoisted` 提升 mock 对象，再用 `vi.mock` 替换整个模块。

```ts
// 正例：Prisma mock
const hoisted = vi.hoisted(() => ({
  prisma: {
    book: {
      create    : vi.fn(),
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
  }
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: hoisted.prisma
}));

describe("createBook", () => {
  beforeEach(() => {
    vi.resetAllMocks(); // 每个 it 前重置，避免状态污染
  });

  it("creates book and uploads source file", async () => {
    hoisted.prisma.book.create.mockResolvedValueOnce({ id: "book-1", title: "儒林外史" });
    // ...
  });
});
```

**反例**：在 `vi.mock` 工厂函数内直接 `vi.fn()`，会导致提升问题（mock 变量在工厂执行时未定义）。

### 工厂函数注入（Service 层推荐）

Service 通过构造参数接收依赖时，直接传入 mock 对象，不需要 `vi.mock`：

```ts
const service = createCreateBookService(
  { book: { create: bookCreate } } as never,
  { putObject, deleteObject } as never
);
```

`as never` 只对测试文件允许，不得用于生产代码。

---

## 各层测试模式

### Service 层测试（主力）

- 覆盖业务分支：成功路径 + 各异常分支（输入校验失败、依赖抛错、状态机非法）
- mock 所有 I/O（Prisma、Storage、AI Client）
- 用 `mockResolvedValueOnce` 而非 `mockReturnValue`（避免跨 it 污染）
- 断言上游调用参数（`expect(fn).toHaveBeenCalledWith(...)`）

```ts
it("throws if book not found", async () => {
  hoisted.prisma.book.findUnique.mockResolvedValueOnce(null);
  await expect(service.analyzeBook("non-existent")).rejects.toThrow("BOOK_NOT_FOUND");
});
```

### Route Handler 测试

使用 `NextRequest` mock，不启动 HTTP Server：

```ts
import { NextRequest } from "next/server";

it("returns 400 for invalid pagination", async () => {
  const req = new NextRequest("http://localhost/api/admin/books?page=abc");
  const res = await GET(req);
  const body = await res.json();
  expect(res.status).toBe(400);
  expect(body.success).toBe(false);
});
```

### 纯函数测试

无副作用函数直接调用，不 mock：

```ts
it("normalizes book title", () => {
  expect(normalizeBookTitle("  儒林外史  ")).toBe("儒林外史");
});
```

---

## fixture 管理

- 简单 fixture 直接在测试文件内用 `const` 定义（不超过 5 个字段）
- 跨测试文件复用的 fixture 放在 `src/server/modules/<module>/__fixtures__/` 目录
- 不使用外部 fixture 库（`factory-girl` 等），保持最小依赖

---

## 禁止模式

| 禁止 | 原因 |
|------|------|
| 在 `vi.mock` 工厂内直接 `vi.fn()` 而不用 `vi.hoisted` | 变量提升问题，运行时报 undefined |
| 测试共享可变状态（未在 `beforeEach` 重置） | 测试顺序依赖，CI 随机失败 |
| `as any` 用于跳过类型检查（生产代码） | 隐藏类型错误；测试中 `as never` 可接受 |
| 直接测试 Prisma SQL / Neo4j Cypher 的返回格式 | 集成测试范畴，当前项目不跑集成测试 |
| 覆盖率 `/* istanbul ignore */` 注释 | 必须找到真实测试方法，不得跳过 |

---

## 代码案例与原因

反例：

```ts
// 未用 vi.hoisted，mock 工厂内直接 vi.fn()
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    book: { create: vi.fn() } // 运行时报错：vi 在工厂执行时未定义
  }
}));
```

正例：

```ts
const hoisted = vi.hoisted(() => ({
  prisma: { book: { create: vi.fn() } }
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: hoisted.prisma
}));
```

原因：`vi.mock` 的工厂函数在模块求值前被提升执行，`vi.fn()` 尚未可用。`vi.hoisted` 确保 mock 对象在提升阶段已创建，`vi.mock` 工厂只做引用传递。
