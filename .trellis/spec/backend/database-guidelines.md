# 数据库规范

> [SYNC-NOTE]
> 角色：事实基准（供 agents 使用）
> 主文档：.trellis/spec/backend/database-guidelines.md
> 镜像文档：.trellis/spec/backend/database-guidelines.zh.md
> 最近同步：2026-03-03
> 同步负责人：codex


## 当前技术栈

- 主 ORM：Prisma（`src/server/db/prisma.ts`）
- 生成的 client/models：`src/generated/prisma/**`（只读）

## 必须遵循的模式

- 多实体写入必须使用 `prisma.$transaction(...)`。
- 幂等重跑流程在插入前应先清理过期草稿数据。
- 大批量写入优先使用 `createMany`，并先在内存完成主键去重。

## 现有参考

- `src/server/modules/analysis/services/ChapterAnalysisService.ts`

## 反模式

- 手动编辑 `src/generated/prisma/**`。
- 关联表写入缺少明确事务边界。

---

## 代码案例与原因

反例：
```ts
await prisma.biographyRecord.deleteMany({ where: { chapterId } });
await prisma.biographyRecord.createMany({ data: rows });
await prisma.relationship.createMany({ data: relRows });
```

正例：
```ts
await prisma.$transaction(async (tx) => {
  await tx.biographyRecord.deleteMany({ where: { chapterId } });
  await tx.biographyRecord.createMany({ data: rows });
  await tx.relationship.createMany({ data: relRows });
});
```

原因：
- 多表写入必须原子化，否则中途失败会产生半成功脏数据。
- 使用事务可把重试语义与一致性语义绑定，降低数据修复成本。
