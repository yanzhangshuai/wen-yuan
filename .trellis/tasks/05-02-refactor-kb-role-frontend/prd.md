# 重构知识库与角色资料前端模块 PRD

## 目标
统一 `/admin/knowledge-base/*`（11 个子模块，约 10000 行）与 `/admin/role-workbench/*`（约 5630 行）两大前端管理域的交互范式与代码组织，消除「Dialog / Sheet / 内联」三种编辑形态混用、重复样板代码、单文件过长等问题，建立可在两个域复用的 UI 抽象层，让后续新增子模块成本显著下降，并让管理员在不同模块间获得一致体验。

## 主要决策
- 禁用 Sheet 抽屉与对话框（Dialog）编辑表单。
- 统一为「列表 + 详情」双栏或路由式整页表单（即：点击编辑/新增进入 `/<module>/[id]` 或 `/<module>/new`，整页表单，保存后返回列表）。
- 字段极少且为纯确认类操作（如删除确认）允许使用 AlertDialog，但表单本身不放 Dialog。
- 角色资料域同样，编辑关系/传记/别名/章节事迹时进入页内子区域或子路由，不再使用 Sheet。
- 抽象组件命名：`EntityFormPage`（路由级），`BatchActionBar`，`EntityDetailLayout`（左列表+右详情或上下分区）。
- Sheet 组件在 KB/角色资料域中应被全部移除引用。

## 需求
- 所有知识库与角色资料模块编辑形态统一为页内/路由级表单（去掉 Dialog 与 Sheet）。
- 删除 `role-management-tab.tsx` 与 `[bookId]/relations/`、`[bookId]/time/` 空目录。
- 重构后单文件行数控制目标：可写模块 page.tsx ≤ 400 行。
- 保留现有 URL、功能、权限/角色限制。

## 验收标准
- 抽象层组件位于明确目录，附 Vitest 单测。
- 试点模块（≥2个，含至少1个 KB 简单模块+1个角色资料子表单）迁移完成，行为与重构前一致。
- `pnpm lint && pnpm type-check && pnpm test` 全部通过。
- 删除冗余文件。
- PRD 中明确列出未迁移模块清单与后续任务编号。

## Out of Scope
- 后端 API 改造、新增业务功能、数据库迁移、主题/暗色模式调整。

## 参考
- `research/knowledge-base-frontend.md`
- `research/role-workbench-frontend.md`
