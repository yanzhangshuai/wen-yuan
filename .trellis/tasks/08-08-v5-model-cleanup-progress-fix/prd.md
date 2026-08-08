# 模型设置清理 + 进度真实化 + 解析失败修复

## Goal

一次性处理 4 个已定位根因的问题：清理 v4 遗留的模型设置字段、修复进度展示失真、修复新书解析在 Pass0 直接失败的问题，让新书（儒林外史 56 章规模）能跑通解析且进度可见。

## Background / 根因结论（已与用户确认）

1. **isDefault 字段（新书默认）**：实际是"系统默认模型"唯一选择器（`loadSystemDefaultModel` 首选），非冗余；但 UI 文案「新书籍导入时使用此模型」是 v4 遗留、误导。→ 保留字段，改文案。
2. **aliasKey 字段**：v5 已删除阶段推荐，无任何运行时逻辑读取；仅导入导出做稳定标识，回退路径 (provider, modelId, baseUrl) 已覆盖。→ 删除字段。
3. **进度显示 50%**：`deriveJobProgress` 把 RUNNING 无条件映射为固定 50%、stage 写死「解析中」，管线不上报当前阶段。→ 加 `currentStage` 列，按阶段映射进度。
4. **ROSTER_DISCOVERY 失败**：儒林外史 327K 字符 → Tier1 single_pass 把整本书单次发送 3 遍；`ab-calibration.json` 缺失使 volume 分卷成为死代码；DeepSeek 对超长 prompt 返回空 content（HTTP 200 空 body，81s）→ `DeepSeek returned an empty response`；该错误不在 `isRetryableError` 内 → 0 次重试直接判死且报"已耗尽重试"。→ Tier1 按 token 自动分片 + empty response 纳入可重试 + 错误消息按实际尝试次数描述。

## Requirements

- R1（问题1）：保留 `AiModel.isDefault`；将模型设置中所有"新书籍导入"文案改为"系统默认解析模型"，语义清晰无误导。
- R2（问题2）：彻底移除 `AiModel.aliasKey` 字段（schema 列、唯一约束、API/服务/UI、测试、bootstrap 文档）。
- R3（问题3）：`AnalysisJob` 增加 `currentStage` 列；管线每个 Pass 边界写入真实阶段；`getBookStatus` 按阶段映射加权进度并透出 stage，前端不再显示固定 50%。
- R4（问题4）：Tier1 不再整本单发——按 `bookSizeTokens` 自动分片（每片 ≤ 5 万 token）；`AiCallExecutor.isRetryableError` 纳入 "empty response"；`AiCallExhaustedError` 文案反映实际尝试次数。

## Acceptance Criteria

- [ ] AC1（R1）：模型表单与默认模型选择器不再出现"新书籍导入时使用此模型"等文案；新增模型时"设为默认"开关文案为"系统默认模型（所有解析任务使用）"。
- [ ] AC2（R2）：`aliasKey` 从 schema/迁移/服务/API/前端/测试中完全移除；`pnpm prisma migrate` 成功；模型导入导出功能正常（按 endpoint 三元组 upsert）；全量单测通过。
- [ ] AC3（R3）：`analysis_jobs` 有 `current_stage` 列；解析进行中 `GET /api/books/:id/status` 返回的阶段随 Pass 推进而变化，进度不再恒定 50%；相关单测更新并通过。
- [ ] AC4（R4）：儒林外史（56 章）重跑 Pass0 不再发送整本书单次 prompt；"empty response" 触发重试；失败日志文案显示实际尝试次数；相关单测更新并通过。
- [ ] AC5：`pnpm type-check`、`pnpm lint`、`pnpm test` 全绿；`next build` 通过。

## Notes

- DB 已重建过、无存量业务数据，迁移零成本。
- R2 改动面最大（全链路 + 迁移），R1/R3/R4 为增量改动。
- 不做 DeepSeek 探针验证（R4 方案按超长 prompt 根因修复即可绕开），如需要可后续补。
