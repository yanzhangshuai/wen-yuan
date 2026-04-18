# feat: Evidence-first 审核型角色图谱架构重构

## Goal

以 `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` 为唯一契约，重构整套角色图谱解析与审核架构，建立：

1. 证据优先的解析写路径
2. claim 优先的审核控制层
3. projection 驱动的审核读模型
4. 可回流的 KB v2 与关系类型目录

## Spec

- 主契约：`docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md`
- 执行计划：`docs/superpowers/plans/2026-04-18-evidence-review-architecture-rewrite-plan.md`

## 子任务

| # | 目录 | 核心产物 |
|---|---|---|
| T01 | `04-18-evidence-review-01-schema-and-state-foundation` | schema、状态机、审核真相基础 |
| T02 | `04-18-evidence-review-02-text-evidence-layer` | offset、segment、evidence span |
| T03 | `04-18-evidence-review-03-claim-storage-contracts` | claim 合同、落库、override 规则 |
| T04 | `04-18-evidence-review-04-run-observability-retry` | run、stage、raw output、retry |
| T05 | `04-18-evidence-review-05-stage-0-segmentation` | Stage 0 章节分段 |
| T06 | `04-18-evidence-review-06-stage-a-extraction` | Stage A claim 抽取 |
| T07 | `04-18-evidence-review-07-stage-a-plus-knowledge-recall` | Stage A+ 规则/知识补召回 |
| T08 | `04-18-evidence-review-08-stage-b-identity-resolution` | Stage B 全书身份归并 |
| T09 | `04-18-evidence-review-09-stage-b5-conflict-detection` | Stage B.5 冲突检测 |
| T10 | `04-18-evidence-review-10-stage-c-fact-attribution` | Stage C 事实归属 |
| T11 | `04-18-evidence-review-11-stage-d-projection-builder` | Stage D projection 重建 |
| T12 | `04-18-evidence-review-12-review-api-mutations` | 审核 API 与 mutation |
| T13 | `04-18-evidence-review-13-persona-chapter-matrix-ui` | 人物 x 章节矩阵 |
| T14 | `04-18-evidence-review-14-relation-editor-ui` | 简洁关系编辑器 |
| T15 | `04-18-evidence-review-15-persona-time-matrix-ui` | 人物 x 时间矩阵 |
| T16 | `04-18-evidence-review-16-audit-history-evidence-panel` | 审计与证据侧栏 |
| T17 | `04-18-evidence-review-17-kb-v2-foundation` | KB v2 基础 |
| T18 | `04-18-evidence-review-18-relation-types-catalog` | 关系目录与自定义提升 |
| T19 | `04-18-evidence-review-19-incremental-rerun-cost-controls` | 增量重跑与成本控制 |
| T20 | `04-18-evidence-review-20-cutover-read-paths` | 读路径切换与旧真相退役 |
| T21 | `04-18-evidence-review-21-gold-set-regression` | 金标与回归 |
| T22 | `04-18-evidence-review-22-e2e-acceptance` | 最终验收 |

## Acceptance Criteria

- [ ] 所有 22 个子任务完成并通过各自 DoD
- [ ] `儒林外史` 能完成完整 Evidence-first 解析与审核闭环
- [ ] `三国演义` 至少覆盖时间矩阵、关系动态变化与回归样例
- [ ] 审核页只读 projection，不再依赖旧 `Profile / BiographyRecord / Relationship` 真相
- [ ] 任意正式事件、关系、时间事实都能回跳到原文证据与审核历史

## Definition of Done

- [ ] 新架构成为审核主路径
- [ ] KB v2 与 relation types catalog 成为新审核流的知识治理底座
- [ ] 旧 `listDrafts` / 旧 review tabs / 旧直接写正式图谱路径已退役或移除
- [ ] `T21` 回归与 `T22` 验收报告完整落库并可复现
