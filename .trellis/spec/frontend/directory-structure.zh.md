# 目录结构

> [同步说明]
> 角色：中文镜像（供人阅读）
> 主文档：.trellis/spec/frontend/directory-structure.md
> 镜像文档：.trellis/spec/frontend/directory-structure.zh.md
> 最后同步：2026-03-03
> 同步人：codex


> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/frontend/directory-structure.md
> Mirror: .trellis/spec/frontend/directory-structure.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


> 本项目前端代码的组织方式。

---

## 概览

项目基于 App Router，并保持清晰的分层边界：
- `app`：路由与路由局部 UI。
- `components`：可复用 UI/布局基础构件。
- `features`：特性级组合与重导出边界。
- `providers`：全局 React providers。
- `types`：前后端可共享的类型契约。

---

## 目录布局

```text
src/
|- app/
|  |- layout.tsx
|  |- page.tsx
|  |- globals.css
|  |- (admin)/analyze/
|  |  |- page.tsx
|  |  |- AnalyzeButton.tsx
|  \- api/analyze/route.ts
|- components/
|  |- layout/Navbar.tsx
|  |- ui/{Button,Card,Badge,Table}.tsx
|  |- ThemeToggle.tsx
|  \- system/ThemeToggle.tsx
|- features/
|  \- analyze/components/AnalyzeButton.tsx
|- providers/ThemeProvider.tsx
\- types/{analysis,api}.ts
```

---

## 模块组织规则

1. 路由入口文件放在 `src/app/**/page.tsx`，默认使用 Server Components。
2. 路由专属的交互部分优先与路由目录同级放置（colocate）。
3. 共享基础组件统一放在 `src/components/ui`。
4. 若路由组件需要在 `app` 外部导入，应在 `src/features/**` 下提供重导出。

---

## 命名约定

- React 组件文件：PascalCase（`AnalyzeButton.tsx`、`ThemeProvider.tsx`）。
- 路由文件：遵循 Next.js 约定（`page.tsx`、`layout.tsx`、`route.ts`）。
- 工具/类型文件：小写 kebab 或简洁名词（`analysis.ts`、`api.ts`）。
- 对于 `components/ui` 与路由动作组件，建议一文件一个导出组件。

---

## 真实示例

- 带 DB 读取的服务端路由页面：`src/app/(admin)/analyze/page.tsx`
- 可复用布局组件：`src/components/layout/Navbar.tsx`
- Feature 重导出边界：`src/features/analyze/components/AnalyzeButton.tsx`
