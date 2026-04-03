# Verification Evidence

## Scope

- Task: `model-benchmark-execution`
- Objective: 固定 20 章金标，执行阶段级 A/B，仅换模型不换 Prompt，输出四指标与门禁判定。
- Plan Doc: `/home/mwjz/code/wen-yuan/docs/多模型策略/多模型策略执行与验收实施文档.md`

## Preflight Checklist

- [ ] `pnpm lint` 通过
- [ ] `pnpm type-check` 通过
- [ ] `pnpm test` 通过
- [ ] 金标数据 schema 校验通过
- [ ] 实验报告与指标文件已生成

## Success Path

- **Scenario**: 完整执行 Phase1/2/5/全书验证 A/B，产出可用 stage model map。
- **Steps**:
  1. 运行质量门禁命令。
  2. 运行金标校验脚本。
  3. 分阶段执行 A/B（ROSTER_DISCOVERY、CHUNK_EXTRACTION、TITLE_RESOLUTION、BOOK_VALIDATION）。
  4. 汇总指标并执行门禁判定脚本。
- **Expected**:
  - `docs/eval/metrics.summary.json` 成功产出。
  - `docs/eval/gate.result.json` 为 `PASS`。
  - 生成阶段报告与 `model-stage-map.v1.json`。
- **Actual**: 待执行后填写。
- **Evidence**:
  - 命令输出日志：`docs/eval/logs/success-path.log`
  - 指标文件：`docs/eval/metrics.summary.json`
  - 门禁结果：`docs/eval/gate.result.json`

## Failure Path

- **Scenario**: 使用非法输入验证错误处理与错误码稳定性。
- **Steps**:
  1. 构造不符合 schema 的 goldset 行。
  2. 以非法 `--phase` 调用 A/B 脚本。
  3. 使用无效候选池路径调用脚本。
- **Expected**:
  - 失败分支返回稳定错误码。
  - 错误信息可读且能定位具体参数或文件。
  - 不发生静默成功。
- **Actual**: 待执行后填写。
- **Evidence**:
  - 命令输出日志：`docs/eval/logs/failure-path.log`
  - 错误码汇总：`docs/eval/failure-cases.json`

## Boundary Path

- **Scenario**: 边界数据下系统稳定处理。
- **Steps**:
  1. `chapter-list` 为空列表。
  2. 单章最小样本（1章）执行 A/B。
  3. 全量样本（20章）执行 A/B。
  4. 超长章节触发 Phase1 长输入保护。
- **Expected**:
  - 空输入返回稳定错误而非崩溃。
  - 1章/20章都能按契约输出。
  - 长章节场景可完成并写入阶段日志。
- **Actual**: 待执行后填写。
- **Evidence**:
  - 命令输出日志：`docs/eval/logs/boundary-path.log`
  - 边界结果汇总：`docs/eval/boundary-cases.json`

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
  --book-id <BOOK_ID> \
  --chapter-list data/eval/chapters.20.json \
  --candidate-set config/model-candidates.v1.json \
  --experiment-tag phase1_ab_v1

pnpm ts-node scripts/eval/run-stage-ab.ts \
  --phase CHUNK_EXTRACTION \
  --book-id <BOOK_ID> \
  --chapter-list data/eval/chapters.20.json \
  --candidate-set config/model-candidates.v1.json \
  --experiment-tag phase2_ab_v1

pnpm ts-node scripts/eval/run-stage-ab.ts \
  --phase TITLE_RESOLUTION \
  --book-id <BOOK_ID> \
  --chapter-list data/eval/chapters.20.json \
  --candidate-set config/model-candidates.v1.json \
  --experiment-tag phase5_ab_v1

pnpm ts-node scripts/eval/run-stage-ab.ts \
  --phase BOOK_VALIDATION \
  --book-id <BOOK_ID> \
  --chapter-list data/eval/chapters.20.json \
  --candidate-set config/model-candidates.v1.json \
  --experiment-tag bookval_ab_v1

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
- [ ] FAIL
- **Decision Reason**: 待执行后填写。

## Reviewer Sign-off

- Reviewer: `________________`
- Date: `________________`
