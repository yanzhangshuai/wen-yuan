# feat: 金标回归与样例验收基线

## Goal

建立 `儒林外史` 与 `三国演义` 的 gold set、回归脚本和指标口径，用事实基线验证新架构在人物、关系、时间、证据闭环和审核闭环上的收益，而不是只看主观感受。

## Spec

- `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §13.1, §13.2, §14.1, §15

## Files

- Create: `scripts/review-regression/**`
- Create: `tests/fixtures/review-regression/**`
- Create: `docs/superpowers/reports/**`
- Create: `scripts/review-regression/*.test.ts`

## Requirements

### 1. Gold-set coverage

- `儒林外史` 至少覆盖：
  - 人物识别
  - 章节事实
  - 冒名/误认
  - evidence 回跳
- `三国演义` 至少覆盖：
  - 时间阶段
  - 关系动态变化
  - 不精确时间表达

### 2. Metrics and reports

- 至少输出：
  - 人物准确性基线
  - 关系方向与类型稳定性
  - 时间归一可用性
  - evidence traceability
  - review action success rate
- 报告要可重复生成，不能只存在于手工截图

### 3. Regression workflow

- 能对指定书、指定章节范围跑回归
- 能比较全量 run 与 rerun 结果
- 为 T20 cutover 和 T22 acceptance 提供前置门槛

## Acceptance Criteria

- [ ] `儒林外史` MVP 回归基线可重复运行
- [ ] `三国演义` 标准版时间与关系样例纳入回归
- [ ] 指标和报告产物可被后续切流与验收直接引用
- [ ] 回归覆盖 evidence、review、projection 三个闭环维度

## Definition of Done

- [ ] fixture、脚本、报告模板与测试落地
- [ ] 与 T11、T18、T19 契约打通
- [ ] gold set 成为后续改动的强制验证基线
