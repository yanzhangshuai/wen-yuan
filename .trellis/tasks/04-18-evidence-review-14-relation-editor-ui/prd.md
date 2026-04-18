# feat: 简洁关系编辑器

## Goal

实现面向审核者的轻量关系编辑器，支持关系方向、多关系并存、动态变化、生效区间、证据绑定，以及“预设常用关系 + 自定义输入 + 后续归一提升”的关系编辑流程。

## Spec

- `docs/superpowers/specs/2026-04-18-evidence-review-architecture-rewrite-design.md` §5.2, §5.3, §8.3, §9.4, §9.6, §15

## Files

- Create: `src/components/review/relation-editor/**`
- Modify/Create: `src/app/admin/review/**`
- Create: `src/components/review/relation-editor/*.test.tsx`

## Requirements

### 1. Editing model

- 支持查看和修改：
  - `relationTypeKey`
  - `relationLabel`
  - `relationTypeSource`
  - `direction`
  - `effectiveChapterStart`
  - `effectiveChapterEnd`
  - evidence 绑定
- 同一人物对之间允许多条关系并存
- 必须能区分“原始提取关系文本”“当前归一关系”“关系来源是预设还是自定义”

### 2. Preset plus custom workflow

- 提供一组常用关系预设作为快捷选择
- 同时允许审核者直接输入自定义关系
- 自定义关系保存时不得被前端强制归一
- 审核者可以把自定义关系归并到预设关系，也可以保留为自定义关系

### 3. Simplicity constraints

- UI 必须保持简单清晰，不做成通用图谱后台
- 关系修改与 evidence、audit history 的跳转路径要短
- 对方向冲突、区间冲突要有显式提示，但不能干扰常规审核流

## Acceptance Criteria

- [ ] 审核者可完成关系方向、类型、区间和证据的编辑
- [ ] 同时支持预设关系和自定义关系输入
- [ ] 原始关系文本、当前归一关系、来源类型可并列展示
- [ ] 多关系并存与动态变化在 UI 中可读可改

## Definition of Done

- [ ] 组件测试覆盖预设选择、自定义输入、区间编辑、方向切换
- [ ] 与 T12、T16 契约打通
- [ ] 不再要求关系先进入目录再允许保存 claim
