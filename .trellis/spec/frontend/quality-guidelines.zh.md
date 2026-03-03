# 质量指南

> [同步说明]
> 角色：中文镜像（供人阅读）
> 主文档：.trellis/spec/frontend/quality-guidelines.md
> 镜像文档：.trellis/spec/frontend/quality-guidelines.zh.md
> 最后同步：2026-03-03
> 同步人：codex


> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/frontend/quality-guidelines.md
> Mirror: .trellis/spec/frontend/quality-guidelines.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


> 前端开发的代码质量标准。

---

## 概览

前端质量意味着：渲染边界可预测、UI 原子能力保持一致、错误/加载反馈清晰明确。

---

## 禁止模式

- 仅叶子组件需要交互时，却给整页添加 `"use client"`。
- 不复用 `components/ui`，而是重复造设计原子。
- 异步操作出现静默失败状态。
- 在客户端组件中导入后端生成文件。

---

## 必需模式

- 路由层默认使用 Server Components。
- 所有共享组件都使用显式的类型化 props/interface。
- 新增 UI 区块必须包含暗色模式 class 对应。
- 优先使用语义化 HTML（`main`、`header`、`table` 等）。
- 将本地 UI 状态、服务端数据状态、表单/动作状态分离，避免职责混杂。
- 命名要简洁且可读；避免含义不清的短名（`a`、`tmp`）和无区分价值的超长名。
- 对非平凡的 UI 状态切换、异步交互流程和边界处理，补充意图导向注释。
- 列表密集页面需保证 `key` 稳定；当数据量可能增长时优先分页/虚拟化。

---

## 测试与验证要求

当前交付前的基线：
1. 运行 `pnpm lint`。
2. 手动检查本次 UI 变更影响的关键流程。
3. 验证改动组件在亮色与暗色模式下的显示。
4. 验证由 action 触发操作的加载与错误提示路径。
5. 至少验证一条成功路径、一条失败路径和一个边界场景。

---

## 代码评审清单

- 服务端/客户端边界是否最小且有明确意图？
- prop 类型是否显式且收敛？
- className 条件分支是否可读、可维护？
- 必要位置是否具备空态/加载态/错误态？
- import 是否一致遵循项目别名（`@/...`）？
- 命名是否简洁、可读，并与后端/领域术语一致？
- 复杂代码块的注释是否足以支持快速排障？
- 状态归属是否清晰拆分（UI vs 服务端数据 vs 表单/action）？
- 列表渲染路径是否避免了不稳定 key 和明显的过度渲染风险？
- 过长或深层嵌套的渲染/控制逻辑是否拆分为可读 helper？

---

## 真实参考

- 服务端/客户端拆分：`src/app/(admin)/analyze/page.tsx` 和
  `src/app/(admin)/analyze/AnalyzeButton.tsx`
- UI 原子复用：`src/components/ui/*`
- 主题安全渲染：`src/components/ThemeToggle.tsx`
