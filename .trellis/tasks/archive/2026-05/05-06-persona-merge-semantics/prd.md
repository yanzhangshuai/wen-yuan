# 统一人物合并语义与 Profile 合并

## Goal

手动合并和建议接受走同一套合并逻辑，补上 Profile 合并，防止已删人物的建议污染工作台。

## What I Already Know

* `mergePersonas.ts` 和 `mergeSuggestions.ts` 各写了一套人物合并逻辑，后者缺少对称类型处理、RecordSource 优先级，行为不一致。
* 两个函数都不处理 `Profile` 表，导致合并后 source 的书内档案丢失。
* `listMergeSuggestions` 不过滤已软删人物的 PENDING 建议。
* RelationshipEvent 表已于 2026-05-07 删除，字段合并入 Relationship，无需单独迁移。

## Requirements

1. **统一合并核心**：从 `mergePersonas.ts` 抽出 `mergePersonasInTransaction(tx, input)` 作为唯一权威实现。`mergePersonas` 负责校验+开事务；`acceptMergeSuggestion` 负责读建议+校验状态+调核心函数+回写状态，全部在一个事务内。

2. **Profile 合并**：source 的 profile 迁移到 target。规则简单——同书冲突时 target 优先，target 字段为空才用 source 补；`localTags` 去重合并；`ironyIndex` 取 max。

3. **过滤僵尸建议**：`listMergeSuggestions` 不返回 source 或 target 已软删的 PENDING 建议；`acceptMergeSuggestion` 遇到已删人物返回明确错误。

## Acceptance Criteria

* [ ] 手动合并和建议接受走同一个核心函数，关系处理行为一致（对称类型、RecordSource 优先级）。
* [ ] source 的 profile 正确迁移到 target（无同书冲突时改绑，有冲突时合并后软删 source profile）。
* [ ] `listMergeSuggestions` 不展示 source/target 已软删的 PENDING 建议。
* [ ] 已软删人物的 PENDING 建议被 accept 时返回明确错误。
* [ ] `pnpm test src/server/modules/personas/mergePersonas.test.ts` 通过。
* [ ] `pnpm test src/server/modules/roleWorkbench/mergeSuggestions.test.ts` 通过。

## Definition of Done

* 测试覆盖两条入口的行为一致性和 Profile 合并。
* Lint / typecheck / test 通过。

## Decision

抽出 `mergePersonasInTransaction(tx, input)` 作为唯一合并实现。两个入口各司其职，共用核心。

## Out of Scope

* 不自动把 Mention 转成 BiographyRecord
* 不重跑 AI 分析
* 不做合并预览 API
* 不做合并撤销
* 不做大范围 UI 重构
* 不修复已有脏数据

## Technical Notes

* `src/server/modules/personas/mergePersonas.ts` — 手动合并服务
* `src/server/modules/roleWorkbench/mergeSuggestions.ts` — 合并建议服务（含重复合并逻辑）
* `prisma/schema.prisma` — Profile 模型含 `@@unique([personaId, bookId])`
