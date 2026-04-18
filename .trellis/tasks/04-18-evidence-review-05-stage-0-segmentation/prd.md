# feat: Stage 0 文本规范化与章节分段

## Goal

实现新架构的 Stage 0：对章节进行规范化、区段切分、offset 建立和叙事区域标注，为 Stage A 的 claim 抽取提供可靠上下文。

## Spec

- `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §5.1, §7.1, §8, §15

## Files

- Create: `src/server/modules/analysis/pipelines/evidence-review/stage0/Stage0Segmenter.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stage0/segment-rules.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stage0/types.ts`
- Create: `src/server/modules/analysis/pipelines/evidence-review/stage0/*.test.ts`

## Requirements

### 1. Segmentation

- 输出 `chapter_segments`
- 至少区分：`TITLE / NARRATIVE / DIALOGUE_LEAD / DIALOGUE_CONTENT / POEM / COMMENTARY / UNKNOWN`
- 记录 `segmentIndex`、offset、rawText、normalizedText、confidence`

### 2. Evidence integration

- 使用 T02 的 evidence contract 输出可高亮定位的 segment 信息
- 后续 claim 只能引用已建立 offset 的 segment
- 对无法稳定建 offset 的片段显式标低置信或丢弃

### 3. Operational behavior

- 支持整书批量运行和按章节单独重跑
- 保留低置信章节标记，供 Stage A 和审核页展示
- 不创建 persona，不写正式图谱对象

## Acceptance Criteria

- [ ] 全书章节可分段并写入 `chapter_segments`
- [ ] 分段结果与 evidence span 可组合回跳原文
- [ ] 低置信章节被显式标记而非静默吞掉
- [ ] Stage A 可以直接消费分段结果

## Definition of Done

- [ ] Stage 0 单测覆盖 narrative/dialogue/poem/commentary 场景
- [ ] 支持章节级重跑
- [ ] 与 T02、T04 合同打通
