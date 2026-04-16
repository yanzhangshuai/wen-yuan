---
stage: mvp
skill-source: https://skills.sh/vercel-labs/next-skills/next-best-practices
---

@@@section:skill-next-best-practices

# Next.js App Router 开发最佳实践

> 基于 [vercel-labs/next-best-practices](https://skills.sh/vercel-labs/next-skills/next-best-practices) 适配，面向本项目 Next.js 16 + App Router + React 19 技术栈。

---

## 一、文件约定（File Conventions）

### App Router 特殊文件

| 文件 | 作用 | 项目中的位置 |
|------|------|------------|
| `page.tsx` | 路由页面入口 | `src/app/**/page.tsx` |
| `layout.tsx` | 共享布局（保留状态） | `src/app/**/layout.tsx` |
| `loading.tsx` | Suspense 骨架屏 | 按需创建 |
| `error.tsx` | 路由级错误边界（必须 `"use client"`） | 按需创建 |
| `not-found.tsx` | 404 页面 | 按需创建 |
| `route.ts` | API 路由处理器 | `src/app/api/**/route.ts` |
| `middleware.ts` | 边缘中间件（项目根） | `middleware.ts`（已存在） |

### 路由分段

```
src/app/
├── (viewer)/          # 路由组：不影响 URL，共享布局
├── (graph)/           # 路由组：图谱详情
├── admin/             # 管理后台
└── api/               # API 路由处理器
```

**路由组 `(folder)` 不出现在 URL 中**，仅用于共享 layout 或区分权限层级。

---

## 二、RSC 边界（RSC Boundaries）

### 核心规则

| 规则 | 说明 |
|------|------|
| 默认为 Server Component | 无 `"use client"` 声明的组件均为服务端组件 |
| Client 组件向下隔离 | `"use client"` 影响当前文件及其所有子树 |
| Server 组件不能调用 Client API | 不能在 Server 中使用 `useState`、`useEffect`、浏览器 API |
| Client 组件不能直接 `async` | Client 组件不能标记为 `async function` |

**反例：Client 组件标记 async（无效）**：
```tsx
"use client";

// ❌ 错误：async Client Component
export default async function BookCard({ id }: { id: string }) {
  const book = await getBook(id); // 不会等待
  return <div>{book.title}</div>;
}
```

**正例：在 Server Component 中 fetch，props 传递给 Client**：
```tsx
// server-side page
export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const book = await getBook(id);
  return <BookCard book={book} />;  // BookCard 可以是 Client Component
}
```

### Server Action 例外

Server Action 在 Client 组件中调用是合法的，但必须在单独文件中定义并标记 `"use server"`：

```ts
// src/app/admin/books/actions.ts
"use server";

export async function deleteBook(id: string) { ... }
```

---

## 三、异步 API 模式（Async Patterns - Next.js 15+）

Next.js 15 起，`params`、`searchParams`、`cookies()`、`headers()` 均为异步。

**反例（同步访问）**：
```tsx
// ❌ Next.js 15+ 已废弃同步访问
export default function Page({ params }: { params: { id: string } }) {
  const { id } = params; // 同步 params
}
```

**正例**：
```tsx
// ✅ 异步解构 params
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
}

// ✅ 异步读取 cookies
import { cookies } from "next/headers";
const cookieStore = await cookies();
const token = cookieStore.get("token")?.value;
```

---

## 四、数据模式（Data Patterns）

### 三种数据获取方式的选择矩阵

| 方式 | 适用场景 | 项目示例 |
|------|---------|---------|
| **Server Component 直接 fetch** | 页面级数据、SSR | `page.tsx` 中读取书籍列表 |
| **Server Action** | 表单提交、写操作 | 删除书籍、提交审核 |
| **Route Handler** | 外部系统调用、文件上传 | `src/app/api/**` |

### 避免数据瀑布流

```tsx
// ❌ 串行 fetch（瀑布流）
const book = await getBook(id);
const chapters = await getChapters(id);

// ✅ 并行 fetch
const [book, chapters] = await Promise.all([getBook(id), getChapters(id)]);
```

### Preload 模式（提前触发）

```tsx
// lib/preload.ts
export function preloadBook(id: string) {
  void getBook(id); // 提前触发，不阻塞渲染
}

// page.tsx
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  preloadBook(id); // 提前触发
  const [book] = await Promise.all([getBook(id), getSidebar()]);
  return <BookView book={book} />;
}
```

---

## 五、路由处理器（Route Handlers）

本项目在 `src/app/api/` 下有大量路由处理器，遵循以下规范：

### 基本模式

```ts
// src/app/api/admin/books/route.ts
import { type NextRequest } from "next/server";
import { successResponse, errorResponse } from "@/server/http";

export async function GET(request: NextRequest) {
  try {
    const books = await getBooks();
    return successResponse(books);
  } catch (error) {
    return errorResponse(error);
  }
}
```

### GET 处理器与 page.tsx 冲突规则

> **同一路由目录中，`page.tsx` 和 `route.ts` 不能共存。**

```
src/app/admin/books/
├── page.tsx           # ✅ 页面
└── route.ts           # ❌ 不能与 page.tsx 同目录

src/app/api/books/
└── route.ts           # ✅ 纯 API 目录，无 page.tsx
```

### 何时用 Route Handler vs Server Action

- **Route Handler**：外部系统需要调用（如移动端、第三方服务）、文件上传/下载
- **Server Action**：Next.js 应用内部表单提交、写操作（更简洁，无需 URL）

---

## 六、错误处理（Error Handling）

### 错误边界文件

```
src/app/
├── error.tsx              # 根级错误边界
├── global-error.tsx       # 捕获根 layout 错误（必须含 <html><body>）
└── admin/
    └── error.tsx          # admin 路由段错误边界
```

**`error.tsx` 必须是 Client Component**：

```tsx
"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div>
      <h2>出错了</h2>
      <button onClick={reset}>重试</button>
    </div>
  );
}
```

### 编程式跳转与 404

```ts
import { redirect, notFound } from "next/navigation";
import { unstable_rethrow } from "next/navigation";

// catch 块中必须重抛 Next.js 内部错误
try {
  const book = await getBook(id);
  if (!book) notFound();
} catch (error) {
  unstable_rethrow(error); // 重要：让 redirect/notFound 正常工作
  throw error;
}
```

---

## 七、图片优化（Image Optimization）

**规则：所有图片必须使用 `next/image`，禁止裸 `<img>` 标签。**

```tsx
import Image from "next/image";

// ✅ 正例
<Image
  src="/cover.jpg"
  alt="书籍封面"
  width={300}
  height={400}
  priority           // LCP 图片加 priority
/>

// ❌ 反例
<img src="/cover.jpg" alt="书籍封面" />
```

---

## 八、运行时选择（Runtime Selection）

| 运行时 | 特点 | 适用场景 |
|--------|------|---------|
| **Node.js**（默认） | 完整 Node API，支持 Prisma、neo4j-driver | 本项目所有路由 |
| **Edge** | 轻量，低延迟，受限 API | 本项目仅 `middleware.ts` 使用 |

**本项目中间件使用 Edge Runtime**（已在 `middleware.ts` 中），因为：
- 只做 JWT 验证（无 DB 连接）
- 路径匹配与重定向

---

## 九、自托管（Self-Hosting）

本项目已使用 Docker 部署。应在 `next.config.ts` 中添加：

```ts
const nextConfig: NextConfig = {
  output: "standalone",   // 生成独立产物，减小镜像体积
  // ...其他配置
};
```

**多实例 ISR（如有）需要外置 Cache Handler**，参见 Next.js 文档。

---

## 十、Suspense 边界（Suspense Boundaries）

使用 `useSearchParams`、`usePathname` 的 Client Component **必须**被 `Suspense` 包裹，否则触发 CSR bailout：

```tsx
// ✅ 正确用法
import { Suspense } from "react";

export default function Page() {
  return (
    <Suspense fallback={<div>加载中...</div>}>
      <SearchFilterClient />  {/* 内部使用 useSearchParams */}
    </Suspense>
  );
}
```

---

## 参考示例

见 [`examples/skills/next-skills/`](./examples/skills/next-skills/)

@@@/section:skill-next-best-practices
