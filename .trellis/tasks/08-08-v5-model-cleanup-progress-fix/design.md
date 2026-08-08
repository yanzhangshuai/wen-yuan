# 设计

## R1：isDefault 文案修正
仅 UI 文案/注释改动，无结构变更。
- `src/app/admin/model/_components/model-form.tsx`：「设为默认」→「设为默认模型」，副文案 →「系统默认模型，所有解析任务使用」。
- `src/app/admin/model/_components/model-manager.tsx`：PageSection description →「选择系统默认解析模型」。
- `src/hooks/use-admin-models.ts` / `src/server/modules/models/defaultModel.ts` 注释对齐语义。

## R2：移除 aliasKey（全链路）
- `prisma/schema.prisma`：删 `aliasKey` 字段 + `@@unique([aliasKey])`。
- `src/server/modules/models/index.ts`：删 aliasKey schema、`assertAliasKeysUnique`、`normalizeOptionalAliasKey`、各 select/输出映射中的 aliasKey；`importModels` 去掉 aliasKey 分支，仅按 endpoint upsert；`createModelInputSchema`/`updateModelInputSchema` 删 aliasKey。
- `src/app/api/admin/models/_shared.ts`：删 aliasKey 校验。
- `src/server/modules/models/admin-adapters.ts`：删 aliasKey 映射。
- `src/lib/services/models.ts`：删 aliasKey 字段。
- `src/app/admin/model/_components/model-form.tsx` / `model-card.tsx`：删 Alias Key 输入与展示。
- 相关测试：`models/index.test.ts`、route tests、`export`/`import` route tests、`admin-adapters` 测试、前端 service 测试。
- `docs/model-config-bootstrap.md`：删 aliasKey 说明，导入 upsert 描述改为按 `(provider, modelId, baseUrl)`。

## R3：currentStage 真实进度
- `prisma/schema.prisma`：AnalysisJob 加 `currentStage String? @map("current_stage")`。
- `src/server/modules/analysis/jobs/runAnalysisJob.ts`：封装 `setStage(context, stage)`（写 job.currentStage），在每个 Pass 边界调用：
  - 快照装载后 → `identity_roster`（Pass0 前）
  - Pass0 → `identity_tier2`
  - Pass1 → `extract_slices`
  - reconcile → `reconcile`
  - Pass3 → `aggregate_graph`
  - Pass4 → `auto_accept`
  - Pass5 → `skill_generate`
- `src/server/modules/books/getBookStatus.ts`：`deriveJobProgress` 改为「status + currentStage」输入；RUNNING 时按 stage 加权映射（如 identity_roster=10, identity_tier2=15, extract_slices=15-60, reconcile=65, aggregate_graph=80, auto_accept=90, skill_generate=95）；stage 文案透出。
- `src/app/admin/books/[id]/_components/parse-progress-panel.tsx`：无需结构改动（stage 由服务端透出）。

## R4：Tier1 分片 + 重试分类
- `src/server/modules/identity/tier1.ts`：
  - `pickTier1Path` 改为按 `bookSizeTokens` 决策：≤50K → single_pass；否则 volume 分片，`VOLUME_SIZE` 按目标片 token 反推（每片 ≤ 5 万 token，约 25 章 → 按需缩小）。
  - 同时支持 `AB_CALIBRATION_MAX` 不存在时的兜底（当前文件缺失恒 single_pass 的问题）。
- `src/server/modules/analysis/services/AiCallExecutor.ts`：
  - `isRetryableError` 增加 `empty response` 匹配。
  - `AiCallExhaustedError` 文案改为包含实际尝试次数（如「阶段 X 调用失败，模型 Y 尝试 N 次后放弃」）。
