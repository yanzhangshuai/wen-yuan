# 统一人物合并语义与角色资料合并

## Goal

让“人物合并”在手动合并、合并建议接受、角色资料展示三个场景中具有一致且可解释的语义：合并同一人物时，必须统一迁移事迹、提及、关系、关系事件，并按明确规则合并书内 `Profile` 档案，避免用户看到“已合并但角色资料仍很少/不完整”的结果。

## What I Already Know

* 用户案例：将“马二先生”合并到“马纯上”后，马纯上别名已包含马二先生，但生平时间轴只有 3 条。
* 当前数据库中“马二先生”已软删，且有效 `BiographyRecord`、`Mention`、`Relationship`、`RelationshipEvent` 均为 0；“马纯上”有效 `BiographyRecord` 为 3，`Mention` 为 33。
* 当前手动合并入口 `/api/personas/merge` 会迁移 `BiographyRecord`、`Mention`、`Relationship`、`RelationshipEvent`，但不会处理 `Profile`。
* 当前合并建议接受入口 `/api/admin/merge-suggestions/:id/accept` 另写了一套合并逻辑，与手动合并路径不一致；它也不处理 `Profile`，且重复关系/自环分支的事件迁移弱于 `mergePersonas`。
* 当前还有一条 PENDING 合并建议指向已软删人物：`马纯上 -> 马二先生`，方向与用户实际合并方向相反。
* 角色详情里的“生平时间轴”来自 `BiographyRecord`；“人物小传/书内标签/头衔/讽刺指数”来自 `Profile`；“原文提及”来自 `Mention`，不会自动变成事迹。

## Assumptions

* 人物合并的权威服务应该只有一个，建议接受路径应复用同一服务。
* `Profile` 是角色资料语义的一部分，用户期望人物合并时也能合并或至少可解释地保留。
* 当前任务优先解决后端数据一致性；前端提示增强可以作为同任务小范围补充，但不做大 UI 重构。

## Requirements

* 统一人物合并实现：
  * 抽出事务内核心函数，例如 `mergePersonasInTransaction(tx, input)`，作为唯一权威合并实现。
  * `mergePersonas` 只负责输入校验与开启事务，然后调用 `mergePersonasInTransaction`。
  * `acceptMergeSuggestion` 只负责建议状态机校验、在同一事务内调用 `mergePersonasInTransaction`、回写建议状态。
  * 手动合并和接受建议必须在事迹、提及、关系、关系事件、别名、源人物软删除方面行为一致。
  * 不允许在 `acceptMergeSuggestion` 的外层事务中再调用带 `$transaction` 的 `mergePersonas`，避免嵌套事务或事务边界不清。
* 补齐 `Profile` 合并语义：
  * source 有某本书 profile、target 没有同书 profile：将 source profile 改绑到 target。
  * source 和 target 同一本书都有 profile：保留 target profile，合并 source 信息后软删 source profile。
  * `localTags` 去重合并。
  * `localName` 默认保留 target，source 的 `localName`/source 名称通过 persona aliases 保留。
  * `localSummary`、`officialTitle`、`moralTier`、`firstAppearanceChapterId` 采用“target 非空优先；target 为空时补 source”的规则。
  * `firstAppearanceChapterId` 从 source 补到 target 前，必须防御性确认章节属于该 profile 的 `bookId`。
  * `ironyIndex` 采用 `max(target, source)`，避免合并后丢失更强烈的讽刺标注。
  * `visualConfig` 默认保留 target；target 为空时补 source。
* 合并统计与可解释性：
  * `mergePersonas` 返回值增加 profile 相关统计，例如 `redirectedProfileCount`、`mergedProfileCount`、`deletedProfileCount`。
  * API 或前端至少能拿到明确统计，便于显示“迁移了多少事迹/提及/关系/档案”。
* 残留合并建议处理：
  * 接受建议时，如果 source/target 任一人物已软删，返回明确冲突错误。
  * 列表或刷新流程不应让指向已软删人物的 PENDING 建议继续作为可接受建议展示。
  * MVP 推荐列表过滤隐藏已软删人物相关的 PENDING 建议，同时接受接口继续返回明确冲突错误；是否追加后台自动失效状态可后续扩展。
  * 合并成功后，与 source 软删人物相关的其他 PENDING 建议应在列表层不可见，避免污染工作台。
* 口径说明：
  * 在代码契约和必要的 UI 文案中区分 `BiographyRecord` 事迹、`Mention` 提及、`Profile` 档案。

## Acceptance Criteria

* [ ] 手动合并 source -> target 后，source 的有效 `BiographyRecord` 全部改绑到 target。
* [ ] 手动合并 source -> target 后，source 的有效 `Mention` 全部改绑到 target。
* [ ] 手动合并 source -> target 后，source 相关 `Relationship`/`RelationshipEvent` 按现有关系契约正确迁移、去重或软删。
* [ ] source 有 profile、target 没有同书 profile 时，profile 改绑到 target，详情页可在 target 下看到该档案。
* [ ] source/target 同书都有 profile 时，target profile 被补齐，`localTags` 去重合并，source profile 被软删或变为不可见。
* [ ] source profile 的 `firstAppearanceChapterId` 只有在章节属于同一 `bookId` 时才会补到 target profile。
* [ ] 接受合并建议与手动合并使用同一个核心合并逻辑，测试覆盖两条入口的行为一致性。
* [ ] 接受合并建议的“读取建议、校验状态、合并人物、回写 ACCEPTED”处于同一个事务中。
* [ ] 指向已软删人物的 PENDING 合并建议不能被成功接受，并且用户/调用方能收到明确错误。
* [ ] 合并建议列表不会继续展示 source/target 已软删的 PENDING 建议作为可接受项。
* [ ] 合并结果统计包含 profile 相关数量。
* [ ] 重复关系和自环关系分支不会丢失 `RelationshipEvent`，事件冗余端点与保留关系保持一致。
* [ ] `pnpm test src/server/modules/personas/mergePersonas.test.ts` 通过。
* [ ] `pnpm test src/server/modules/roleWorkbench/mergeSuggestions.test.ts` 通过。

## Definition of Done

* Tests added/updated for unit and integration-level service behavior.
* Lint/typecheck/test commands relevant to changed files pass.
* `.trellis/spec/` 更新人物合并契约，记录 `Profile` 合并规则和合并建议复用权威服务的要求。
* 如更新 `.trellis/spec/`，同步到 `src/templates/markdown/spec/` 中对应模板。
* 当前“马纯上/马二先生”数据残留处理方案明确；是否执行数据修复需单独确认。

## Technical Approach

### Recommended Approach: Transactional Core + Single Authoritative Semantics

新建或导出内部核心函数，例如：

```ts
mergePersonasInTransaction(tx, input): Promise<MergePersonasResult>
```

该函数承载完整人物合并语义：`BiographyRecord`、`Mention`、`Relationship`、`RelationshipEvent`、`Profile`、aliases、source 软删除、统计结果。

调用边界：
* `mergePersonas(input)`：对外的手动合并服务。负责 `sourceId !== targetId` 等入口校验，开启 `$transaction`，调用 `mergePersonasInTransaction`。
* `acceptMergeSuggestion(suggestionId)`：合并建议接受服务。负责在同一个 `$transaction` 中读取建议、校验 `PENDING`、校验人物未软删、调用 `mergePersonasInTransaction`、更新建议为 `ACCEPTED`。

Pros:
* 从结构上消除两套合并逻辑漂移。
* 复用现有 `mergePersonas` 的关系/关系事件复杂处理。
* 事务边界清晰，建议状态更新与人物合并不会出现半成功。
* 测试边界清晰，手动合并和建议合并只需验证入口差异。

Cons:
* 需要调整 `mergePersonas` 的内部结构，拆出事务内核心函数。
* 需要调整现有 `mergeSuggestions.test.ts` mock 结构。

### Alternative Approach: Service-Level Reuse Without Extracting Core

让 `acceptMergeSuggestion` 直接调用现有 `mergePersonas(input)`，再回写建议状态。

Pros:
* 表面改动更少。
* 不需要暴露新的内部函数。

Cons:
* `acceptMergeSuggestion` 本身需要事务包裹状态机校验和回写，直接调用带 `$transaction` 的 `mergePersonas` 会导致嵌套事务或事务边界分裂。
* 可能出现人物已合并但建议状态未更新，或建议状态校验与合并之间发生并发漂移。
* 不推荐作为本任务实现方案。

### Rejected Approach: Patch Merge Suggestion Logic In Place

直接把 `mergeSuggestions.ts` 里的合并逻辑补齐到与 `mergePersonas` 一致。

Rejected because:
* 继续保留两套高风险业务逻辑，后续仍会漂移。
* 本次问题的根因之一就是合并语义重复实现。

## Proposed MVP Scope

In:
* 后端统一合并服务。
* `Profile` 合并策略。
* 合并建议接受路径复用事务内核心合并函数。
* 服务层测试覆盖。
* 合并契约 spec 更新。
* 对已软删人物合并建议的不可接受保护。
* 列表层隐藏 source/target 已软删的 PENDING 合并建议。
* 前端现有合并预览文案小幅调整为“预估”口径（如改动很小可纳入；大范围预览重构不纳入）。

Out:
* 不自动把 `Mention` 生成 `BiographyRecord`。
* 不重跑 AI 分析来补齐马纯上事迹。
* 不做大范围角色资料 UI 重构。
* 不实现完整后端 merge preview API。
* 不实现合并撤销。
* 不直接改生产/本地数据库残留数据，除非用户明确确认。

## Expansion Sweep

### Future Evolution

* 后续可以支持“合并预览”：在执行前返回将迁移/合并/软删的 profile、bio、mention、relationship 数量。
* 后续可以支持“合并撤销”：基于审计日志恢复 source persona 与关联记录。

### Related Scenarios

* 删除人物预览已经有级联影响概念，合并预览可以复用类似思想。
* 角色资料工作台的“章节事迹”“合并建议”“角色资料”需要统一解释事迹、提及、档案三类数据。

### Failure & Edge Cases

* source/target 同一本书 profile 冲突。
* source/target 任一人物已软删。
* 合并后关系形成自环。
* 合并后关系唯一键冲突。
* 重复点击接受建议造成并发状态冲突。
* `Profile.firstAppearanceChapterId` 指向章节与目标书籍不一致时需防御。
* 合并成功后，其他仍指向 source 的 PENDING 建议成为 stale suggestions。
* `acceptMergeSuggestion` 重复提交或并发提交时，只有第一次能从 `PENDING` 成功进入 `ACCEPTED`。

## Technical Notes

* Existing authoritative service: `src/server/modules/personas/mergePersonas.ts`.
* Manual merge UI: `src/components/review/manual-entity-tool.tsx`.
* Suggestion accept UI: `src/components/review/entity-merge-tool.tsx`.
* Suggestion service with duplicate merge logic: `src/server/modules/roleWorkbench/mergeSuggestions.ts`.
* Persona detail aggregation: `src/server/modules/personas/getPersonaById.ts`.
* Detail panel distinguishes profile and timeline: `src/components/graph/persona-detail-panel.tsx`.
* Schema models: `Persona`, `Profile`, `BiographyRecord`, `Mention`, `Relationship`, `RelationshipEvent`, `MergeSuggestion` in `prisma/schema.prisma`.
* Existing relation merge contract: `.trellis/spec/backend/relationship-structure.md`.
* Existing role workbench data contract: `.trellis/spec/backend/role-workbench-character-events.md`.

## Open Questions

* `Profile` 冲突合并时，`ironyIndex` 暂按 `max(target, source)` 作为 MVP 决策；如后续发现语义不符合产品预期，再改为人工冲突处理。
* 指向已软删人物的 PENDING 合并建议，MVP 采用“列表过滤隐藏 + 接受时报冲突”；是否增加 `INVALID` 状态或后台自动标记，留到后续审计需求明确后再做。
* source/target 同书 `localSummary` 都非空时，MVP 保留 target，不拼接 source；后续如需要可做“冲突摘要待人工确认”。

## Decision (ADR-lite)

Use a transactional core merge function as the single source of truth. Manual persona merge and merge-suggestion acceptance must call the same core so relationship events, profile merge semantics, aliases, soft deletion, and result statistics cannot drift between entry points.
