# 执行计划：v5 成本简化与知识库清理

> 前置：`08-07-v5-simplify` 已完成（当前基线）。
> 全程校验命令：`pnpm type-check` / `pnpm lint` / `pnpm test` / `pnpm prisma:generate`。
> 每步完成后跑一次 type-check；graph/roleWorkbench 的 94 个 v4 残留错误归 v5-review，本任务不动。

## 阶段 1：R1 删 STAGE_ORDER

- [ ] 1.1 `jobCostSummary.ts`：删 `STAGE_ORDER` map + byStage 的 `.sort()` 块；byStage 直接 `Array.from(stageAggMap.values()).map(...)`
- [ ] 1.2 `jobCostSummary.test.ts`（若有排序断言）同步：按出现顺序断言
- [ ] ✅ **审查门**：type-check 通过；grep `STAGE_ORDER` 零引用；成本面板测试绿

## 阶段 2：R2 schema + 服务删除

- [ ] 2.1 `prisma/schema.prisma`：删 `KnowledgeAuditLog` 模型；`pnpm prisma:generate`；建迁移（dev 库 `migrate reset` 或 create-only drop）
- [ ] 2.2 删 `knowledge/audit.ts`、`knowledge/change-logs.ts`、`knowledge/index.ts`（审计部分）
- [ ] 2.3 `skillService.ts`：删 5 处 `auditLog(...)` 调用 + `import { auditLog }`；`skillService.test.ts` 删 `vi.mock("knowledge/audit")`
- [ ] ✅ **审查门**：type-check 通过；grep `auditLog`/`KnowledgeAuditLog` 服务层零引用

## 阶段 3：R3 lookup 迁移 skills

- [ ] 3.1 移动 `knowledge/lookupTypeNames.ts` → `skills/lookupTypeNames.ts` + `lookupTypeNames.test.ts` → `skills/lookupTypeNames.test.ts`
- [ ] 3.2 `skills/index.ts` 导出 `lookupRelationshipTypeNames`
- [ ] 3.3 `getBookGraph.ts`/`findPersonaPath.ts` 导入路径改 `@/server/modules/skills`
- [ ] ✅ **审查门**：type-check 通过；grep `knowledge/lookupTypeNames` 零引用；graph 测试绿

## 阶段 4：R2 前端 + API + 导航删除

- [ ] 4.1 删 `app/admin/knowledge-base/` 目录（含 2 测试）
- [ ] 4.2 删 `api/admin/knowledge/` 目录（_shared/change-logs 两路由）
- [ ] 4.3 删 `lib/services/change-logs.ts`
- [ ] 4.4 `admin-header.tsx` 删知识库入口；`admin/page.tsx` 删知识库管理卡片
- [ ] ✅ **审查门**：`pnpm build` 前端可过；grep `knowledge-base`/`change-logs` 零引用

## 阶段 5：文档 + 回归

- [ ] 5.1 `docs/architecture/13-agent-architecture-v5.md`：v5.3 → v5.4；删 `knowledge_audit_logs` 表描述
- [ ] 5.2 全量 `pnpm type-check` / `pnpm lint` / `pnpm test`（含覆盖率）
- [ ] 5.3 goldset eval gate：`node scripts/eval/run-eval.ts`（受 v5-pipeline 阻塞，如实记录）
- [ ] 5.4 commit；`task.py validate` + `task.py finish`（完成 08-07-v5-cost-kb-cleanup）

## 回滚点

- 阶段 1 纯删排序逻辑，可单独回退。
- 阶段 2 migration 可 `migrate reset` 全量重建（dev 无生产数据）。
- 每阶段独立 commit。
