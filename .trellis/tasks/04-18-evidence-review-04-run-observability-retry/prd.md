# feat: Run 可观测性与 Retry 边界

## Goal

把 analysis run、stage run、LLM raw output、错误分类、重试边界和成本统计做成一等公民，避免“作业成功但无法解释”或“局部失败导致整书无结果”。

## Spec

- `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §10, §11, §15

## Files

- Create: `src/server/modules/analysis/runs/run-service.ts`
- Create: `src/server/modules/analysis/runs/stage-run-service.ts`
- Create: `src/server/modules/analysis/runs/retry-planner.ts`
- Modify: `src/server/modules/analysis/jobs/runAnalysisJob.ts`
- Create: `src/server/modules/analysis/runs/*.test.ts`

## Requirements

### 1. Observability

- 每个 stage 记录：
  - 输入数量
  - 输出数量
  - 跳过数量
  - 失败数量
  - 失败分类
  - token 与成本
  - 涉及章节范围

### 2. Retry model

- 支持按 run、stage、chapter 粒度重试
- Stage A 失败不应该让整书审核页归零
- Stage B/C 失败要保留前序产物
- projection 需要支持单独重建

### 3. Raw output retention

- LLM prompt、response、解析错误、schema 校验错误必须落库
- review UI 的“AI 提取依据”依赖此层读取

## Acceptance Criteria

- [ ] `analysis_runs` / `analysis_stage_runs` / `llm_raw_outputs` 三层记录齐备
- [ ] 任一 stage 失败可以定位章节、错误类型、原始输出
- [ ] 可按章节或阶段触发部分重试
- [ ] cost summary 可以按 run 聚合

## Definition of Done

- [ ] 运行日志与重试接口具备测试
- [ ] T06-T11 能接入统一 stage run 记录
- [ ] T16 和 T19 需要的 run 数据已经具备
