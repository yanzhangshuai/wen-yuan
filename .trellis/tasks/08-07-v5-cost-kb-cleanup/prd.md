# PRD: v5 成本简化与知识库清理

> 目标基线：`docs/architecture/13-agent-architecture-v5.md`（v5.3）
> 关联任务：`08-07-v5-simplify`（已完成，本任务延续其"当前结构唯一真理"原则）

## 背景

v5-simplify 已删除模型选择、死字段与死业务代码。继续按"当前结构唯一真理"收尾两处残留：

1. **`STAGE_ORDER` 硬编码阶段排序**：`jobCostSummary.ts` 用 4 个写死的 stage 名（SKILL_SELECT/ROSTER_DISCOVERY/TITLE_RESOLUTION/INDEPENDENT_EXTRACTION）做成本明细排序。阶段名本身不是固定契约，硬编码排序会随阶段演进腐化。用户确认**保持按 job 聚合**（一个 FULL_BOOK 任务≈一本书），只删硬编码排序，byStage 按出现顺序展示。

2. **知识库概念残留**：知识库内容表（prompt_templates/book_types/relationship_types 等）已在 v5 删净，但 `knowledge` 模块还残留一套**技能变更审计**（`KnowledgeAuditLog` 表 + auditLog + change-logs 页 + skillService 5 处写入）。用户确认**连审计一起删除**（方案 B）——知识库概念彻底移除，审计能力一并放弃。

> `lookupRelationshipTypeNames`（knowledge/lookupTypeNames.ts）不是审计，是**图谱 DTO 的运行时工具**（从 skill 契约取关系码名，被 getBookGraph/findPersonaPath 消费），**保留并迁移到 skills 域**，不删除。

## 需求

| # | 需求 | 说明 |
|---|------|------|
| R1 | 删 STAGE_ORDER 硬编码排序 | `jobCostSummary.ts` 删 `STAGE_ORDER` map + byStage 的 sort 块；byStage 按日志出现顺序（Map 插入序）展示；**保持按 job 聚合**（API 路径/前端面板不变） |
| R2 | 删除知识库概念 | 删 `KnowledgeAuditLog` 表 + `knowledge/` 模块审计部分 + `knowledge-base/` 前端 + `api/admin/knowledge/` + `lib/services/change-logs.ts` + skillService 5 处 auditLog 调用 + admin 导航知识库入口 |
| R3 | lookupRelationshipTypeNames 迁入 skills 域 | 该函数是 skill 契约工具，移到 `skills/` 模块；graph/findPersonaPath 导入路径更新；知识库概念删除后模块归属正确 |

## 验收标准

- **AC1**：`grep -rn "STAGE_ORDER\|SKILL_SELECT\|ROSTER_DISCOVERY\|TITLE_RESOLUTION\|INDEPENDENT_EXTRACTION"` src 零命中（阶段名不再作为硬编码契约；`callIdentityLlm` 调用点保留 stage 字符串，但 STAGE_ORDER 引用为零）。
- **AC2**：`grep -rn "KnowledgeAuditLog\|auditLog\|change-logs\|knowledge-base\|listChangeLogs\|getChangeLog"` src 零命中（含测试）。
- **AC3**：`lookupRelationshipTypeNames` 存在于 skills 域，getBookGraph/findPersonaPath 正常导入；`knowledge` 目录删除。
- **AC4**：成本面板（analysis-jobs-panel）仍正常按 job 展示 byStage 明细（无 STAGE_ORDER 排序，按出现顺序）。
- **AC5**：`pnpm type-check` / `pnpm lint` / `pnpm test` 通过；goldset eval gate 不回退（受 v5-pipeline 阻塞同前）。

## 非目标

- 不做按书跨 job 聚合（用户确认保持按 job）。
- 不改 `analysis_phase_logs` 表结构；不改前端面板布局（只删 STAGE_ORDER 排序逻辑）。
- 不动 Skill 域本体（isEnabled/Status/Category）；auditLog 从 skillService 删除后不引入替代审计。
