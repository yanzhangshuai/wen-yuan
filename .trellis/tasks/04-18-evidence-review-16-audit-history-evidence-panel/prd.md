# feat: 审计历史与证据侧栏

## Goal

实现可复用的 evidence / AI basis / audit history 侧栏，作为人物矩阵、关系编辑器、时间矩阵的共用审查面板，让审核者始终能看到“原文是什么、AI 为什么这么提、后来谁改了什么”。

## Spec

- `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §5.1, §5.3, §6, §8, §10, §15

## Files

- Create: `src/components/review/evidence-panel/**`
- Create: `src/components/review/audit-history/**`
- Modify/Create: `src/app/admin/review/**`
- Create: `src/components/review/evidence-panel/*.test.tsx`

## Requirements

### 1. Evidence panel

- 展示：
  - evidence quoted text
  - normalized text
  - chapter / segment / offset
  - speaker hint
  - narrative region type
- 支持原文高亮与多段 evidence 合并查看

### 2. AI basis and audit history

- 展示：
  - claim 来源阶段
  - AI / RULE / MANUAL 来源
  - 关键模型输出片段或等价 basis 摘要
  - schema 校验错误或 discard reason
  - 人工审核时间线
- 审计记录至少覆盖 accept、reject、edit、manual-create、merge、split、relink

### 3. Reusable integration

- 侧栏组件必须可被人物矩阵、关系编辑器、时间矩阵复用
- 打开方式应统一，避免每个页面自造 evidence 展示逻辑
- 组件要能容纳冲突提示和前后版本 diff，但不要膨胀成重后台

## Acceptance Criteria

- [ ] 任意 claim 详情都能看到 evidence、AI basis、audit history
- [ ] 多页面复用同一套侧栏组件，不重复造轮子
- [ ] 审计记录与 mutation 结果口径一致
- [ ] 证据定位信息足够支撑原文回跳和高亮

## Definition of Done

- [ ] 组件测试覆盖 evidence 展示、审计时间线、版本 diff
- [ ] 与 T12 契约打通
- [ ] evidence 与审计面板成为新审核页的统一入口能力
