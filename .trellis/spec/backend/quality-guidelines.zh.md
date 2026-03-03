# Backend Quality Guidelines

> [同步说明]
> 角色：中文镜像（供人阅读）
> 主文档：.trellis/spec/backend/quality-guidelines.md
> 镜像文档：.trellis/spec/backend/quality-guidelines.zh.md
> 最后同步：2026-03-03
> 同步人：codex


> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/backend/quality-guidelines.md
> Mirror: .trellis/spec/backend/quality-guidelines.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


## 交接前检查清单

- `pnpm lint` 通过。
- 响应契约与 `src/types/api.ts` 保持一致。
- 错误分支返回稳定、可机器读取的 `code` 值，而不仅是文本消息。
- 多表写入的事务边界明确。
- 对外 service/action 函数包含团队 JSDoc 模板。
- 新增或变更的 env 契约已文档化。
- 命名简洁、可读，并与 frontend/domain 术语保持一致。
- 复杂业务逻辑包含足够注释，说明意图、约束、错误分支与副作用。
- 高复杂度函数应拆分为可读辅助函数，避免深层嵌套或超大单体代码块。
- 对变更后的后端行为至少验证一个成功路径、一个失败路径和一个边界场景。

## 评审重点

- 跨层类型漂移（action -> service -> DB）。
- 错误路径一致性（`code/message/error/meta`）。
- AI/外部集成的重试与失败行为。
- 命名清晰度与跨层术语一致性。
- 非平凡分支与事务流程的注释质量。
- 函数复杂度与可读性（长度、嵌套、helper 抽取）。
