---
stage: mvp
---

# React 规范

> 面向本项目 React 19 的组件编写约定。

---

## 核心规则（强制）

**组件渲染阶段的异步读取，统一使用 `use()`。**

- 适用：Server Components、Client Components 的渲染期数据读取。
- 不适用：事件处理函数（点击提交等），事件回调可继续使用 `async/await`。

---

## 为什么这样做

1. 统一渲染语义：异步读取入口一致，减少团队内实现分歧。
2. 与 Suspense 对齐：loading 状态由 Suspense 边界统一处理。
3. 与 Error Boundary 对齐：异步错误通过边界处理，避免组件内散乱兜底。
4. 降低竞态风险：减少 `useEffect + setState` 拉数导致的竞态与闪烁。
5. 更利于服务端优先：便于在 Server Components 中直接消费 Promise。

---

## 代码案例

## 案例 1：Server Component 读取异步数据

反例：
```tsx
import { getBookDetail } from "@/server/modules/project/services/project-service";

export default async function Page() {
  const book = await getBookDetail("book-1");
  return <main>{book.title}</main>;
}
```

正例：
```tsx
import { use } from "react";

import { getBookDetail } from "@/server/modules/project/services/project-service";

export default function Page() {
  const book = use(getBookDetail("book-1"));
  return <main>{book.title}</main>;
}
```

原因：
- 渲染期异步读取统一为 `use()`，保持组件风格一致。
- 让 Suspense/Error Boundary 成为唯一的 loading/error 承载点。

## 案例 2：Client Component 消费 Promise props

Server Parent：
```tsx
import { Suspense } from "react";

import { ChapterPanel } from "@/components/ChapterPanel";
import { getChapter } from "@/server/modules/analysis/services/ChapterAnalysisService";

export default function AnalyzePage() {
  const chapterPromise = getChapter("chapter-1");

  return (
    <Suspense fallback={<div>加载中...</div>}>
      <ChapterPanel chapterPromise={chapterPromise} />
    </Suspense>
  );
}
```

Client Child：
```tsx
"use client";

import { use } from "react";

interface ChapterPanelProps {
  chapterPromise: Promise<{ title: string }>;
}

export function ChapterPanel({ chapterPromise }: ChapterPanelProps) {
  const chapter = use(chapterPromise);
  return <section>{chapter.title}</section>;
}
```

原因：
- Promise 在父级创建并下传，子组件渲染时通过 `use()` 读取，边界清晰。
- 避免在客户端渲染函数里即兴发请求造成重复请求或状态抖动。

## 案例 3：并发读取多个异步结果

正例：
```tsx
import { use } from "react";

import { getBooks, getProfiles } from "@/server/modules/project/services/project-service";

export default function DashboardPage() {
  const [books, profiles] = use(Promise.all([getBooks(), getProfiles()]));
  return <main>{books.length + profiles.length}</main>;
}
```

原因：
- 用 `Promise.all` + `use()` 显式表达并发，减少 waterfall。

---

## 禁用模式

- 在组件渲染期使用 `useEffect + setState` 做首次数据拉取。
- 在 Client Component 渲染函数内创建不稳定 Promise 再传给 `use()`。
- 同一功能中混用 `await` 渲染读取和 `use()` 渲染读取。
- 使用 SWR（`useSWR`）做首屏渲染数据加载（该场景已由 `use()` + Suspense 覆盖）。
- 在首帧 SSR 可见属性中直接使用浏览器本地状态（如 `theme`、`localStorage`、`window.matchMedia`）计算选中态/样式态。

---

## Hydration 安全：浏览器本地状态

当 UI 状态依赖浏览器环境（`next-themes`、`localStorage`、媒体查询）时，服务端与客户端首帧值天然可能不同。

反例（会触发 hydration 属性不一致）：
```tsx
"use client";
import { useTheme } from "next-themes";

function ThemeCard({ value }: { value: string }) {
  const { theme } = useTheme();
  return <button aria-pressed={theme === value}>...</button>;
}
```

正例（首帧一致，挂载后再应用本地状态）：
```tsx
"use client";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

function ThemeCard({ value }: { value: string }) {
  const { theme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const selectedTheme = mounted ? theme : null;
  return <button aria-pressed={selectedTheme === value}>...</button>;
}
```

原因：
- 服务端无法读取用户浏览器本地偏好，直接参与首帧渲染会导致属性差异。
- hydration warning 经常只报“属性不一致”，不会自动修复，且会污染调试信号。

### 主题逻辑复用规则（强制）

涉及主题选中态（`aria-pressed`、`data-selected`、class 切换）时，不允许在业务组件里重复实现 `mounted` 门控。

必须：
- 统一复用共享 hook（`useHydratedTheme`）获取 `isHydrated` 与 `selectedTheme`。
- 组件在 `!isHydrated` 时渲染稳定占位或中性态，避免首帧属性漂移。

反例（每个组件各自实现 mounted，行为易漂移）：
```tsx
const { theme } = useTheme();
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);
const selectedTheme = mounted ? theme : null;
```

正例（统一走共享语义）：
```tsx
const { isHydrated, selectedTheme, setTheme } = useHydratedTheme();
if (!isHydrated) return <ThemeSkeleton />;
<button aria-pressed={selectedTheme === "suya"} onClick={() => setTheme("suya")} />;
```

### useHydratedTheme 与 useTheme 的使用边界

必须使用 `useHydratedTheme` 的场景：
- 主题值直接影响首帧可见属性（`aria-pressed`、`data-selected`、`className`、显隐）。
- 用户在当前组件里触发主题切换（`setTheme`）并需要稳定选中态反馈。
- 页面存在多个主题选择入口，需要统一 hydration 语义。

可以直接使用 `useTheme` 的场景：
- 主题只用于挂载后副作用/绘制（如 canvas、D3、第三方实例更新），不参与 SSR 首帧关键属性。
- 组件本身已明确在 mounted 后才渲染主题分支，且不会暴露首帧属性差异。

评审检查项：
- 新增主题逻辑时，先判断“是否影响首帧属性”。若是，默认接入 `useHydratedTheme`。
- 若选择直连 `useTheme`，PR 描述中需写明“为何不会造成 SSR/CSR 首帧不一致”。

---

## 客户端轮询（SWR）

**轮询不属于渲染期数据读取**——状态变化驱动（如解析进度）属于客户端事件，使用 SWR `refreshInterval`。

SWR 使用范围严格限定：
- ✅ `refreshInterval` 条件轮询（回调返回 `0` 停止）
- ❌ 首屏数据加载（改用 `use()` + Suspense）

```tsx
"use client";
import useSWR from "swr";

const fetcher = (url: string) => fetch(url).then(r => r.json()).then(r => r.data);

export function AnalysisProgress({ bookId }: { bookId: string }) {
  const { data } = useSWR(`/api/books/${bookId}/status`, fetcher, {
    refreshInterval: (data) =>
      data?.status === "COMPLETED" || data?.status === "ERROR" ? 0 : 2000,
  });
  return <span>{data?.status ?? "PROCESSING"}</span>;
}
```

不引入 TanStack Query。

---

## 必须遵守

- 渲染期异步读取一律 `use()`。
- 对 `use()` 对应的 loading/error，必须在上层提供 Suspense/Error Boundary。
- Promise 尽量在父级（尤其是 Server 层）创建，子级只消费。
- 事件回调中的异步逻辑（如提交按钮点击）使用 `async/await`，不要滥用 `use()`。
- 浏览器本地状态参与 UI 关键属性时，必须使用 `mounted` 门控（或提供服务端快照），确保 SSR/CSR 首帧一致。
