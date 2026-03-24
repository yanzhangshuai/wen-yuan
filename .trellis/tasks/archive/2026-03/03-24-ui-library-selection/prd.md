# brainstorm: UI library selection

## Goal

为当前项目（Next.js 16 + React 19 + Tailwind v4）选择一个可持续的 UI 方案，兼顾开发效率、与现有代码风格一致性、后续可扩展性。

## What I already know

- 项目当前技术栈：Next.js 16、React 19、Tailwind v4、TypeScript。
- 现有页面样式以 Tailwind 原子类手写为主（`src/app/page.tsx`、`src/app/settings/settings-models-client.tsx`）。
- 前端规范明确强调：server-first、Tailwind utility、可复用基础组件放到 `src/components/ui`。
- 目前仓库还没有引入成体系 UI 组件库（如 MUI/Chakra/AntD 等）。

## Assumptions (temporary)

- 近期 UI 需求会持续增加（设置页、导入流程、审核页、图谱周边面板）。
- 你希望在速度和可定制之间取得平衡，而不是被重主题系统绑定。

## Open Questions

- 无（已完成本轮选型决策）。

## Requirements (evolving)

- 与 Next.js App Router 兼容。
- 与 React 19 兼容。
- 与 Tailwind v4 并存成本可控。
- 能支持中后台常见组件（表单、弹窗、表格、反馈、导航）。
- 不破坏当前“server-first + 轻量样式”开发习惯。

## Acceptance Criteria (evolving)

- [x] 确认 UI 技术路线（A/B/C 其一）
- [x] 明确 MVP 引入范围（仅基础组件 / 含复杂组件）
- [x] 明确不做项（避免一次性重构全部页面）

## Definition of Done (team quality bar)

- 选型理由和边界清晰
- 后续可直接进入最小落地（例如先落地 Button/Input/Dialog）
- 文档记录完成（本 PRD）

## Out of Scope (explicit)

- 本轮不进行整站视觉重做
- 本轮不引入两套并行 UI 体系
- 本轮不引入高级表格/图表全家桶（先用基础组件完成主要流程）

## Research Notes

### What similar tools do

- shadcn/ui：面向“复制源码到项目”的组件方案，强调可定制，官方安装文档覆盖 Next。
- Mantine：官方明确有 Next App Router 指南，但其组件本质是 client components。
- Chakra UI：官方 Next App 指南已覆盖，文档说明可用于 RSC 场景，但组件本质依赖客户端能力。
- MUI：官方有 Next App Router 集成方案，需要 `@mui/material-nextjs` 等配套。
- Ant Design：官方支持 Next App Router，但 React 19 需关注额外兼容补丁与样式注册配置。

### Constraints from our repo/project

- 代码已深度使用 Tailwind，且规范也偏 Tailwind。
- 项目仍在早期，组件抽象尚少，适合“渐进引入”而非一次性大迁移。
- 目标产品风格偏可定制（文学图谱类产品），不适合强品牌视觉默认皮肤。

### Feasible approaches here

**Approach A: shadcn/ui + Radix + Tailwind** (Recommended)

- How it works:
  - 使用 shadcn CLI 按需生成组件到 `src/components/ui`，继续 Tailwind 风格。
- Pros:
  - 与现有 Tailwind 最一致，迁移成本最低。
  - 组件源码在仓库内，可深度定制。
  - 适合“边做页面边补组件”的节奏。
- Cons:
  - 复杂组件（高级表格/图表）仍需额外生态组合。
  - 需要维护自己项目内的组件代码。

**Approach B: Chakra UI (v3)**

- How it works:
  - 引入 Provider 和 Chakra 组件体系，快速搭建中后台页面。
- Pros:
  - 组件完整度高，开发速度快。
  - 设计 token 与主题体系成熟。
- Cons:
  - 与 Tailwind 双体系并存，风格与工程心智会更复杂。
  - 组件层面更偏 client-side。

**Approach C: MUI / Ant Design**

- How it works:
  - 采用成熟企业组件库，优先解决“组件全家桶”问题。
- Pros:
  - 组件覆盖非常全面，文档/案例多。
- Cons:
  - 默认视觉风格较强，后续定制成本更高。
  - Next App Router 下需要额外集成配置；AntD 在 React 19 下还需兼容补丁关注。

## Decision (ADR-lite)

**Context**: 项目使用 Tailwind 且 UI 仍在成长阶段，需要高可定制 + 低迁移成本。  
**Decision**: 已确认采用 Approach A（shadcn/ui + Radix + Tailwind）。  
**Consequences**: 初期开发体验最佳；后续若出现高复杂业务组件，再按需补第三方专用库（如表格）。

## MVP Scope (locked)

- 首批基础组件：`Button`、`Input`、`Textarea`、`Select`、`Dialog`、`Form`、`Table`、`Badge`、`Alert`、`Skeleton`。
- 首批应用页面：优先覆盖 `settings` 流程（含“模型配置”相关页面）。
- 组件组织：统一放在 `src/components/ui`，页面只做业务编排，不重复造基础轮子。

## Technical Notes

- 已检查文件：`package.json`、`src/app/page.tsx`、`src/app/settings/settings-models-client.tsx`、前端规范文档。
- 参考资料：
  - https://ui.shadcn.com/docs/installation
  - https://ui.shadcn.com/docs/react-19
  - https://mantine.dev/guides/next
  - https://chakra-ui.com/docs/get-started/frameworks/next-app
  - https://chakra-ui.com/docs/components/concepts/server-components
  - https://mui.com/material-ui/integrations/nextjs/
  - https://ant.design/docs/react/use-with-next/
  - https://5x.ant.design/docs/react/v5-for-19/
