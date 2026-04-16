@@@section:skill-next-cache-components

# Next.js Cache Components 缓存策略

> 基于 [vercel-labs/next-cache-components](https://skills.sh/vercel-labs/next-skills/next-cache-components) 适配，面向本项目 Next.js 16 的 PPR（Partial Prerendering）与 `use cache` 指令。

---

## 一、启用 Cache Components

在 `next.config.ts` 中开启（替代旧的 `experimental.ppr`）：

```ts
// next.config.ts
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,  // 启用 PPR + use cache
  // ...其他配置
};
```

> **注意**：当前项目 `next.config.ts` 尚未启用此选项。启用前请评估全站影响，尤其是已有的动态路由。

---

## 二、三种内容类型

启用 Cache Components 后，页面内容分为三类：

### 1. 静态（Static）— 构建时预渲染

同步代码、纯计算、静态导入，构建时直接生成 HTML：

```tsx
export default function BookHeader() {
  return (
    <header>
      <h1>文渊知识图谱</h1>
      <nav>...</nav>
    </header>
  );
}
```

### 2. 缓存（Cached）— `use cache` 指令

异步数据但不需要每次请求都刷新，标记 `'use cache'` 后由框架自动管理生命周期：

```tsx
import { cacheLife, cacheTag } from "next/cache";

async function BookList() {
  "use cache";
  cacheLife("hours");          // 缓存 1 小时
  cacheTag("book-list");       // 打标签，便于失效

  const books = await getBooks();
  return <ul>{books.map(b => <li key={b.id}>{b.title}</li>)}</ul>;
}
```

### 3. 动态（Dynamic）— Suspense 包裹

运行时必须实时获取的数据，放在 `Suspense` 边界内流式传输：

```tsx
import { Suspense } from "react";

export default function DashboardPage() {
  return (
    <>
      <BookList />                           {/* 缓存 */}
      <Suspense fallback={<Spinner />}>
        <AnalysisStatus />                   {/* 动态 */}
      </Suspense>
    </>
  );
}

async function AnalysisStatus() {
  // 读取 cookies 等运行时 API → 必须是动态组件
  const userId = (await cookies()).get("userId")?.value;
  const status = await getAnalysisStatus(userId);
  return <StatusBadge status={status} />;
}
```

---

## 三、`use cache` 指令

可在三个粒度使用：

### 文件级（整个页面缓存）

```tsx
"use cache";

export default async function BookDetailPage() {
  const books = await getBooks();
  return <div>{books.length} 本书</div>;
}
```

### 组件级

```tsx
export async function PersonaList({ bookId }: { bookId: string }) {
  "use cache";
  cacheTag(`personas-${bookId}`);

  const personas = await getPersonas(bookId);
  return <PersonaGrid personas={personas} />;
}
```

### 函数级

```tsx
export async function getCachedGraphData(bookId: string) {
  "use cache";
  cacheLife("hours");
  return getGraphData(bookId);
}
```

---

## 四、缓存生命周期（cacheLife）

### 内置 Profile

```ts
cacheLife("minutes")   // 约 1 分钟（stale）、5 分钟（revalidate）
cacheLife("hours")     // 约 1 小时（stale）、4 小时（revalidate）
cacheLife("days")      // 约 1 天（stale）、7 天（revalidate）
cacheLife("weeks")     // 约 1 周（stale）、1 个月（revalidate）
cacheLife("max")       // 最大缓存（等同于 force-static）
```

### 自定义配置

```ts
cacheLife({
  stale     : 3600,    // 1 小时：从 CDN 提供旧缓存
  revalidate: 7200,    // 2 小时：后台重新验证
  expire    : 86400,   // 1 天：强制过期
});
```

---

## 五、缓存失效（Cache Invalidation）

### `cacheTag()` — 打标签

```ts
async function getPersonas(bookId: string) {
  "use cache";
  cacheTag("personas", `personas-${bookId}`);
  return db.persona.findMany({ where: { bookId } });
}
```

### `updateTag()` — 立即失效（同请求内可见）

```ts
"use server";
import { updateTag } from "next/cache";

export async function mergePersonas(targetId: string, sourceId: string) {
  await doMerge(targetId, sourceId);
  updateTag(`personas-${bookId}`);  // 本次请求内立即生效
}
```

### `revalidateTag()` — 后台重新验证（下次请求生效）

```ts
"use server";
import { revalidateTag } from "next/cache";

export async function createBook(data: FormData) {
  await db.book.create({ data: parseBookData(data) });
  revalidateTag("book-list");  // 后台触发，下次请求看到新数据
}
```

---

## 六、运行时数据约束

**不能**在 `use cache` 函数内部调用 `cookies()`、`headers()`、`searchParams`：

```tsx
// ❌ 错误：运行时 API 在 use cache 内部
async function CachedPersonaCard() {
  "use cache";
  const userId = (await cookies()).get("userId")?.value;  // 报错！
}

// ✅ 正确：在外层获取，作为参数传入
async function PersonaCardWrapper() {
  const userId = (await cookies()).get("userId")?.value;
  return <CachedPersonaCard userId={userId} />;
}

async function CachedPersonaCard({ userId }: { userId?: string }) {
  "use cache";
  // userId 作为 props 会自动成为缓存 key 的一部分
  const data = await getPersonaData(userId);
  return <div>{data.name}</div>;
}
```

### 例外：`use cache: private`

需要访问运行时 API 且无法重构时，使用私有缓存（不存入共享缓存层）：

```ts
async function getUserData() {
  "use cache: private";
  const session = (await cookies()).get("session")?.value;  // 允许
  return fetchUserData(session);
}
```

---

## 七、缓存键自动生成

`use cache` 的缓存键自动基于：
- **Build ID**（每次部署后所有缓存失效）
- **函数位置哈希**
- **可序列化的 props/arguments**
- **闭包中的外层变量**

```ts
async function getBookChapters(bookId: string, filter: string) {
  "use cache";
  // 缓存键 = BuildID + 函数位置 + bookId + filter
  return db.chapter.findMany({ where: { bookId, type: filter } });
}
```

---

## 八、从旧 API 迁移

| 旧 API | 新 API |
|--------|--------|
| `experimental.ppr` | `cacheComponents: true` |
| `unstable_cache()` | `use cache` 指令 |
| `dynamic = 'force-static'` | `use cache` + `cacheLife('max')` |
| `revalidate = N` | `cacheLife({ revalidate: N })` |
| `options.tags` | `cacheTag()` |

**`unstable_cache` 迁移示例**：

```ts
// 旧写法
import { unstable_cache } from "next/cache";

const getCachedBooks = unstable_cache(
  async () => db.book.findMany(),
  ["book-list"],
  { tags: ["books"], revalidate: 3600 }
);

// 新写法
async function getCachedBooks() {
  "use cache";
  cacheTag("books");
  cacheLife({ revalidate: 3600 });
  return db.book.findMany();
}
```

---

## 九、限制

- **不支持 Edge Runtime**：`use cache` 需要 Node.js 运行时
- **不支持静态导出**（`output: 'export'`）
- **非确定性值**（`Math.random()`、`Date.now()`）在 `use cache` 内只执行一次（构建时）

---

## 参考示例

见 [`examples/skills/next-skills/`](./examples/skills/next-skills/)

@@@/section:skill-next-cache-components
