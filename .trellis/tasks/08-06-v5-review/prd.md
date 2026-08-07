# 例外审核流（Pass4）

## Goal

实现例外优先审核（Review-by-Exception）：自动接受栈 + 人审队列 + 棘轮校准 + 关系级幻觉定向兜底 + 跨模型复核接口 + roleWorkbench 适配。目标：审核量 = 真实歧义量，而非总事实量。

## Requirements

- **自动接受栈**：强置信 = 证据锚定通过 ∧ 实体在登记表 HIGH ∧ 提及数≥2 ∧ 分布式扫描干净 ∧ 确定性校验全过 → 自动落 VERIFIED（recordSource=AUTO_VERIFIED）。
- **跨片一致 = 加分项，不用于免审**（同模型多观测错误相关，独立信号来自跨模型）。
- **人审队列**：仅异常——跨片冲突 / 低置信新实体 / TITLE_ONLY 泛称 / merge-split 建议 / 关系级幻觉定向抽样 / 棘轮回查抽样。
- **MERGE/SPLIT 一律人审**（L3 责任边界）；非破坏修复（改名/补别名）才允许自动。
- **棘轮校准**：每批自动接受后抽样回查，度量自动接受准确率 → 达标放宽、不达标收紧。
- **关系级幻觉残留**（7.4）：证据锚定覆盖不到（真实实体 + 假关系），定向抽样（双方真实但证据单薄的关系边、新实体率高的分片）兜底。
- **跨模型复核接口**：定向风险集中类（同名/近名簇、多候选 TITLE_ONLY、跨卷边界、关系级幻觉样本）——复用身份判定原语换模型。
- **roleWorkbench 适配**：三 Tab 数据源迁移到新模型（entities+entity_profiles / relationships / facts），`personaId→entityId` 契约调整，bulkVerify 事务内 refreshRelationshipsForBook。

## Acceptance Criteria

- [ ] 自动接受栈五条件实现；AUTO_VERIFIED 落库区分来源
- [ ] 跨片一致不触发免审（仅加分）
- [ ] 人审队列只含异常类型；MERGE/SPLIT 无自动路径
- [ ] 棘轮校准：抽样回查 → 准确率阈值驱动放宽/收紧
- [ ] 关系级幻觉定向抽样实现（证据单薄边 + 高新实体率分片）
- [ ] 跨模型复核接口可调用（换模型跑原语）
- [ ] roleWorkbench 三 Tab 正常出数；bulkVerify 事务内重建 relationships 正确
- [ ] 行覆盖 ≥90%；`pnpm type-check`/`pnpm lint` 通过

## Constraints

- 不做"模型自修复"闭环；校验只检测，修复走人审/非破坏自动
- 棘轮阈值初始值保守（默认多审），随实测放宽
- **跨模型复核的换模型 = 调用方显式传 `modelId`**：`feature_models` 功能点映射已删除（v5-simplify），AI 调用统一系统默认模型；复核需换模型时由调用方向 `AiCallExecutor` 传目标模型 id，不建全局映射表。

## Dependencies

- 依赖 `v5-identity`（登记表 HIGH）+ `v5-extraction`（facts DRAFT）+ `v5-goldset-eval`（校准）。
- 下游：`v5-pipeline`（审核状态衔接任务终态）。
