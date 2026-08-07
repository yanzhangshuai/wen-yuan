# Pass4 审核流 service

## Goal

实现例外优先审核（Review-by-Exception）核心 service：自动接受栈 + 人审队列 + 棘轮校准 + 关系级幻觉定向抽样 + 跨模型复核接口。交付可单测的 `review/` 模块（管线编排归 v5-pipeline，本任务只交付 service + 单测）。

> 依据：`docs/architecture/13-agent-architecture-v5.md` §7（自动接受 §7.1 / 人审队列 §7.2 / 棘轮 §7.3 / 幻觉抽样 §7.4）；父任务 `research/role-workbench-audit.md` §5（可复用件盘点 + 3 个能力缺口）。

## Requirements

- **R1 自动接受栈**：一条 fact 自动落 VERIFIED（recordSource=AUTO_VERIFIED）需五条件全过——①证据锚定（名字在本章正文可证，复用 `runGuardrails.isNameInText`）②实体在登记表 HIGH（读 `getRegistry` 的 `ConfidenceTier.HIGH`）③提及数 ≥2 ④分布式冲突扫描干净（复用 `conflictScan`）⑤确定性校验全过（关系码在 skill 契约闭集 + 方向正确 + 不与已有事实冲突）。跨片一致只加分不免审。
- **R2 人审队列**：仅异常类型——跨片冲突 / 低置信新实体 / TITLE_ONLY 泛称 / merge-split 建议 / 关系级幻觉定向抽样 / 棘轮回查抽样。MERGE/SPLIT 一律人审（无自动路径）；非破坏修复（改名/补别名）才允许自动。
- **R3 棘轮校准**：每批自动接受后抽样回查，度量自动接受准确率 → 达标放宽 / 不达标收紧。阈值常量新建（`review/` 模块内，初始保守）。
- **R4 关系级幻觉定向抽样**：证据锚定覆盖不到（真实实体 + 假关系），定向抽样"双方真实但证据单薄的关系边 + 新实体率高分片" → 进跨模型复核 / 人审。
- **R5 跨模型复核接口**：定向风险集中类（同名/近名簇、多候选 TITLE_ONLY、跨卷边界、关系级幻觉样本）复用身份判定原语换模型。
- **R6 跨模型换模型能力**（前置缺口）：`AiCallExecutor.execute` 支持显式传 `modelId`（现硬编码默认模型）；`defaultModel.ts` 新增 `loadModelById`。

## Acceptance Criteria

- [ ] 自动接受栈五条件实现；AUTO_VERIFIED 落库区分来源
- [ ] 跨片一致不触发免审（仅加分）
- [ ] 人审队列只含异常类型；MERGE/SPLIT 无自动路径
- [ ] 棘轮校准：抽样回查 → 准确率阈值驱动放宽/收紧
- [ ] 关系级幻觉定向抽样实现（证据单薄边 + 高新实体率分片）
- [ ] 跨模型复核接口可调用（显式传 modelId 跑原语）
- [ ] `AiCallExecutor.execute` 支持 modelId 覆盖 + `loadModelById` 存在
- [ ] 行覆盖 ≥90%；`pnpm type-check`/`pnpm lint` 通过

## Constraints

- 不做"模型自修复"闭环；校验只检测，修复走人审/非破坏自动
- 棘轮阈值初始保守（默认多审），随实测放宽
- 跨模型换模型 = 调用方显式传 `modelId`（不建全局映射表）
- 管线编排（Pass4 调用本 service）归 v5-pipeline，本任务不实现管线

## Dependencies

- 依赖 `v5-identity`（登记表 HIGH + runPrimitive + conflictScan）+ `v5-extraction`（guardrails 证据锚定 + relationshipCodes 闭集）+ `v5-skill-loading`（契约取码）。
- 下游：`v5-pipeline`（Pass4 接入）+ 父任务 `v5-review`（归并验收）。
