# 技术设计：v5 成本简化与知识库清理

> 文档基线：`docs/architecture/13-agent-architecture-v5.md`（v5.3）
> 关联任务：`08-07-v5-simplify`（已完成）

## 0. 设计原则

- **当前结构唯一真理**：阶段名不是固定契约，硬编码排序随阶段演进腐化；知识库概念已无实体，残留审计一并删除。
- **最小必要**：问题 1 只删 STAGE_ORDER（不改变聚合维度/API/前端）；问题 2 只删知识库残留，保留真正被消费的 lookup 工具。

## 1. R1 · 删 STAGE_ORDER 硬编码排序

**现状**：`jobCostSummary.ts` 中 `STAGE_ORDER` map 定义 4 个 stage 名，`byStage` 排序用它（未知 stage 排最后）。logs 已按 `createdAt asc` 读入，`stageAggMap` 是 Map（插入序=首次出现序）。

**改动**：
- 删 `STAGE_ORDER` map 定义（约 6 行）。
- 删 `byStage` 的 `.sort(...)` 块（约 10 行），改为直接 `Array.from(stageAggMap.values()).map(...)`——Map 天然保序（日志首次出现顺序）。
- 不改 `JobCostSummaryDto` 结构、不改 API 路径 `/api/admin/analysis-jobs/[jobId]/cost-summary`、不改前端 analysis-jobs-panel。

> 影响：成本面板按阶段出现顺序展示（SKILL_SELECT→ROSTER_DISCOVERY→TITLE_RESOLUTION→INDEPENDENT_EXTRACTION 恰为实际执行顺序），无行为倒退。

## 2. R2 · 删除知识库概念（方案 B：连审计一起删）

### 2.1 删除面

| 层 | 项 | 处置 |
|---|---|---|
| Schema | `KnowledgeAuditLog`（`knowledge_audit_logs`）表 | prisma schema 删模型 + 迁移 drop |
| 服务 | `knowledge/audit.ts`（auditLog） | 删文件 |
| 服务 | `knowledge/change-logs.ts`（listChangeLogs/getChangeLog） | 删文件 |
| 服务 | `knowledge/index.ts` | 删文件（审计部分）；`lookupRelationshipTypeNames` 迁 skills（见 R3） |
| 服务 | `knowledge/lookupTypeNames.test.ts` | 随迁移到 skills 域（路径更新） |
| 前端 | `knowledge-base/` 全套（layout/nav/page/change-logs 两页 + 2 测试） | 删目录 |
| API | `api/admin/knowledge/`（_shared/change-logs 两路由） | 删目录 |
| lib | `lib/services/change-logs.ts` | 删文件 |
| 业务 | `skillService.ts` 5 处 `auditLog(...)` 调用 | 删调用 + `import { auditLog }` |
| 测试 | `skillService.test.ts` 的 `vi.mock("knowledge/audit")` | 删 mock |
| 导航 | `admin-header.tsx` 知识库入口、`admin/page.tsx` 知识库管理卡片 | 删入口 |

### 2.2 边界确认

- `KnowledgeAuditLog` 表删除后，skill 操作不再留审计——用户明确接受（方案 B）。
- `analysis_phase_logs`（任务阶段日志）保留，不受影响。

## 3. R3 · lookupRelationshipTypeNames 迁入 skills 域

**现状**：`knowledge/lookupTypeNames.ts` 导出 `lookupRelationshipTypeNames`，从 active+enabled skill 的 relationshipCodes 契约取码名，被 getBookGraph（334）/findPersonaPath（342）消费。

**改动**：
- 迁移到 `src/server/modules/skills/lookupTypeNames.ts`（或并入 content-schema 相邻位置——按"最小修改"原则，独立文件迁移路径最清晰）。
- `skills/index.ts` 导出 `lookupRelationshipTypeNames`。
- getBookGraph/findPersonaPath 导入改为 `@/server/modules/skills`。
- `lookupTypeNames.test.ts` 迁移到 `skills/lookupTypeNames.test.ts`，路径更新。

## 4. 关键边界

| 场景 | 处理 |
|---|---|
| 阶段名非固定契约 | 删 STAGE_ORDER 后 stage 字符串仍在 `analysis_phase_logs.stage` 与 `callIdentityLlm` 调用点（真实执行标签），只是不再硬编码排序 |
| 知识库删除后 admin 导航 | admin-header 删"知识库"入口；admin/page.tsx 删知识库管理卡片 |
| `lookupRelationshipTypeNames` 归属 | 它操作 skill 契约，属 skills 域；graph 通过 skills 模块导入 |
| migration | dev 库 `migrate reset` 全量重建；或 create-only migration drop 表 |

## 5. 风险与对策

- **前端 knowledge-base 测试**（layout.test/knowledge-base-nav.test）随目录删除一并移除。
- **skillService 测试**：删 auditLog mock 后，其余断言不受影响（auditLog 是副作用，无断言依赖）。
- **graph 导入路径**：迁移 lookup 后需同步 getBookGraph/findPersonaPath 两处导入，防编译断链。
- **goldset**：不改提取逻辑，eval gate 状态同前（受 v5-pipeline 阻塞）。

## 6. 文档同步

- `docs/architecture/13-agent-architecture-v5.md`：版本 v5.3 → v5.4；删 `knowledge_audit_logs` 表描述（§6 数据表行）、"变更日志"相关表述。
- 父任务 `08-06-agent-arch-v5-redesign`：无需改（本任务为收尾，不新增 Phase）。
