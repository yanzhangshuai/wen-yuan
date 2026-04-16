# Hook 规范

> 本项目 hooks 的使用方式。

---

## 概览

项目 hooks 保持精简，聚焦 UI 交互行为与安全的客户端状态读取。

默认规则：
- 服务端数据逻辑放在服务端路由或 server actions。
- 客户端 hooks 只用于浏览器侧交互与 Hydration 安全状态。

---

## 当前共享 Hook 清单

| Hook | 位置 | 用途 |
|------|------|------|
| `useTheme` | `next-themes`（外部库） | 主题读取与切换 |
| `useHydratedTheme` | `src/components/theme/` | 带 mounted 门控的主题读取，解决 SSR Hydration 不一致 |
| `usePathname` | `next/navigation`（外部库） | 当前路由路径感知 |

> **`useHydratedTheme` 存在原因**：`useTheme` 在 SSR 首帧返回 `undefined`，直接用于 `aria-pressed`/`className` 会触发 Hydration 警告。`useHydratedTheme` 在 `useEffect` 后才暴露真实值，保证服务端/客户端首帧同值。详见 `guides/cross-layer-thinking-guide.md` 错误 5。

---

## 自定义 Hook 规则

仅在以下条件都满足时创建自定义 hook：
1. 至少被两个组件复用。
2. 包含 state/effect/event 编排（不是纯格式化函数）。
3. 相比组件内联逻辑，能明显提升可读性。

引入后的建议位置：
- 功能域 hooks：`src/features/<feature>/hooks/useXxx.ts`
- 通用 hooks：`src/components/hooks/useXxx.ts`

如果不存在复用价值，逻辑保持在组件内部。

---

## 数据读取与变更建议

- 优先在 route handlers、server actions 或 Server Components 中访问服务端数据。
- 组件渲染期异步读取统一通过 `use()`，不要用 `useEffect + setState` 做首屏拉数。
- 请求校验与数据归一化不要放在 UI hooks 中。
- 涉及变更流程时，在 UI 中明确表达 pending/success/error 状态。

> 数据请求策略（`use()` / SWR 轮询 / Server Actions）的完整规则见 `.trellis/spec/frontend/react-guidelines.md`。

---

## 命名约定

- hook 名称必须以 `use` 开头。
- 名称应体现领域意图（如 `useThemePreference`，避免 `useData`）。
- 返回结构应保持稳定且有明确类型。

---

## 常见错误（避免）

- 条件调用 hooks。
- 在 Client Component hooks 中处理仅服务端可做的逻辑。
- 为单文件一次性逻辑创建“只用一次”的自定义 hook。

---

## 代码案例与原因

反例：
```tsx
"use client";

import { useEffect, useState } from "react";

export function ChapterPanel() {
  const [chapter, setChapter] = useState<{ title: string } | null>(null);

  useEffect(() => {
    fetch("/api/analyze")
      .then((res) => res.json())
      .then((data) => setChapter(data));
  }, []);

  return <section>{chapter?.title}</section>;
}
```

正例：
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
- 渲染期读取统一使用 `use()`，由 Suspense 处理 loading，避免首屏闪烁。
- 减少 `useEffect` 拉数引发的竞态与重复请求风险。
