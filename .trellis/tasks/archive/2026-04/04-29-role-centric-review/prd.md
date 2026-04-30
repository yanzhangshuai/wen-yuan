# 角色为中心的审核面板重构

## Goal

将书籍审核中心从"按数据类型分散在多个 Tab"调整为"以角色为中心的统一审核工作台"。
管理员选中一个角色后，应能在同一界面查看和处理该角色的基础资料、关系、传记事件与别名映射，减少在"角色管理 / 关系草稿 / 传记事件 / 别名映射"之间反复切换。

本任务先交付角色工作台 MVP，参考 `ChapterEventsWorkbench` 的清晰交互模式：可折叠左侧导航、中部审核内容、右侧 Sheet 编辑表单、状态徽章和行内操作。

## What I already know

- 现有 `ReviewPanel` 有 7 个顶层 Tab：角色管理 / 关系草稿 / 传记事件 / 章节事迹 / 合并建议 / 别名映射 / 自检报告。
- `RoleManagementTab` 只做角色基础资料 CRUD，看不到该角色的关系、传记事件和别名映射。
- `review-panel.tsx` 当前默认进入 `roles`，关系和传记仍分别在独立 Tab 中按全局列表展示。
- `ChapterEventsWorkbench` 是较清晰的布局参考：
  - 左侧：章节进度列表（可折叠）。
  - 中部：分组事件流、状态徽章、行内确认/拒绝/编辑/删除。
  - 右侧 Sheet：弹出式编辑表单。
  - 顶部：筛选与视图切换。
- 后端 API 大体具备，但前端 service 封装并不完全：
  - 角色：`fetchBookPersonas` / `createBookPersona` / `patchPersona` / `deletePersona` 已存在。
  - 关系：后端有 `GET/POST /api/books/:id/relationships` 与 `PATCH /api/relationships/:id`，前端当前只有 `patchRelationship`，需要补 `fetch/create/delete/status` 等封装时再按实际接口确认。
  - 传记：后端有 `POST /api/personas/:id/biography` 与 `PATCH /api/biography/:id`，前端当前只有 `patchBiography`，新增/删除能力需要补 service。
  - 别名：已有 `fetchAliasMappings` / `confirmAliasMapping` / `rejectAliasMapping` / `createAliasMapping`，可按 `personaId` 在前端过滤。
  - 章节事迹：已有 `ChapterEventsWorkbench` 和 chapter-events API，但它是章节优先工作台，不适合直接整组件嵌入角色详情。

## Requirements

- 新增「角色审核」顶层 Tab，并设为审核中心默认入口。
- MVP 中移除或隐藏旧的「角色管理 / 关系草稿 / 传记事件」顶层 Tab，避免同一职责双入口造成混乱。
- 保留「章节事迹 / 合并建议 / 别名映射 / 自检报告」作为全局视图。
- 新工作台采用三栏布局：
  - 左侧角色列表，可折叠。
  - 中部角色审核工作区。
  - 右侧 Sheet 承载新增/编辑表单。
- 左侧角色列表支持：
  - 搜索：标准名、书内名、别名、标签。
  - 来源筛选：全部 / AI 生成 / 手动创建。
  - 排序：按名称 / 按来源。
  - 行内徽章：至少展示关系待审数、传记待审数、别名待审数。
- 中部工作区以子 Tab 组织 MVP 内容：
  - 基础资料。
  - 关系。
  - 传记事件。
  - 别名。
- 基础资料子区：
  - 展示并编辑角色主档与当前书内 Profile 字段。
  - 支持新增角色、编辑角色、删除角色。
  - 删除前必须复用现有 delete-preview 级联预览确认，不允许直接删除。
- 关系子区：
  - 双向展示当前角色的出向关系和入向关系。
  - 用箭头和方向文案标识 `当前角色 -> 对方` 与 `对方 -> 当前角色`。
  - 支持确认/拒绝待审关系。
  - 支持编辑关系字段。
  - 支持新增关系；MVP 新增关系只创建当前角色为 `source` 的出向边。
  - 入向关系编辑必须明确提示它属于对端指向当前角色的边，不应在 UI 上伪装成反向边。
- 传记事件子区：
  - 展示当前角色的传记事件，按章节顺序排列。
  - 支持确认/拒绝待审事件。
  - 支持新增、编辑、删除传记事件；若当前后端/前端封装缺口存在，需补最小 service wrapper。
- 别名子区：
  - 展示与当前角色绑定的别名映射。
  - 支持确认/拒绝待审别名。
  - 支持手动新增别名映射。
  - 不在本任务内重做全局别名映射页。
- Sheet 表单有未保存修改时，关闭 Sheet 或切换角色必须弹确认，避免丢失用户输入。
- 视觉与交互应对齐 `ChapterEventsWorkbench`：折叠侧栏、紧凑列表、状态徽章、行内图标按钮、右侧 Sheet。

## Data Assembly Strategy

- 角色列表数据来自 `fetchBookPersonas(bookId)`。
- 当前角色详情优先来自 `fetchPersonaDetail(personaId)`，用于获得 `relationships` 与 `timeline`。
- 关系待审计数可由 `fetchDrafts(bookId)` 的 `relationships` 按 `sourcePersonaId/targetPersonaId` 聚合得到；若改用 `fetchPersonaDetail`，需确认详情字段是否包含完整状态。
- 传记待审计数可由 `fetchDrafts(bookId)` 的 `biographyRecords` 按 `personaId` 聚合得到。
- 别名待审计数可由 `fetchAliasMappings(bookId)` 按 `personaId` 和 `status=PENDING` 聚合得到。
- MVP 不要求新增聚合接口；只有当前端聚合导致明显性能或契约问题时，才补后端只读接口。

## Technical Approach

- 新增 `RoleReviewWorkbench` 作为顶层角色审核工作台组件，避免继续膨胀 `review-panel.tsx`。
- 将角色工作台内部拆分为高内聚子组件：
  - `RoleReviewSidebar`：角色列表、筛选、排序、待审徽章。
  - `RoleReviewWorkspace`：当前角色摘要与子 Tab 容器。
  - `RoleBasicsSection`：基础资料展示与操作入口。
  - `RoleRelationshipsSection`：双向关系列表与操作入口。
  - `RoleBiographiesSection`：传记事件列表与操作入口。
  - `RoleAliasesSection`：别名映射列表与操作入口。
  - `RoleReviewSheet` 或按实体拆分的 Sheet 表单容器。
- 优先复用已有表单和服务：
  - `RoleManagementTab` 中成熟的角色表单逻辑可抽出复用，或作为参考重建到独立组件中。
  - `RelationshipEditForm` / `BiographyEditForm` 可先复用；若需要 Sheet dirty guard，再包一层容器管理脏状态。
  - `ChapterEventsWorkbench` 只作为视觉和交互参考，不在 MVP 中直接嵌入。
- `ReviewPanel` 只负责顶层 Tab 编排和首屏数据传递，不承载角色工作台内部复杂状态。
- 补 service wrapper 时保持 service 层只做请求封装，不把复杂业务判断塞进组件。

## Decision (ADR-lite)

**Context**: 现有审核中心按数据类型组织，导致同一角色的信息散落在不同 Tab 中，审核员需要反复切换，难以形成角色级判断。

**Decision**: 采用角色为中心的信息架构。MVP 新建「角色审核」工作台，替代「角色管理 / 关系草稿 / 传记事件」三个顶层入口；保留「章节事迹 / 合并建议 / 别名映射 / 自检报告」全局视图。章节事迹的角色内嵌不进入 MVP，只预留交互与数据扩展点。

**Consequences**: MVP 可控，能先解决最混乱的角色级审核问题；缺点是短期内章节事迹仍保留全局入口，角色内无法完整处理章节事迹。后续如需要，可基于本工作台新增 `RoleChapterEventsSection`，但应抽取共享卡片/表单而不是直接嵌入整套章节工作台。

## Acceptance Criteria

- [ ] 进入审核中心默认显示「角色审核」工作台。
- [ ] 旧的「角色管理 / 关系草稿 / 传记事件」顶层入口不再作为主要入口展示。
- [ ] 选中任一角色后，同一页可查看并处理该角色基础资料、关系、传记事件、别名映射。
- [ ] 关系子区同时展示出向和入向关系，并清楚标识方向。
- [ ] 关系、传记、别名的确认/拒绝操作通过现有审核 API 或最小新增 service wrapper 完成。
- [ ] 新增/编辑操作使用右侧 Sheet，关闭或切换角色时能保护未保存修改。
- [ ] 角色删除必须先显示 delete-preview 级联影响，再允许确认删除。
- [ ] 视觉与 `ChapterEventsWorkbench` 保持一致的工作台风格。
- [ ] 为新工作台关键交互补充 Vitest/React Testing Library 用例。
- [ ] `pnpm lint` / `pnpm type-check` / 相关测试通过。

## Definition of Done

- 新增/更新前端组件测试，覆盖：
  - 默认入口。
  - 角色选择与筛选。
  - 子区按当前角色过滤。
  - 双向关系方向展示。
  - dirty guard。
  - 删除预览确认。
- 服务封装新增时补对应单元测试或通过组件 mock 覆盖调用契约。
- `review-panel` 顶层入口调整完成，角色工作台复杂逻辑不堆在 `review-panel.tsx`。
- 代码遵守前端组件规范、类型安全规范、共享代码质量规范。

## Out of Scope

- 不调整数据库 schema。
- 不重做「合并建议 / 自检报告」面板。
- 不重做全局「别名映射」页。
- 不在 MVP 中内嵌完整「章节事迹」角色视图；只保留独立全局「章节事迹」Tab。
- 不引入新的 UI 组件库；继续使用现有 shadcn/Radix 基础组件。
- 不改变 AI 解析 pipeline、prompt 或数据生成逻辑。

## Phase 2 Follow-up: Role Chapter Events

后续如需要把章节事迹也纳入角色工作台，应单独开任务：

- 设计 `RoleChapterEventsSection`。
- 从 `ChapterEventsWorkbench` 抽取共享事件卡片、状态徽章和 Sheet 表单逻辑。
- 明确按角色聚合章节事迹的 API 或前端聚合策略。
- 避免一个组件同时承担"章节优先"和"角色优先"两种工作流。

## Technical Notes

已核对的关键文件：

- `src/components/review/review-panel.tsx` - 当前审核中心顶层 Tab 编排。
- `src/components/review/role-management-tab.tsx` - 当前角色 CRUD，可复用/迁移表单逻辑。
- `src/components/review/chapter-events-workbench.tsx` - 视觉和交互参考，不直接整组件嵌入 MVP。
- `src/components/review/relationship-edit-form.tsx` - 关系编辑表单。
- `src/components/review/biography-edit-form.tsx` - 传记编辑表单。
- `src/lib/services/books.ts` - `fetchBookPersonas` / `createBookPersona`。
- `src/lib/services/personas.ts` - `fetchPersonaDetail` / `patchPersona` / `deletePersona` / delete-preview。
- `src/lib/services/reviews.ts` - `fetchDrafts` / bulk verify/reject / chapter-events services。
- `src/lib/services/alias-mappings.ts` - 别名映射审核服务。
- `src/lib/services/relationships.ts` - 当前仅有关系 PATCH wrapper，新增能力需补齐。
- `src/lib/services/biography.ts` - 当前仅有传记 PATCH wrapper，新增能力需补齐。

## Open Questions

（暂无；当前按 MVP 范围进入实现准备。）
