# feat: Stage B 全书身份归并

## Goal

把逐章 mention 与别名候选聚合到全书级 `persona_candidates`，显式处理同人多名、同名异人、冒名、误认和禁合并，不再让单章提取直接决定最终人物。

## Spec

- `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §5.2, §7.4, §8.1, §9

## Files

- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB/IdentityResolver.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB/candidate-clustering.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB/alias-conflicts.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageB/*.test.ts`

## Requirements

### 1. Resolution outputs

- 生成 `persona_candidates`
- 生成 `identity_resolution_claims`
- 输出 merge / split / keep-separate suggestion
- 将冒名、误认从普通 alias 中剥离

### 2. Literary constraints

- 古典文学称谓、字号、官职称呼允许归一为同一候选人
- 同姓兄弟、父子同称、官称共享场景必须允许拆分
- 牛浦 / 牛布衣 类问题必须建模为身份关系或冲突，不是简单 alias 合并

### 3. Review-safe behavior

- Stage B 不直接创建正式 `personas`
- 不静默覆盖 Stage A claim，只新增 resolution claim 和候选聚类结果
- 低置信归并需要保留冲突或待审状态

## Acceptance Criteria

- [ ] 全书级 candidate clustering 可以落库并追溯到 mention
- [ ] 冒名、误认、禁合并能被显式表达
- [ ] merge / split suggestion 不会直接污染正式 persona
- [ ] 后续 Stage C 和审核 API 可以消费 resolution 输出

## Definition of Done

- [ ] 身份归并测试覆盖同人多名、同名异人、冒名误认
- [ ] 与 T07、T09、T12 合同对齐
- [ ] 旧 alias 污染式合并不再是默认行为
