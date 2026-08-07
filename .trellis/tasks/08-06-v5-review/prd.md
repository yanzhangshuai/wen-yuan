# 例外审核流 + roleWorkbench 适配（Pass4）· 父任务

## Goal

实现例外优先审核（Review-by-Exception）并适配 roleWorkbench 到 v5 新模型，清掉全部 94 个 v4 类型错误。目标：审核量 = 真实歧义量，而非总事实量；roleWorkbench/图谱在新模型（entity/entity_profile/fact）下正常出数。

本任务为**归并验收父任务**，拆为 3 个可独立验证的子任务：

| 子任务 | 交付 | 验收依赖 |
|---|---|---|
| `review-service` | 审核流 service：自动接受栈 + 人审队列 + 棘轮 + 关系级幻觉定向抽样 + 跨模型复核（含新增"按 modelId 换模型"能力） | 依赖 identity 登记表 HIGH / extraction guardrails / Fact 审核字段（均已就绪） |
| `role-workbench-backend` | 清 94 类型错误：roleWorkbench 4 服务重写（chapterEvents/listDrafts/mergeSuggestions/bulkReview）+ graph 3 文件字段映射 + 5 组 API 路由修复 | 依赖 v5 数据底座（entity/fact 模型） |
| `role-workbench-frontend` | 前端适配：roleReview 组件 persona→entity 契约、重挂新路由、清死代码、bulkVerify 事务内 refreshRelationshipsForBook | 依赖 backend 子任务完成 |

## 归并验收标准（父任务最终评审）

- [x] 三个子任务各自 AC 全绿（type-check 零新增错误、测试通过）
- [x] **type-check 94 → 1**（94 个 v4 错误全清；唯一残留 `analyze/route.ts` 的 runAnalysisJobById 归 v5-pipeline）
- [x] `pnpm lint` / `pnpm test` 通过
- [x] 审核流 service 单测覆盖五条件自动接受 + 人审队列 + 棘轮 + 幻觉抽样 + 跨模型复核（25 例）
- [x] roleWorkbench 三 Tab（角色资料/章节事迹/合并建议）在新模型下正常出数
- [x] 前端 roleReview Tab 重构为只读实体档案视图（v5 不再手工建人物，写操作移除）
- [x] `mergeEntitiesInTransaction` 实体合并事务存在且被 merge 接受路径调用
- [x] 跨模型复核接口可调用（显式传 modelId 跑原语）
- [x] bulkVerify 事务内 refreshRelationshipsForBook

## Constraints

- 不做"模型自修复"闭环；校验只检测，修复走人审/非破坏自动
- 棘轮阈值初始值保守（默认多审），随实测放宽
- 跨模型复核换模型 = 调用方显式传 `modelId`（feature_models 已删，不建全局映射表）
- 管线编排（Pass4 调用审核 service）归 v5-pipeline，本任务只交付 service + 单测

## Dependencies

- 依赖 `v5-identity`（登记表 HIGH）+ `v5-extraction`（facts DRAFT + guardrails）+ `v5-goldset-eval`（校准）。
- 下游：`v5-pipeline`（审核状态衔接任务终态）。

## 调研依据

`research/role-workbench-audit.md`：94 错误分布（5 类根因）、roleWorkbench 4 服务改造矩阵、5 组 API 路由、13 前端组件契约、审核流可复用件盘点、3 个新能力缺口（mergeEntitiesInTransaction / 跨模型 modelId / 前端重挂路由）。
