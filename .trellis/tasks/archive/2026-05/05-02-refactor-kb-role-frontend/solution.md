# 05-02-refactor-kb-role-frontend 方案设计

## 1. 目录结构建议

- src/components/data/         # 通用数据抽象层
  - EntityListPage.tsx         # 通用列表页（含搜索、批量、分页、空态、错误）
  - EntityDetailPage.tsx       # 通用详情/表单页（支持新建/编辑，自动路由）
  - EntityForm.tsx             # 通用表单渲染（字段配置驱动）
  - BatchActionBar.tsx         # 批量操作条
  - EntityDetailLayout.tsx     # 左列表+右详情/上下分区布局
  - useEntityList.ts           # 列表数据管理 hook
  - useEntityForm.ts           # 表单状态/校验 hook
  - types.ts                   # 通用类型定义
  - __tests__/

- src/app/admin/knowledge-base/
  - <module>/
    - ListPage.tsx             # 具体模块列表页（复用 EntityListPage）
    - DetailPage.tsx           # 具体模块详情/表单页（复用 EntityDetailPage）
    - ...

- src/app/admin/role-workbench/
  - <tab>/
    - ListPage.tsx
    - DetailPage.tsx
    - ...

## 2. 抽象组件/Hook 清单

- EntityListPage
  - props: entityName, columns, fetchList, onSelect, batchActions, ...
  - 内部集成搜索、分页、批量、空态、错误、loading
- EntityDetailPage
  - props: entityName, fetchDetail, saveDetail, fields, ...
  - 自动区分新建/编辑，保存后跳转回列表
- EntityForm
  - props: fields, value, onChange, onSubmit, ...
  - 字段配置驱动渲染，支持自定义校验、分组、只读
- BatchActionBar
  - props: actions, selected, onAction
- EntityDetailLayout
  - props: left, right 或 top, bottom
- useEntityList
  - 管理列表数据、选中、批量、分页、loading、error
- useEntityForm
  - 管理表单状态、校验、提交、dirty 检测

## 3. 试点模块建议

- KB 域：book-types（最简单，CRUD）
- 角色资料域：角色基础信息 Tab（无复杂嵌套）

## 4. 迁移/重构原则

- 允许大范围重命名、props/数据流重构、UI/UX 微创新
- 允许合并/拆分模块、抽离通用逻辑
- 允许前端先 mock/adapter 后端接口
- 新抽象组件必须有 Vitest 单测和 JSDoc/README

## 5. 里程碑拆分建议

1. 抽象层组件与 hooks 雏形（含单测）
2. 试点模块迁移（book-types + 角色基础信息）
3. 复杂模块迁移（如 alias-packs、关系/传记 Tab）
4. 全量替换、冗余文件清理、文档补全

---
如需详细 API 设计或先出某一部分代码样例，请指定优先级。
