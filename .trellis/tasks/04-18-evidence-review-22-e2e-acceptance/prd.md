# feat: Evidence-first 重构最终验收

## Goal

以端到端验收清单的方式验证新架构是否真正完成“证据闭环、审核闭环、投影闭环、知识回流闭环”，并为正式切流提供最终放行依据。

## Spec

- `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §13.3, §15, §16

## Files

- Create: `docs/superpowers/reports/**`
- Create: `scripts/review-regression/acceptance/**`
- Create: `.trellis/tasks/04-18-evidence-review-22-e2e-acceptance/**`

## Requirements

### 1. Acceptance dimensions

- 必须逐项验收：
  - evidence loop
  - review loop
  - projection loop
  - knowledge loop
  - rebuild loop
- 验收不以 UI 漂亮程度为主，而以闭环是否成立为主

### 2. Evidence collection

- 对每项验收记录：
  - 执行命令
  - 输入样本
  - 产出结果
  - 风险与残留问题
  - 是否达到放行条件
- 验收报告需覆盖 `儒林外史` 和 `三国演义` 代表样例

### 3. Launch decision support

- 明确列出阻断项与非阻断项
- 为正式切流给出 go / no-go 判断
- 验收结论必须能回指到 T20、T21 的输出证据

## Acceptance Criteria

- [ ] 五类闭环都有可复现的验收记录
- [ ] 切流放行条件与阻断项清晰
- [ ] 验收报告可直接作为上线决策材料
- [ ] 残留风险被明确记录，而不是隐含带过

## Definition of Done

- [ ] 验收脚本、报告模板和最终报告落地
- [ ] 与 T20、T21 结果强绑定
- [ ] Evidence-first rewrite 具备可审计的最终放行依据
