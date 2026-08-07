# 执行计划：Pass4 审核流 service

> 前置：v5-simplify / v5-cost-kb-cleanup 已完成（当前基线）。
> 全程校验命令：`pnpm type-check` / `pnpm lint` / `pnpm test`。
> graph/roleWorkbench 的 94 个 v4 错误归 role-workbench-backend 子任务，本任务不处理（但本任务改动文件需 type-check 零错误）。

## 阶段 1：跨模型换模型能力（前置缺口）

- [ ] 1.1 `models/defaultModel.ts`：新增 `loadModelById(modelId)`（复用 runtimeModelSelect + toResolvedFeatureModel；校验存在/isEnabled/Key 可解密）
- [ ] 1.2 `AiCallExecutor.ts`：`ExecuteAiCallInput` 加 `modelId?`；`execute` 按 modelId 覆盖默认模型；`modelSource` 写 `CROSS_MODEL`（modelId 存在时）
- [ ] 1.3 `AiCallExecutor.test.ts`：加 modelId 覆盖用例（传 modelId → loadModelById；缺省 → loadSystemDefaultModel）
- [ ] 1.4 `defaultModel.test.ts`：loadModelById 单测（存在/不存在/停用/缺 Key）
- [ ] ✅ **审查门**：type-check 零新增；AiCallExecutor/defaultModel 测试绿

## 阶段 2：审核流模块骨架

- [ ] 2.1 建 `review/` 模块（index/errors/config）：`ReviewError` 族 + 棘轮/抽样阈值常量（初始保守）
- [ ] 2.2 `identity/llm.ts`：`callIdentityLlm` 加 `modelId?` 透传（或新增 withModel 入口）
- [ ] ✅ **审查门**：type-check 通过；模块结构可编译

## 阶段 3：自动接受栈（autoAccept.ts）

- [ ] 3.1 `acceptFactsForJob(jobId)`：五条件逐条判定（证据锚定/登记表 HIGH/提及数≥2/冲突扫描/契约校验）
- [ ] 3.2 AUTO_VERIFIED 落库（status=VERIFIED + recordSource=AUTO_VERIFIED + reviewedAt/reviewedBy）
- [ ] 3.3 未过分类：按缺失条件归类进人审队列
- [ ] 3.4 单测：五条件各分支 + 全过落库 + 跨片一致不免审
- [ ] ✅ **审查门**：autoAccept 单测全绿；行覆盖 ≥90%

## 阶段 4：人审队列 + 棘轮 + 幻觉抽样

- [ ] 4.1 `reviewQueue.ts`：`listReviewQueue(bookId, filters)`（异常类型 + merge 建议只读列出）
- [ ] 4.2 `ratchet.ts`：`calibrateAutoAccept(sample)`（准确率阈值驱动放宽/收紧，纯函数 + 单测）
- [ ] 4.3 `hallucinationSample.ts`：`sampleRelationHallucination(bookId)`（证据单薄边 + 高新实体率分片）
- [ ] ✅ **审查门**：四模块单测全绿；人审队列只含异常类型

## 阶段 5：跨模型复核接口

- [ ] 5.1 `crossModel.ts`：`crossModelReview(input)` 复用身份判定原语 + 显式 modelId 换模型
- [ ] 5.2 单测：mock callIdentityLlmWithModel，断言换模型调用 + verdict 处理
- [ ] ✅ **审查门**：crossModel 单测绿；跨模型复核可调用

## 阶段 6：收尾

- [ ] 6.1 全量 `pnpm type-check` / `pnpm lint` / `pnpm test`（含覆盖率；review 模块 ≥90%）
- [ ] 6.2 commit；`task.py validate` + `task.py finish`（完成 review-service）

## 回滚点

- 阶段 1（AiCallExecutor modelId 覆盖）向后兼容，可单独回退。
- 每阶段独立 commit。
