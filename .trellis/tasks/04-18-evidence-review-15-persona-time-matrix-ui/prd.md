# feat: 人物 × 时间审核矩阵

## Goal

实现“人物（横轴）× 时间（纵轴）”的审核视图，支撑《三国演义》这类存在历史阶段、战役前后、相对时间片段的作品，对时间 claim、事件归属和关系变化做联合审核。

## Spec

- `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §5.2, §5.3, §7.7, §8.2, §13.2, §15

## Files

- Create: `src/components/review/persona-time-matrix/**`
- Modify/Create: `src/app/admin/review/**`
- Create: `src/components/review/persona-time-matrix/*.test.tsx`

## Requirements

### 1. Time-axis model

- 时间轴至少支持：
  - `CHAPTER_ORDER`
  - `RELATIVE_PHASE`
  - `NAMED_EVENT`
  - `HISTORICAL_YEAR`
  - `BATTLE_PHASE`
  - `UNCERTAIN`
- 时间单元格需要能回链到章节与 time claim 来源
- 不精确时间必须保留其原始标签与归一标签

### 2. Review behavior

- 支持查看某人物在某时间片涉及的：
  - events
  - relations
  - conflict flags
  - time claims
- 支持修订时间归一、事件归属和时间片关联
- 支持查看章节关联，避免时间审核与章节事实脱节

### 3. Performance and clarity

- 默认按时间层级折叠展示，避免一次性展开全部历史切片
- 对《三国演义》这种长时序作品要支持筛选与跳段
- 时间矩阵不应复制人物章节矩阵所有复杂交互，而应聚焦时间审查

## Acceptance Criteria

- [ ] 审核者可按人物 x 时间片审查事件、关系和时间归一
- [ ] 时间片与章节事实存在稳定双向跳转
- [ ] 不精确时间表达不会被强制压平为单一年份或章节
- [ ] `三国演义` 样例可用以验证关系动态变化与时间阶段审查

## Definition of Done

- [ ] 组件或页面测试覆盖时间筛选、时间下钻、章节回链
- [ ] 与 T12、T16、T21 契约打通
- [ ] 新时间矩阵能独立支撑标准版审核需求
