# 前端开发指南

> [同步说明]
> 角色：中文镜像（供人阅读）
> 主文档：.trellis/spec/frontend/index.md
> 镜像文档：.trellis/spec/frontend/index.zh.md
> 最后同步：2026-03-03
> 同步人：codex


> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/frontend/index.md
> Mirror: .trellis/spec/frontend/index.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


> 本项目的前端开发最佳实践。

---

## 概览

本目录记录了 Wen Yuan 当前前端实现方式
（Next.js App Router + React + Tailwind CSS）。

新前端开发应将这些文档作为可执行规则。

---

## 指南索引

| 指南 | 说明 | 状态 |
|-------|-------------|--------|
| [目录结构](./directory-structure.md) | 模块组织与文件布局 | Ready |
| [组件指南](./component-guidelines.md) | 组件模式、props、组合方式 | Ready |
| [Hook 指南](./hook-guidelines.md) | 客户端 hooks 与共享 hook 约定 | Ready |
| [状态管理](./state-management.md) | 本地状态、服务端状态、Action 状态 | Ready |
| [Zustand Store 模板](./zustand-store-template.md) | 标准 store 目录、命名、selector、action 模式 | Ready |
| [质量指南](./quality-guidelines.md) | 代码标准与评审清单 | Ready |
| [类型安全](./type-safety.md) | 类型模式与运行时守卫 | Ready |

---

## 范围

- 覆盖 `src/app`、`src/components`、`src/features`、`src/providers` 下的文件。
- 仅后端标准见 `.trellis/spec/backend`。

---

**Language**: Write guideline docs in English.
