# 角色资料前端模块现状

## 1. 页面与路由

| 路由 | 文件 | 行数 | 类型 | 职责 |
|---|---|---|---|---|
| `/admin/role-workbench` | `page.tsx` | 93 | Server Component | 列出可补全资料的书籍卡片，跳到具体书 |
| `/admin/role-workbench/[bookId]` | `[bookId]/page.tsx` | 103 | Server Component | 服务端预取 drafts/merge，注入客户端 Panel |
| 客户端主面板 | `components/review/role-workbench-panel.tsx` | 539 | Client | 顶部 Tab 切换 + 来源筛选 + 路由各子 Tab |

子目录 `[bookId]/relations/` 和 `[bookId]/time/` 当前为空（残留路径）。

## 2. 主要功能与交互（5 个 Tab）

### Tab 1：角色资料 (`RoleReviewWorkbench`，868 行)
- 左侧：角色列表（含搜索、过滤、排序），可折叠
- 右侧：当前角色四个分页签（基础信息 / 关系 / 传记 / 别名）
- **新增/编辑角色**：右侧主区中嵌入 `<section>` 内联表单（**不是抽屉**）
- **新增/编辑关系/传记/别名**：右侧 `<Sheet modal={false} showOverlay={false}>` 抽屉
- **删除角色**：`<AlertDialog>` 含级联影响预览
- **未保存修改**：`<AlertDialog>` 二次确认弹窗

### Tab 2：章节事迹 (`ChapterEventsWorkbench`，920 行)
- 左侧：章节列表
- 右侧：当前章节角色事迹列表
- **新增/编辑事件**：右侧 `<Sheet>` 抽屉（注意：与 Tab 1 关系/传记的 Sheet 是**不同实例、不同字段**）

### Tab 3：合并建议 (`EntityMergeTool` + 列表)
- 列表展示 AI 给出的合并建议（source vs target）
- 可接受/拒绝/暂缓；接受后切换到合并工具完成精细字段对齐

### Tab 4：别名映射 (`AliasReviewTab`，279 行)
- Table 展示别名 → 角色的映射，逐行确认/驳回

### Tab 5：自检报告 (`ValidationReportTab`，326 行)
- 报告卡片列表，逐条审阅

### 顶部
- 书名 + 待确认数量摘要
- 来源筛选（全部/AI/手动）
- Tab 切换栏含徽标（待办计数）

## 3. 用到的组件清单

`src/components/review/`：
- `book-role-workbench-sidebar.tsx` (94) — 书籍切换侧边栏
- `role-workbench-panel.tsx` (539) — 上面 Tab 容器
- `role-review-workbench.tsx` (868) — Tab 1 主体
- `role-review-sidebar.tsx` (136) — 角色列表
- `role-review-sections.tsx` (287) — 各分区展示
- `role-review-sheet-fields.tsx` (323) — 抽屉字段
- `persona-edit-form.tsx` (178) / `relationship-edit-form.tsx` (167) / `biography-edit-form.tsx` (190)
- `chapter-events-workbench.tsx` (920) — Tab 2
- `entity-merge-tool.tsx` (299) — Tab 3 合并工具
- `manual-entity-tool.tsx` (455) — 手动新建实体（也用于 Tab 3）
- `alias-review-tab.tsx` (279) — Tab 4
- `validation-report-tab.tsx` (326) — Tab 5
- `role-management-tab.tsx` (569) — 旧版本 Tab，似乎已被 RoleReviewWorkbench 替代

总代码量：约 5630 行。

## 4. 状态管理与数据流

- 数据访问：`src/lib/services/role-workbench.ts` / `personas.ts` / `relationships.ts` / `biography.ts` / `alias-mappings.ts` / `validation-reports.ts`
- 状态：纯 `useState` + `useEffect` + `useCallback`，无全局 store、无 SWR/React Query
- SSR 预取首屏 → Panel 接收 initial 数据 → 各操作完成后调用 `onRefresh*` 重新拉取
- `personaDetail` / `personas` 列表分两路加载，存在数据一致性边角处

## 5. 共性问题

1. **混合了 4 种编辑形态**：
   - 内联 section（角色编辑）
   - Sheet 抽屉（关系/传记/别名）
   - Sheet 抽屉（章节事迹，独立一份）
   - 内联表单（合并工具、手动新增）
   → 用户在不同 Tab 体验完全不同
2. **抽屉「重」**：
   - `<Sheet modal={false} showOverlay={false}>` 看上去像浮层但又不阻塞主区，导致点击主区列表会触发未保存检查 → 加 AlertDialog 二次确认
   - 字段多（角色 12 字段、传记 8 字段），抽屉里塞得很满，又不能改大
3. **多 Tab + 多状态字段**：`RoleWorkbenchPanel` 一个组件管 5 个 Tab、3 路懒加载、5 个 fetch 函数，复杂度高
4. **状态分散**：列表、详情、表单、筛选、错误、加载分别 `useState`，未沉淀 hook
5. **存在路由空目录** (`relations/` `time/`)，似乎是早期分页面方案的残留
6. **role-management-tab 与 role-review-workbench 功能重叠**：前者更简单，后者更全 — 当前应只用后者，但代码未删
7. **「来源筛选」放在最外层**：但只对 Tab 1 有用，对 Tab 2~5 无影响 → 容易误导用户
8. **未保存修改保护机制**：仅 Tab 1 内实现，其他 Tab 切换没有该保护

## 6. 与知识库模块的差异

| 维度 | 知识库 | 角色资料 |
|---|---|---|
| 主要交互 | CRUD 列表 + Dialog 编辑 | Tab + 列表 + 抽屉/内联混合 |
| 体量 | 单页 ~500-2000 行 | 单组件 868-920 行 |
| 风格 | 偏「设置页」 | 偏「专业工作台」 |
| 数据范围 | 全局静态词库 | 与 bookId 强绑定 |
| 弹层 | Dialog 为主 | Sheet 为主 + 内联 + AlertDialog |
| 共性问题 | 重复样板 / 缺统一抽象 | 形态混杂 / 单组件过大 |

**整体观感**：两个模块各自独立演化，未共享 UI 抽象。同一项目内编辑表单一会儿 Dialog 一会儿 Sheet 一会儿内联，风格割裂。

## 7. 后端 API（粗略）

| 域 | API 前缀 | 主要端点 |
|---|---|---|
| Drafts | `/api/admin/role-workbench` | GET drafts, GET merge-suggestions |
| Personas | `/api/admin/personas`, `/api/admin/books/[id]/personas` | CRUD + delete-preview |
| Relationships | `/api/admin/relationships` | CRUD + status |
| Biography | `/api/admin/biography` | CRUD + status |
| AliasMappings | `/api/admin/alias-mappings` | List + confirm/reject |
| Validation | `/api/admin/validation-reports` | List + acknowledge |
| Merge | `/api/admin/merge` | accept/reject/defer |
| Chapter Events | `/api/admin/chapters/.../events` | List + CRUD |

## 8. 重构候选点

1. **统一编辑形态**：选定 1-2 种主形态（如「右侧抽屉 + 内联次表单」 或 「居中对话框」），所有子表单按统一规范
2. **拆分 RoleWorkbenchPanel**：5 个 Tab → 路由化（`/admin/role-workbench/[bookId]/(roles|chapters|merge|aliases|validation)`），各 Tab 独立挂载、独立加载状态
3. **角色资料 Tab 内的二级 Tab 改为列表内 Section**：把「关系 / 传记 / 别名」内联到角色详情卡上（用 Section 折叠），减少层级
4. **抽离公共 hook**：`useEntityList` `useEntityForm` `useDirtyGuard`
5. **删除 role-management-tab.tsx**：与 role-review-workbench 重复
6. **清理空目录** `[bookId]/relations/` `[bookId]/time/`
7. **「来源筛选」下沉到 Tab 1 内部**
8. **复用知识库模块同款 `<DataTable>` `<EntityForm*>` `<DeleteConfirmDialog>` 抽象** → 双模块视觉一致
