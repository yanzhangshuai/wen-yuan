# 简化关系类型系统

## Goal

将关系类型系统从「双层类型 + 审批状态机 + 关系事件分离」简化为「AI 直接输出中文 code + 单表落库」，去掉 unknown_relationship_type_drafts、unknown_relationship_type_occurrences、relationship_events 三张表，保留 relationship_type_definitions 作为可选元数据。

## What I Already Know

* `relationshipTypeCode` 在 `relationships` 表中已是自由文本（VARCHAR 120），无 FK 约束。
* AI prompt 目前要求输出 UPPER_SNAKE_CASE code（如 `FATHER_SON`），但匹配不上字典 hash code 时关系被静默丢弃。
* `unknown_relationship_type_drafts` + `occurrences` 有完整审批流程（PENDING→APPROVED/REJECTED/MERGED + BIND_EXISTING/CREATE_NEW），但用户不需要。
* `relationship_events` 存储每章互动事件（summary/evidence/attitudeTags），与 `relationships` 分离维护。
* `relationship_type_definitions` 有 20 个预设类型（COMMON_RELATIONSHIP_TYPES seed）和 9 个分组。
* 图谱显示、人物详情、审核工作台都依赖 relationships 和 relationshipEvents 两张表。

## Requirements

### 核心变更

* 删表：`unknown_relationship_type_drafts`、`unknown_relationship_type_occurrences`、`relationship_events`。
* `relationships` 表合并 relationship_events 的关键字段：`chapterId`、`evidence`、`attitudeTags`、`summary`。
* `relationshipTypeCode` 改为 AI 直接输出中文（如 `父子`、`师生`），不再使用 UPPER_SNAKE_CASE 或 hash code。
* AI prompt 中移除「字典 code」和 unknownTypeProposal 相关指令，改为直接输出中文关系名。
* 分析服务（ChapterAnalysisService）中移除字典匹配逻辑，AI 输出的任何中文 code 都直接创建 relationship，不丢弃。
* `relationship_type_definitions` 保留但去掉 seed 数据（COMMON_RELATIONSHIP_TYPES），去掉 initialize-common API，改为空库启动 + 管理员按需手动添加。
* 未知关系类型的审批页面、API 路由、服务函数全部删除。

### code 同名处理

* 同一书内同一对人同一 code 只保留一条 relationship（现在是这个行为，保持不变）。

### 图谱显示

* 图谱边标签直接用 `relationshipTypeCode` 中文值显示。
* 如有对应的 `relationship_type_definitions` 定义，用其 directionMode 控制边方向；无定义时默认 SYMMETRIC。

### 管理后台

* 知识库「关系类型」页面保留，但不再做初始化 seed。
* 加一个「code 使用统计」视图：列出所有 relationships 中出现过的 code + 使用次数，方便管理员识别需要补充定义的高频类型。

### 迁移

* 现有 `relationship_events` 数据：每条 event 合并为一条新的 relationship（同 sourceId/targetId/code 且同 chapterId 的可能需要去重策略）。
* 现有 `unknown_relationship_type_drafts` 数据：直接丢弃（不再使用，无需迁移）。
* 现有 relationships 中 UPPER_SNAKE_CASE 的 code：迁移脚本将其转为中文（如 `FATHER_SON` → `父子`），无法自动映射的保留原值由人工处理。

## Acceptance Criteria

* [ ] AI 分析产出的中文 code 直接写入 relationships，无数据丢失。
* [ ] `unknown_relationship_type_drafts` 表和所有相关代码已删除。
* [ ] `relationship_events` 表已删除，关键字段合并到 `relationships`。
* [ ] `initialize-common` API 和相关 seed 已删除。
* [ ] 图谱边标签显示中文关系名。
* [ ] 人物详情页不再依赖 relationship_events 表。
* [ ] 审核工作台的关系编辑不再依赖 events 子表。
* [ ] 迁移脚本可运行，现有数据不丢失。
* [ ] `pnpm type-check` 通过。
* [ ] 相关测试更新并通过。

## Definition of Done

* 三张表从 schema 移除 + 迁移脚本就绪。
* 分析 prompt 改为输出中文关系 code。
* 管理后台未知类型审核页下线，知识库关系类型页去掉 seed。
* `.trellis/spec/backend/relationship-structure.md` 更新为新契约。
* Lint / typecheck / test 通过。

## Technical Approach

单次重构，按依赖顺序：

1. Schema 变更：删 3 张表，合并 events 字段到 relationships。
2. 迁移脚本：events → relationships，code 中文映射。
3. 服务层：删 unknown-relationship-types 模块、删 relationship-events 路由、改 ChapterAnalysisService 去字典匹配、改 mergePersonas 等不再处理 events。
4. Prompt 变更：改 prompt-template-baselines 中的关系输出指引。
5. 前端：删未知类型审核页、改关系编辑表单去 events、改图谱/详情不再读 events。
6. 清理 seed、测试更新。

## Decision (ADR-lite)

**Context**: 双层类型 + 审批 + events 分离对古典文学知识图谱过度工程化，且 AI 自创 code 被静默丢弃导致数据丢失。
**Decision**: code 直接使用 AI 输出的中文，单表落库，relationship_type_definitions 作为可选元数据不预设不 seed。
**Consequences**: 管理后台失去类型审批工作流（但用户不需要），历史 events 数据合并后可能重复（需去重策略）。

## Out of Scope

* 不实现关系类型自动生成（AI 生成 code 之外的自动化）。
* 不修改角色详情 UI 布局（只改数据源）。
* 不处理人物合并任务（05-06-persona-merge-semantics）。

## Open Questions

* （已解决）迁移策略：同 sourceId/targetId/code 取最早 chapterId 的行，`DISTINCT ON (sourceId, targetId, code) ORDER BY chapterId ASC`。

## Technical Notes

* Schema: `prisma/schema.prisma` — Relationship, RelationshipEvent, UnknownRelationshipTypeDraft, UnknownRelationshipTypeOccurrence, RelationshipTypeDefinition
* 分析服务: `src/server/modules/analysis/services/ChapterAnalysisService.ts`
* Prompt: `src/server/modules/knowledge/prompt-template-baselines.ts`
* 未知类型服务: `src/server/modules/knowledge/unknown-relationship-types.ts`
* 未知类型 API: `src/app/api/admin/knowledge/unknown-relationship-types/`
* 关系事件 API: `src/app/api/relationship-events/`
* 知识库页面: `src/app/admin/knowledge-base/relationship-types/`
* 审核组件: `src/components/review/relationship-event-form.tsx`, `relationship-events-tab.tsx`
* 图谱: `src/server/modules/books/getBookGraph.ts`, `src/components/graph/`
* 人物详情: `src/server/modules/personas/getPersonaById.ts`
* Seed: `src/server/modules/knowledge/relationship-types.ts` (COMMON_RELATIONSHIP_TYPES)
