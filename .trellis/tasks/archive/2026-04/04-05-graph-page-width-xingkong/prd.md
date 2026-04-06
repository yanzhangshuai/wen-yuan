# 关系图谱页面宽度与星空主题修正

## Goal
修正访客端关系图谱页面的布局与视觉问题，让图谱场景拥有真正的沉浸式全宽展示，并让星空主题呈现深空层次而非纯黑底。

## Requirements
- `/books/:id/graph` 页面不再受 `(viewer)` 共享布局的 `max-width` 限制。
- 图谱页保留现有头部与交互能力，不影响书库首页等其他 viewer 页面布局。
- `xingkong` 主题下的图谱页背景需要呈现宇宙深邃感，避免单一纯黑背景。
- 修改应遵循现有前端组件和主题 token 组织方式。

## Acceptance Criteria
- [ ] 打开关系图谱页面时，主内容区域占满可用宽度。
- [ ] 书库首页等非图谱 viewer 页面仍保持现有最大宽度布局。
- [ ] `xingkong` 主题下图谱页具有深空渐层/星云层次，视觉不再是纯黑平涂。
- [ ] 相关前端检查通过，且不引入明显主题回归。

## Technical Notes
- 布局根因位于 `src/app/(viewer)/layout.tsx` 的 `main.max-w-[1440px]`。
- 图谱主容器位于 `src/components/graph/graph-view.tsx` 与 `src/components/graph/force-graph.tsx`。
- 星空主题图谱色值与场景覆盖位于 `src/theme/tokens/xingkong/index.css`。
