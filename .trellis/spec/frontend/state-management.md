# 状态管理

> 本项目状态管理约定。

---

## 概览

状态管理保持轻量，并按所有权拆分：
- 本地 UI 状态放在 Client Components 内部。
- 全局跨页面 UI 状态目前仅使用主题 context。
- 服务端拥有的数据在服务端入口读取与变更。

---

## 状态分类

### 本地 UI 状态

- 本地 mounted guard：`src/components/ThemeToggle.tsx`
- 基于 pathname 的导航激活状态：
  `src/components/layout/Navbar.tsx`

### 全局 UI Context 状态

- 主题 provider context：`src/providers/ThemeProvider.tsx`
- 主题消费组件：`src/components/ThemeToggle.tsx`

### 服务端状态

- API 变更与响应封装：`src/app/api/analyze/route.ts`
- 服务端变更与 revalidate：`src/server/actions/analysis.ts`

---

## 全局 Store 策略

当前未使用独立全局客户端 store。

仅在以下条件同时满足时再引入：
1. 多个相距较远的客户端组件需要共享可写状态。
2. props/context 组合已明显不合理。
3. 状态更新频率足以抵消 store 带来的复杂度。

在此之前，优先使用本地状态或 context。

---

## 服务端状态规则

- 在边界层校验请求 payload（`route.ts` / server action）。
- DB/网络编排逻辑放在 `src/server/**`。
- 写操作后按需执行路由缓存 revalidate。

真实示例：
- `src/server/actions/analysis.ts` 中的 `revalidatePath("/analyze")`

---

## 常见错误（避免）

- 将服务端拥有的数据复制为长期客户端状态。
- 单页面局部交互也强行抽成全局状态。
- 在展示组件中混入校验/解析逻辑。

---

## 代码案例与原因

反例：
```tsx
"use client";

import { useEffect, useState } from "react";

export function BookList() {
  const [books, setBooks] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/books")
      .then((res) => res.json())
      .then((data) => setBooks(data.books));
  }, []);

  return <section>{books.length}</section>;
}
```

正例：
```tsx
import { use } from "react";

import { getBooks } from "@/server/modules/project/services/project-service";

export default function BooksPage() {
  const books = use(getBooks());
  return <main>{books.length}</main>;
}
```

原因：
- 服务端状态留在服务端，减少客户端缓存副本和一致性问题。
- 状态所有权清晰后，调试路径更短，错误定位更快。
