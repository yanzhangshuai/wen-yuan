# feat: 人物 × 章节审核矩阵

## Goal

实现新的主审核入口，让审核者按“人物（横轴）× 章节（纵轴）”查看和修订事实，单元格聚合事件、关系、冲突与状态摘要，并可一键下钻到证据与 AI 提取依据。

## Spec

- `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §5.3, §7.7, §8.1, §15

## Files

- Modify/Create: `src/app/admin/review/**`
- Create: `src/components/review/persona-chapter-matrix/**`
- Create: `src/components/review/shared/**`
- Create: `src/app/admin/review/**/*.test.tsx`

## Requirements

### 1. Matrix information design

- 横轴为人物，纵轴为章节
- 单元格至少展示：
  - event count
  - relation count
  - conflict count
  - review status summary
  - latest updated at
- 支持点击单元格查看本人物在该章节的 claim 列表

### 2. Review operations

- 单元格下钻后必须支持：
  - 新增人工 claim
  - 编辑 claim
  - 删除或驳回 claim
  - 状态标记
  - 查看原文依据
  - 查看 AI 提取依据
  - 查看修改记录
- 页面不得要求审核者理解底层 claim 表结构

### 3. Usability constraints

- 支持人物筛选、章节跳转、状态筛选、冲突筛选
- 高密度矩阵需要支持虚拟滚动或等价性能优化
- 默认展示 projection summary，明细按需加载，避免首屏把全书 claim 全拉下来

## Acceptance Criteria

- [ ] 审核者可以从矩阵进入任意“人物 x 章节”单元格并完成修订
- [ ] 单元格摘要与下钻明细口径一致
- [ ] evidence 与 AI basis 在同一审查路径中可见
- [ ] 50+ 人物、100+ 章节场景仍可流畅操作

## Definition of Done

- [ ] 主要交互覆盖组件测试或页面测试
- [ ] 与 T12、T16 API/面板契约打通
- [ ] 新矩阵成为人物章节审核主入口
