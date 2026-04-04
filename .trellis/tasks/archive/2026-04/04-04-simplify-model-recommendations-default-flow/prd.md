# brainstorm: 简化 model-recommendations 默认流程

## Goal

简化 `model-recommendations.v1.json` 默认配置的使用链路，保证“默认推荐”只依赖最小必要字段（`stageAliases + aliases.label` + 模型表 `aliasKey`），避免过度封装和跨层语义混用，同时保持管理端展示与“恢复推荐配置”行为稳定。

## What I already know

- 当前默认推荐配置在 `config/model-recommendations.v1.json`。
- 当前运行路径集中在：
  - `src/lib/model-recommendations.ts`
  - `src/app/admin/_components/model-strategy-form.tsx`
- 推荐命中函数：`pickRecommendedEnabledModel` / `isRecommendedModelMatch`。
- 当前已回到 `stageAliases` 结构，并采用 aliasKey 命中推荐。

## Assumptions (temporary)

- 用户想要“最小可用封装”，即配置结构和代码只保留真实必要字段。
- 不希望引入额外抽象层（例如复杂工厂、额外实体映射层）。
- 当前 UI 的“推荐”文案和“恢复推荐配置”按钮逻辑要保留。

## Open Questions

- 无（已收敛）

## Requirements

- 默认推荐配置要可读、可维护、低心智负担。
- 推荐匹配规则在统一模块实现，UI 不做 provider 特判。
- 配置与代码契约一致，避免字段名频繁切换。
- 配置结构固定为：
  - `aliases: Record<aliasKey, { label }>`
  - `stageAliases: Record<PipelineStage, aliasKey>`
- 运行时推荐命中只认 `aliasKey`，不回退 `providerModelId`。

## Acceptance Criteria

- [ ] `model-recommendations.v1.json` 的默认配置结构可在 1 分钟内理解。
- [ ] `model-recommendations.ts` 仅保留默认推荐必需的解析与匹配逻辑。
- [ ] 推荐测试覆盖“aliasKey 命中/未命中”基本语义。
- [ ] UI “推荐”徽标与“恢复推荐配置”行为保持不变。

## Definition of Done (team quality bar)

- Tests added/updated (unit/integration where appropriate)
- Lint / typecheck / CI green
- Docs/notes updated if behavior changes
- Rollout/rollback considered if risky

## Out of Scope (explicit)

- 不改动模型执行链路（provider 调用、策略 UUID 解析等）。
- 不重做模型管理页 UI 交互。

## Technical Notes

- 关键配置：`config/model-recommendations.v1.json`
- 关键解析：`src/lib/model-recommendations.ts`
- 关键消费端：`src/app/admin/_components/model-strategy-form.tsx`
- 相关规范：`src/templates/markdown/spec/guides/cross-layer-thinking-guide.md`

## Research Notes

### What similar tools do

- 默认推荐通常只保留“语义键 -> 展示信息”，避免把运行协议字段掺进默认层。
- 命中逻辑通常集中在一个 helper，页面只消费结果，不做 provider 分支。

### Constraints from our repo/project

- 阶段策略执行链路已经固定为 `modelId(UUID)`，推荐层不能干扰执行层。
- 管理端仍需要显示“推荐”徽标与“恢复推荐配置”。

### Feasible approaches here

**Approach A: 极简双表 + 两个 helper** (Recommended)

- How it works:
  - 配置仅保留 `aliases(label)` + `stageAliases(stage -> alias)`
  - 代码保留 `pickRecommendedEnabledModel` 和 `isRecommendedModelMatch`
- Pros:
  - 学习成本最低
  - 兼容当前 UI 调用点
- Cons:
  - helper 名称仍是“推荐模型对象”语义，不是“alias 语义”

**Approach B: 单函数封装**

- How it works:
  - 提供 `getRecommendedModelForStage(stage, models)`，页面不再自己组合多个 helper
- Pros:
  - 页面更简洁
- Cons:
  - 会增加一个轻度抽象层

**Approach C: 页面内联判断**

- How it works:
  - 删除 helper，直接在 form 组件中按 alias 匹配
- Pros:
  - 文件数最少
- Cons:
  - 逻辑分散，不利于后续复用和测试

## Decision (ADR-lite)

**Context**: 需要简化默认推荐配置流程，避免过度抽象，同时保证管理端推荐能力不回退。  
**Decision**: 采用 **Approach A（极简双表 + 两个 helper）**。  
**Consequences**:
- 优点：配置与代码最小化，认知成本低，改动小。
- 代价：helper 仍为两个函数，但保持职责清晰且已足够。
