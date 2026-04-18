# feat: Claim Storage Contracts

## Goal

定义新架构的 claim 类型、字段校验、写入幂等规则、人工 override 规则和 relation key 约束，使 Stage A/A+/B/B.5/C 与审核 API 使用同一套 claim 合同。

## Spec

- `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §5.2, §6, §7, §8.3, §9.6

## Files

- Create: `src/server/modules/analysis/claims/claim-schemas.ts`
- Create: `src/server/modules/analysis/claims/claim-repository.ts`
- Create: `src/server/modules/analysis/claims/claim-write-service.ts`
- Create: `src/server/modules/analysis/claims/manual-override.ts`
- Create: `src/server/modules/analysis/claims/*.test.ts`

## Requirements

### 1. Claim families

- 明确定义并校验以下 claim：
  - `entity_mentions`
  - `alias_claims`
  - `event_claims`
  - `relation_claims`
  - `time_claims`
  - `identity_resolution_claims`
  - `conflict_flags`

### 2. Shared contract rules

- 一条 claim 只能表达一个原子事实
- 所有 claim 都必须至少绑定一个 evidence span
- AI/RULE/MANUAL/IMPORTED 共享一套基类字段
- 相同 run/stage/chapter 的重跑必须可幂等替换

### 3. Review-safe mutation model

- 人工编辑不能覆盖原 claim
- 原 claim 要保留，人工产物要能关联 `supersedes` 或 `derivedFrom`
- `relationTypeKey` 存字符串；`relationLabel` 保留展示值；`relationTypeSource` 显式区分预设/自定义/归一来源

## Acceptance Criteria

- [ ] 所有 claim 都能经统一 schema 校验后写入
- [ ] 幂等重跑不会制造重复 claim
- [ ] 人工 claim 与 AI claim 可以并存并保留审计关系
- [ ] `relationTypeKey` / `relationLabel` / `relationTypeSource` 合同明确

## Definition of Done

- [ ] claim repository 和测试落地
- [ ] T06-T12 直接复用 claim contract
- [ ] 不再允许任意 service 自由写 claim 表
