# Hook 指南

> [同步说明]
> 角色：中文镜像（供人阅读）
> 主文档：.trellis/spec/frontend/hook-guidelines.md
> 镜像文档：.trellis/spec/frontend/hook-guidelines.zh.md
> 最后同步：2026-03-03
> 同步人：codex


> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/frontend/hook-guidelines.md
> Mirror: .trellis/spec/frontend/hook-guidelines.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


> 本项目中 hooks 的使用方式。

---

## 概览

当前代码库还没有共享的自定义 hooks。内建 hooks 主要用于小型客户端组件。

默认规则：优先使用 Server Components；仅在需要浏览器交互时再引入客户端 hooks。

---

## 当前 Hook 使用模式

- 导航路由状态 hook：`src/components/layout/Navbar.tsx` 中的 `usePathname`
- 主题状态 hook：`src/components/ThemeToggle.tsx` 中的 `useTheme`
- 挂载保护（`useEffect` + `useState`）：`src/components/ThemeToggle.tsx`
- Server Action hook：`src/app/(admin)/analyze/AnalyzeButton.tsx` 中的 `useActionState`

---

## 何时创建自定义 Hook

仅当逻辑在 2 个及以上组件复用，且包含状态/副作用（不只是纯格式化）时，才创建 `useXxx`。

建议落位：
- Feature 专属 hooks：`src/features/<feature>/hooks/`
- 通用 hooks：`src/components/hooks/` 或 `src/lib/hooks/`（二选一并保持一致）

---

## 数据获取指导

- 优先在 `page.tsx` 的服务端完成数据获取，再通过 props 向下传递。
- 在客户端组件中使用 hooks 处理变更/状态。
- 网络契约解析应放在 server/action 层，不要直接放到 UI hooks。

示例：
- Prisma 服务端获取：`src/app/(admin)/analyze/page.tsx`
- 客户端变更状态：`src/app/(admin)/analyze/AnalyzeButton.tsx`

---

## 命名约定

- 自定义 hook 必须以 `use` 开头。
- hook 名称应描述领域动作/状态（如 `useAnalyzeChapter`，不要用 `useData`）。
- hook 返回值保持类型明确且结构稳定。

---

## 常见错误（避免）

- 条件调用 hooks。
- 把仅服务端逻辑塞进客户端 hooks。
- 无复用价值时，为单组件场景创建一次性自定义 hooks。
