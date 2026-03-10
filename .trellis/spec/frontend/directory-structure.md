---
stage: mvp
---

# 目录结构

> 本项目前端代码的组织方式。

---

## 概览

前端采用轻量分层结构：
- `app`：路由入口与路由级样式。
- `components`：可复用 UI、布局组件、客户端交互组件。
- `providers`：全局 React providers。
- `types`：前端可安全消费的共享契约类型。

`src/server/**` 仅限服务端使用，Client Components 禁止直接导入。

---

## 目录布局

```text
src/
|- app/
|  |- layout.tsx
|  |- page.tsx
|  |- globals.css
|  \- api/analyze/route.ts
|- components/
|  |- layout/Navbar.tsx
|  |- ThemeToggle.tsx
|  |- system/ThemeToggle.tsx
|  \- ui/{Button,Card,Badge,Table}.tsx
|- providers/ThemeProvider.tsx
|- types/{analysis,api}.ts
\- server/...
```

---

## 模块组织规则

1. 路由入口文件统一放在 `src/app/**`，遵循 Next.js 命名约定
   （`page.tsx`、`layout.tsx`、`route.ts`）。
2. 可复用基础组件放在 `src/components/ui`，在业务位置组合使用。
3. 布局层公共模块放在 `src/components/layout`。
4. `src/components/system` 仅用于系统级封装或 re-export。
5. 全局 provider 统一放在 `src/providers`。
6. 跨层共享 TypeScript 契约放在 `src/types`，不要散落在组件文件中。

---

## 命名约定

- 组件文件名：PascalCase（`ThemeToggle.tsx`、`Navbar.tsx`）。
- Next.js 路由文件：框架约定名（`page.tsx`、`layout.tsx`、`route.ts`）。
- 类型模块：简洁名词（`analysis.ts`、`api.ts`）。
- 组件根 DOM 的 className 必须使用语义化 kebab-case
  （`home-page`、`layout-navbar`、`ui-button`），不要使用
  `wrapper`、`container` 这类泛化名称。

---

## 真实示例

- 路由外壳与 provider 注入：`src/app/layout.tsx`
- 首页路由入口：`src/app/page.tsx`
- 可复用导航模块：`src/components/layout/Navbar.tsx`
- 可复用 UI 基础组件：`src/components/ui/Button.tsx`

---

## 代码案例与原因

反例：
```tsx
"use client";

import { prisma } from "@/server/db/prisma";

export function BookClientPanel() {
  // 客户端组件直接触达 server/db 层（错误）
  void prisma.book.findMany();
  return <section>...</section>;
}
```

正例：
```tsx
import { getBooks } from "@/server/modules/project/services/project-service";

export default function Page() {
  const booksPromise = getBooks();
  return <main>{/* Promise 交给子组件按规范消费 */}</main>;
}
```

原因：
- 目录边界清晰后，依赖方向稳定，避免 client 直接依赖 server。
- 结构稳定时，后续重构（拆模块、迁移文件）成本显著降低。
