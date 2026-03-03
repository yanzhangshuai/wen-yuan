# Database Guidelines

> [同步说明]
> 角色：中文镜像（供人阅读）
> 主文档：.trellis/spec/backend/database-guidelines.md
> 镜像文档：.trellis/spec/backend/database-guidelines.zh.md
> 最后同步：2026-03-03
> 同步人：codex


> [SYNC-NOTE]
> Role: Source of truth (for agents)
> Canonical: .trellis/spec/backend/database-guidelines.md
> Mirror: .trellis/spec/backend/database-guidelines.zh.md
> Last synced: 2026-03-03
> Sync owner: codex


## 当前技术栈

- 主 ORM：Prisma（`src/server/db/prisma.ts`）
- 生成的 client/models：`src/generated/prisma/**`（只读）

## 必须遵循的模式

- 涉及多实体写入时，必须使用 `prisma.$transaction(...)`。
- 幂等重跑流程在插入前应先清理过期的草稿行。
- 大批量写入优先使用 `createMany`，并先在内存中完成去重。

## 现有参考

- `src/server/modules/analysis/services/ChapterAnalysisService.ts`

## 反模式

- 手动编辑 `src/generated/prisma/**`。
- 关联表之间的部分写入缺少事务边界。
