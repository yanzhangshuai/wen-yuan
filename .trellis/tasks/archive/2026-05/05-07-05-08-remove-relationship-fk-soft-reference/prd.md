# 移除关系类型硬 FK 约束，知识库降级为软参考层

## Goal

移除 `Relationship.relationshipTypeCode` 对 `RelationshipTypeDefinition.code` 的硬 FK 约束，让 `relationshipTypeCode` 成为自由文本。知识库继续存在作为可选的 curation/config 层，在查询时通过批量加载 + 内存 join 提供展示增强。

同时放大 AI prompt 的自主命名能力（允许自创 UPPER_SNAKE_CASE 代码），去除 analysis schema 中 `relationshipTypeCode` 和 `unknownTypeProposal` 的 XOR 约束。

## Core Principle

**Knowledge base is a soft reference layer, not a hard prerequisite.**
AI output is always preserved. KB lookup is a best-effort display enhancement.

## Requirements

1. Prisma schema: 删除 `Relationship.relationshipType` relation field，`relationshipTypeCode` 退化为普通 String
2. analysis.ts: 删除 `aiRelationshipSchema`/`aiRelationshipEventSchema` 的 XOR `.refine()`；删除 `normalizeAiRelationshipRecord`/`normalizeAiRelationshipEventRecord` 中 "code 与 proposal 冲突则丢弃" 的检查
3. ChapterAnalysisService.ts: 字典查找失败时不再返回 null——code 直接写入，字典仅用于 `directionMode` 判断；失败时默认 DIRECTIONAL
4. prompts.ts: 空字典提示改为鼓励 AI 自创 UPPER_SNAKE_CASE 描述性 code
5. prompt-template-baselines.ts: 更新重点 3/4，允许自创 code；JSON 示例移除 unknownTypeProposal 范例
6. 图查询 (getBookGraph/findPersonaPath/getPersonaById): 引入批量 KB 名称查找替代 Prisma relation 的 include
7. relationshipts 模块 (listBookRelationships/getPersonaPair): 同上
8. 更新所有相关测试
9. 创建 DB migration 移除 FK

## Acceptance Criteria

- [ ] 所有关系记录无论字典命中与否都能正常持久化
- [ ] 图谱边 type 字段显示 `name ?? code`（有字典用中文名，无字典用 code）
- [ ] 348 个测试全部通过
- [ ] TypeScript 类型检查通过
- [ ] Prisma migration 创建成功（移除 FK constraint）

## Out of Scope

- UnknownRelationshipTypeDraft 审核 UI 增强
- 关系类型自动合并/去重

## Technical Notes

- 涉及 12+ 文件大范围改动
- DB FK: `relationships.relationship_type_code` REFERENCES `relationship_type_definitions.code`
- 公共辅助函数 `lookupRelationshipTypeDisplayNames(codes)` 放置于 `src/server/modules/relationships/` 或 `src/server/modules/knowledge/`
