# feat: Stage A+ 规则与知识补召回

## Goal

在不破坏 claim 审核边界的前提下，引入规则层和知识库层，提高古典文学中的称谓、字号、亲属称谓、关系归一建议和禁合并提示的召回与稳定性。

## Spec

- `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §7.3, §9, §9.4, §9.5

## Files

- Create: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/rule-recall.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stageAPlus/*.test.ts`

## Requirements

### 1. Recall sources

- 支持基于以下知识进行补召回：
  - 姓氏规则
  - 官称规则
  - 亲属称谓规则
  - 已验证别名规则
  - 负向 alias / 禁合并规则
  - 关系标签归一建议

### 2. Output discipline

- 规则命中也必须产出 claim 或 suggestion，不能直接写正式 projection
- 负向知识应生成冲突提示或 merge deny 建议，而不是静默覆盖
- 关系归一只能给出 `relationTypeKey` 建议及置信度，保留原始关系文本

### 3. Knowledge boundary

- 默认只使用 `VERIFIED` 知识高权重参与召回
- `PENDING` 知识只能作为低权重提示
- 本任务依赖 KB v2 基础，但不负责 relation types catalog 的完整治理

## Acceptance Criteria

- [ ] Stage A+ 能在不改动正式 projection 的前提下写额外 claim / suggestion
- [ ] 负向知识成为显式输出
- [ ] 关系归一建议与原始关系文本可同时保留
- [ ] Stage B 可直接消费补召回结果

## Definition of Done

- [ ] rule recall 与 knowledge recall 具备测试
- [ ] 未验证知识不会越权成为强约束
- [ ] 与 T17 的知识装载网关对齐
