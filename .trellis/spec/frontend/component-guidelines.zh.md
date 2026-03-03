# 组件指南

> [同步说明]
> 角色：中文镜像（供人阅读）
> 主文档：.trellis/spec/frontend/component-guidelines.md
> 镜像文档：.trellis/spec/frontend/component-guidelines.zh.md
> 最后同步：2026-03-03
> 同步人：codex


> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/frontend/component-guidelines.md
> Mirror: .trellis/spec/frontend/component-guidelines.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


> 本项目中的组件构建方式。

---

## 概览

组件遵循简单分层：
- 读多写少的页面优先使用 Server Components。
- 仅在需要 hooks/浏览器事件时使用 Client Components。
- 可复用 UI 基元放在 `components/ui`，并使用强类型 props。

---

## 组件结构

标准顺序：
1. 按需添加指令（`"use client"`）。
2. 外部导入。
3. 内部导入。
4. Props 类型/接口。
5. 常量。
6. 组件实现。

示例：
- 使用 hooks 的客户端组件：`src/components/ThemeToggle.tsx`
- 服务端页面组件：`src/app/(admin)/analyze/page.tsx`
- UI 基元：`src/components/ui/Button.tsx`

---

## Props 约定

- 每个组件的 props 类型必须先声明，再使用，命名为
  `<ComponentName>Props`（例如 `ButtonProps`、`AnalyzeButtonProps`）。
- 使用显式 `interface` 或 `type`，必要时扩展原生 HTML props。
- 保持 props 精简且聚焦。
- 变体类 props 使用可辨识联合类型（discriminated union）。

示例：
- 扩展 HTML props：`src/components/ui/Button.tsx` 中的 `ButtonProps`
- 小而聚焦的 props：`src/app/(admin)/analyze/AnalyzeButton.tsx` 中的 `AnalyzeButtonProps`
- 变体联合：`src/components/ui/Button.tsx` 中的 `variant?: "outline" | "ghost"`

---

## 复用与拆分策略

- 当逻辑或样式在 2 处及以上复用时，优先抽为可复用、可组合组件。
- 避免过度拆分为语义弱的小组件。
- 仅在满足以下任一条件时拆分组件：
  - 存在清晰的领域边界。
  - 具备复用价值。
  - 能显著提升可测试性/可读性。
- 一个组件只负责一个连贯的 UI 关注点。

---

## 可读性与 JSX 规则

- 优先使用提前返回、具名布尔变量和 helper render 函数。
- 尽量避免在 JSX 中使用三元运算符。
- 禁止嵌套三元运算符。
- 若必须使用三元，保持单层且非常简短。

---

## 性能基线

- 保持渲染树稳定：在高频渲染路径中避免不必要地重建昂贵对象/函数。
- 仅在性能分析或明显渲染抖动时再做 memo 优化；可读性优先。
- 重计算优先下沉到服务端层或独立 hooks/utilities。

---

## 样式模式

- 默认使用 Tailwind 工具类。
- 暗色模式类与亮色模式类写在同一元素上配对出现。
- 条件类名使用模板字符串，并保持清晰的布尔分支。

示例：
- 支持主题的布局外壳：`src/app/layout.tsx`
- 导航激活/未激活样式：`src/components/layout/Navbar.tsx`
- 状态驱动按钮样式：`src/app/(admin)/analyze/AnalyzeButton.tsx`

---

## 可访问性

- 交互图标必须提供文本替代（`aria-label` 或可见文本）。
- `button` 应显式声明 `type`。
- 保持语义化结构（`main`、`header`、表格元素）以支持屏幕阅读器。

示例：
- 带标签的图标按钮：`src/components/ThemeToggle.tsx`
- 显式按钮类型：`src/components/ui/Button.tsx`
- 语义化表格标记：`src/components/ui/Table.tsx`

---

## 常见错误（避免）

- 仅一个子组件需要 hooks，却把整棵路由树标记为客户端组件。
- 不复用 `components/ui` 基元，重复实现工具样式逻辑。
- 向共享组件传入未类型化的 `any` props。
