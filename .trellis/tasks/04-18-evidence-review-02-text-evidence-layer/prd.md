# feat: Text & Evidence Layer

## Goal

建立统一的文本、offset、segment、evidence span 基础设施，让任何 claim、审核动作和 projection 都能稳定回到原文章节位置。

## Spec

- `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §4, §5.1, §7.1, §8, §15

## Files

- Create: `src/server/modules/analysis/evidence/offset-map.ts`
- Create: `src/server/modules/analysis/evidence/evidence-spans.ts`
- Create: `src/server/modules/analysis/evidence/quote-reconstruction.ts`
- Create: `src/server/modules/analysis/evidence/index.ts`
- Create: `src/server/modules/analysis/evidence/*.test.ts`

## Requirements

### 1. Offset and normalization

- 原文和 normalized 文本必须并存
- offset 锚点以原文为准，normalized 文本只做检索与规则辅助
- 任意 evidence span 都能通过 `chapterId + startOffset + endOffset` 重建引用内容

### 2. Evidence persistence

- 提供统一 evidence 写入接口，支持：
  - 单 span 写入
  - 批量写入
  - 去重或幂等写入
  - 按 chapter / segment / run 查询
- evidence span 需要保存 `quotedText`、`normalizedText`、`speakerHint`、`narrativeRegionType`

### 3. Review-facing reads

- 提供高亮片段、上下文扩展、证据跳转 helper
- UI 和 API 不再各自发明 offset/quote 逻辑
- 对无效 span、越界 span、跨 segment span 要有显式错误

## Acceptance Criteria

- [ ] 任意 evidence span 都能稳定返回引用文本
- [ ] 原文高亮与 normalized 检索不互相污染
- [ ] 后续 Stage A/C 与审核 API 都能复用统一 evidence 接口
- [ ] 中文文本、标点、换行场景的 offset 测试通过

## Definition of Done

- [ ] evidence 模块具备单测
- [ ] 不再让后续任务自行拼接 quote
- [ ] 为 T05、T06、T12、T16 提供可复用 contract
