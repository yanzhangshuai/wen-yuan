# feat: 增量重跑与成本控制

## Goal

实现 Evidence-first 流水线的 dirty-set、阶段跳过、局部 projection rebuild 和成本统计面板，避免每次审核修改或小范围文本修订都触发整书全链路重算。

## Spec

- `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §10, §11, §13.2, §15

## Files

- Create: `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/**`
- Create: `src/server/modules/review/evidence-review/costs/**`
- Create: `scripts/review-regression/**`
- Create: `src/server/modules/analysis/pipelines/evidence-review/rerun-planner/*.test.ts`

## Requirements

### 1. Dirty-set planning

- 变更至少要能定位到：
  - chapter
  - segment
  - claim family
  - persona candidate
  - projection slice
- 根据变更类型决定需要重跑的 stage 与范围
- 审核 mutation 默认只触发 projection rebuild，不回退重新调用 LLM

### 2. Stage skip rules

- 支持 `projection-only rebuild`
- 支持“仅局部章节重抽取 + 全书归并重算”的组合策略
- 支持阶段缓存与显式失效
- 重跑计划要可解释，不能只给一个黑盒“需要重跑”

### 3. Cost observability

- 成本面至少展示：
  - token
  - 费用
  - stage 耗时
  - 跳过数量
  - 重跑原因
- 需要能比较全量运行与增量运行的成本差异

## Acceptance Criteria

- [ ] 小范围审核修订仅触发局部 projection rebuild
- [ ] 章节级文本修订可按 dirty-set 规划最小必要重跑路径
- [ ] 成本统计可解释并支持后续优化
- [ ] 不再默认使用全书全阶段重跑作为唯一恢复手段

## Definition of Done

- [ ] rerun planner 与测试落地
- [ ] 与 T04、T11、T12、T21 契约打通
- [ ] 增量重跑与成本统计成为标准运行能力
