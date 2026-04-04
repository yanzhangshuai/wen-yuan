# brainstorm: alias key resolve provider model id

## Goal

将阶段策略从“前端传数据库模型 UUID”调整为“前端传语义 key（aliasKey）”，由后端在运行时解析到 provider + providerModelId，降低前端与供应商协议耦合，提升模型版本切换与回滚效率。

## What I already know

* 当前策略 DTO 要求 `stages[*].modelId` 为 UUID（`src/server/modules/analysis/dto/modelStrategy.ts`）。
* 前端策略表单 `ModelStrategyForm` 仍保存和提交 `modelId`（数据库 `aiModel.id`）。
* 后端保存策略时通过 `aiModel.id` 校验“是否启用”。
* 后端执行时通过 `aiModel.id` 取到模型记录，再用 `aiModel.modelId` 作为真实供应商调用模型 ID。
* 推荐配置（`config/model-recommendations.v1.json`）已经采用 `alias` + provider/providerModelId 的语义映射思路。

## Assumptions (temporary)

* `aliasKey` 在启用模型中应保持唯一（至少在策略可选范围内唯一）。
* 策略配置长期应尽量不暴露 `providerModelId` 给前端。
* 暂不需要兼容旧 `modelId(UUID)` 结构（按用户最新偏好）。

## Open Questions

* 阶段策略字段命名是否统一为 `aliasKey`（不再保留 `modelId`）？
* 若某 alias 暂时没有启用模型，保存策略时是阻断还是允许保存并在运行时降级？

## Requirements (evolving)

* 前端阶段策略仅提交语义 key。
* 后端根据 key 查找已启用模型并解析真实 providerModelId。
* 推荐逻辑与阶段显示应与该 key 机制一致。

## Acceptance Criteria (evolving)

* [ ] 策略 DTO 不再要求 UUID modelId，而是语义 key。
* [ ] 策略保存时按 key 校验启用模型存在性。
* [ ] 执行解析器按 key 得到实际 provider + providerModelId。
* [ ] 前端配置/推荐提示不再依赖数据库 UUID。

## Definition of Done (team quality bar)

* Tests added/updated (unit/integration where appropriate)
* Lint / typecheck / CI green
* Docs/notes updated if behavior changes
* Rollout/rollback considered if risky

## Out of Scope (explicit)

* 重写所有模型管理页面的信息架构
* 引入跨项目模型目录服务

## Technical Notes

* 关键影响文件：
  * `src/lib/services/model-strategy.ts`
  * `src/server/modules/analysis/dto/modelStrategy.ts`
  * `src/server/modules/analysis/services/modelStrategyAdminService.ts`
  * `src/server/modules/analysis/services/ModelStrategyResolver.ts`
  * `src/app/admin/_components/model-strategy-form.tsx`
  * `src/app/api/books/[id]/analyze/route.ts`
* 当前风险点：`aliasKey` 可能为空；若用作策略主键，需要在“可选模型列表”层面约束。
