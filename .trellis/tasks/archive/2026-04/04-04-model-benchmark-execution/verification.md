# Verification Evidence

## Scope

- Task: `model-benchmark-execution`
- Objective: 固定 20 章金标，执行阶段级 A/B，仅换模型不换 Prompt，输出四指标与门禁判定。
- Plan Doc: `/home/mwjz/code/wen-yuan/docs/多模型策略/多模型策略执行与验收实施文档.md`

## Preflight Checklist

- [x] `pnpm lint` 通过（2026-04-04）
- [x] `pnpm type-check` 通过（2026-04-04）
- [x] `pnpm test` 通过（2026-04-04，98 files / 593 tests）
- [x] 金标数据 schema 校验通过（`EVAL_GOLDSET_VALID`）
- [x] 实验报告与指标文件已生成

## Success Path

- **Scenario**: 完整执行 Phase1/2/5/全书验证 A/B，产出指标与 gate 判定。
- **Steps**:
  1. 运行金标校验脚本。
  2. 执行四阶段 A/B（dry-run，保证链路可执行）。
  3. 计算指标并执行门禁判定。
- **Expected**:
  - 产出 `docs/eval/metrics.summary.json`。
  - 产出 `docs/eval/gate.result.json`。
  - 在真实数据下 gate 可据实给出 PASS/FAIL。
- **Actual**:
  - 以上文件均成功产出。
  - 当前运行为 dry-run，`gate.result.json` 判定 `FAIL`（`phasesPassed=0/4`，`runsPassed=0/8`）。
  - 原因：dry-run 无真实抽取结果，`jsonSuccessRate/cost/throughput` 为 `null`，F1 为 0。
- **Evidence**:
  - 命令输出日志：`docs/eval/logs/success-path.log`
  - 指标文件：`docs/eval/metrics.summary.json`
  - 门禁结果：`docs/eval/gate.result.json`

## Failure Path

- **Scenario**: 用非法输入验证错误处理、错误码与错误信息稳定性。
- **Steps**:
  1. 使用损坏的 goldset JSONL。
  2. 使用非法 `--phase`。
  3. 使用不存在的候选池路径。
- **Expected**:
  - 返回稳定错误码。
  - 错误信息可读，能定位输入问题。
- **Actual**:
  - Case1 返回 `EVAL_GOLDSET_VALIDATION_FAILED` + `EVAL_GOLDSET_JSONL_PARSE_FAILED`，退出码 `1`。
  - Case2 返回 `EVAL_STAGE_AB_FAILED`（`--phase` 非法），退出码 `1`。
  - Case3 返回 `EVAL_STAGE_AB_FAILED`（`ENOENT`），退出码 `1`。
- **Evidence**:
  - 命令输出日志：`docs/eval/logs/failure-path.log`
  - 错误案例汇总：`docs/eval/failure-cases.json`

## Boundary Path

- **Scenario**: 边界输入（空列表、最小样本、全量样本）下流程稳定性验证。
- **Steps**:
  1. 空章节列表 `[]`。
  2. 单章列表 `[1]`。
  3. 全量 20 章列表。
- **Expected**:
  - 空输入返回可读错误。
  - 1章和20章可稳定产出结果文件。
- **Actual**:
  - 空列表返回 `EVAL_STAGE_AB_FAILED` + `chapter-list 不能为空`，退出码 `1`。
  - 单章与20章均返回 `EVAL_STAGE_AB_COMPLETED`，退出码 `0`，并产出实验文件。
  - 超长章节保护需真实书籍数据与数据库链路，dry-run 未覆盖该子场景。
- **Evidence**:
  - 命令输出日志：`docs/eval/logs/boundary-path.log`
  - 边界案例汇总：`docs/eval/boundary-cases.json`
  - 边界实验文件：`docs/eval/experiments/boundary_one_chapter.json`、`docs/eval/experiments/boundary_full_chapters.json`

## Commands Run

```bash
pnpm lint
pnpm type-check
pnpm test

pnpm ts-node scripts/eval/validate-goldset.ts \
  --schema data/eval/goldset.schema.json \
  --input data/eval/goldset.v1.jsonl

pnpm ts-node scripts/eval/run-stage-ab.ts \
  --phase ROSTER_DISCOVERY \
  --book-id DRYRUN_BOOK_001 \
  --chapter-list data/eval/chapters.20.json \
  --candidate-set config/model-candidates.v1.json \
  --experiment-tag phase1_ab_v1 \
  --dry-run

pnpm ts-node scripts/eval/run-stage-ab.ts \
  --phase CHUNK_EXTRACTION \
  --book-id DRYRUN_BOOK_001 \
  --chapter-list data/eval/chapters.20.json \
  --candidate-set config/model-candidates.v1.json \
  --experiment-tag phase2_ab_v1 \
  --dry-run

pnpm ts-node scripts/eval/run-stage-ab.ts \
  --phase TITLE_RESOLUTION \
  --book-id DRYRUN_BOOK_001 \
  --chapter-list data/eval/chapters.20.json \
  --candidate-set config/model-candidates.v1.json \
  --experiment-tag phase5_ab_v1 \
  --dry-run

pnpm ts-node scripts/eval/run-stage-ab.ts \
  --phase BOOK_VALIDATION \
  --book-id DRYRUN_BOOK_001 \
  --chapter-list data/eval/chapters.20.json \
  --candidate-set config/model-candidates.v1.json \
  --experiment-tag bookval_ab_v1 \
  --dry-run

pnpm ts-node scripts/eval/compute-metrics.ts \
  --experiments phase1_ab_v1,phase2_ab_v1,phase5_ab_v1,bookval_ab_v1 \
  --goldset data/eval/goldset.v1.jsonl \
  --output docs/eval/metrics.summary.json

pnpm ts-node scripts/eval/check-gate.ts \
  --metrics docs/eval/metrics.summary.json \
  --baseline docs/eval/baseline.metrics.json \
  --output docs/eval/gate.result.json
```

## Acceptance Decision

- [ ] PASS
- [x] FAIL
- **Decision Reason**: 当前仅完成 dry-run 级链路验收，未连接真实分析任务执行与真实抽取结果，导致四项核心指标不达门禁阈值（详见 `docs/eval/gate.result.json`）。

## Reviewer Sign-off

- Reviewer: `待评审`
- Date: `2026-04-04`
