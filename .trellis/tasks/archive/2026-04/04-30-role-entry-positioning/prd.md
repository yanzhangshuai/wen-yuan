# brainstorm: 角色录入功能定位调整

## Goal

将当前 `/admin/review` 从“审核中心”的产品定位调整为“角色资料”：AI 只是先生成一版人物、关系、传记事件与合并建议，核心价值是减少人工录入工作量，而不是让用户感觉自己在被动审核 AI 结果。

## What I already know

* 用户认为“审核中心”这个名称不准确，真实业务应是“角色录入功能”。
* 用户强调 AI 的定位是辅助预填一版大概内容，用来减少人工录入成本。
* 用户反馈“角色资料工作台”作为用户可见名称太长，需要收敛成更短的模块名。
* 现有路由为 `/admin/review` 和 `/admin/review/[bookId]`。
* 当前首页标题和 metadata 是“审核中心”，描述是“审核 AI 识别的人物、关系与传记事件”。
* 后台首页快捷入口仍叫“审核数据”，功能模块入口仍叫“审核中心”。
* 顶部管理导航 `src/components/layout/admin-header.tsx` 暴露入口文案为“审核中心”。
* `ReviewPanel` 里已有“角色审核”“章节事迹”“合并建议”“别名映射”“自检报告”五个页签。
* `RoleReviewWorkbench` 及相关组件已经承担角色级资料编辑、新增关系、新增传记、别名处理、手动/AI 来源筛选等能力。
* `ManualEntityTool` 和 `RoleManagementTab` 说明系统并非纯审核流，已有手动录入与人工修正基础。

## Assumptions (temporary)

* MVP 优先调整产品定位、导航文案和页面信息架构，不急于改数据库枚举或后端审核状态字段。
* 用户已选择更彻底的方向：用户可见文案、注释命名、内部组件/API 命名都需要规划迁移。
* `/admin/review` 和 `/api/admin/review/*` 已被页面、图谱跳转、前端 service、后端 API route、Trellis spec 引用；用户最终选择硬迁移，不把旧路径作为长期兼容入口。
* “待审核”“已审核”等状态仍可作为数据质量状态存在，但应弱化为“待确认/已确认/已录入”等面向录入流程的语言。

## Open Questions

* 暂无。

## Requirements (evolving)

* 顶层入口不再称为“审核中心”，统一命名为“角色资料”。
* 用户可见模块名采用“角色资料”，比“角色资料工作台”更短，同时覆盖录入、补全、确认和维护场景。
* 页面说明应表达：AI 生成初稿，人工补全与确认，目标是提高录入效率。
* 单书页面的主流程应以“角色资料”为中心，而不是以“AI 草稿审核”为中心。
* 保留 AI / 手动来源筛选，但文案应服务于录入语境，例如“AI 预填”“手动录入”。
* 保留确认、拒绝、合并、别名、自检等质量控制能力，但它们应作为录入工作台的辅助操作。
* 规划并执行内部命名迁移，避免长期保留 `review` 作为核心业务模块名。
* 页面主路径硬迁移为 `/admin/role-workbench` 与 `/admin/role-workbench/[bookId]`。
* 章节事迹 API 主路径硬迁移为 `/api/admin/role-workbench/books/:bookId/chapter-events...`。
* 后台首页、顶部导航、图谱页跳转等入口全部指向新路径。
* 旧 `/admin/review` 和 `/api/admin/review/*` 不作为长期兼容 API；如实现中为了避免用户书签 404 增加临时 redirect，必须明确标注为迁移辅助而非主入口。

## Acceptance Criteria

* [x] 管理后台首页入口、功能模块入口、顶部导航不再显示“审核中心”作为模块名。
* [x] `/admin/role-workbench` 首页标题使用“角色资料”，描述体现“AI 预填/人工补全/确认入库”的定位。
* [x] 单书工作台首屏文案不把用户默认定位为“审核员”，而是定位为“录入/校对角色资料的人”。
* [x] AI 来源相关文案表达为“AI 预填/AI 生成初稿”，不暗示 AI 是最终事实来源。
* [x] 不破坏现有角色、关系、传记、合并建议、别名映射、自检报告功能。
* [x] 内部组件/服务/后端模块命名从通用 `review` 迁移到角色资料工作台语义，或明确留下兼容层。
* [x] `/admin/review`、`/api/admin/review/*` 不再是主入口；所有内部链接、服务请求和测试应迁到新路径。

## Definition of Done (team quality bar)

* Tests added/updated where behavior or rendered text is covered.
* Lint / typecheck / CI green.
* Docs/notes updated if route or product terminology changes.
* Rollout/rollback considered if URL or API path changes.

## Out of Scope (explicit)

* 暂不重写 AI 解析 pipeline。
* 暂不改变 Prisma 枚举、审核状态机或数据库字段语义。
* 暂不重新设计整套后台视觉风格。

## Technical Notes

* 入口页：`src/app/admin/review/page.tsx`
* 单书页：`src/app/admin/review/[bookId]/page.tsx`
* 主交互组件：`src/components/review/review-panel.tsx`
* 角色工作台：`src/components/review/role-review-workbench.tsx`
* 角色侧栏：`src/components/review/role-review-sidebar.tsx`
* 文案工具：`src/components/review/role-review-utils.ts`
* 后台首页入口：`src/app/admin/page.tsx`
* 顶部导航：`src/components/layout/admin-header.tsx`
* 当前选择第 3 种范围后，`reviews.ts`、`components/review/*`、`server/modules/review/*`、`app/api/admin/review/*`、`app/admin/review/*` 都需要纳入迁移规划。
* 相关 spec 已迁移为 `.trellis/spec/backend/role-workbench-character-events.md`，用于记录“角色资料工作台”契约。

## Initial Product Framing

当前页面实际承载三类动作：

* 录入：新增/编辑角色基础资料、关系、传记事件、别名。
* 预填：AI 先生成角色和关联信息，作为人工录入的起点。
* 校对：确认、拒绝、合并、自检，用于保证录入结果质量。

因此更合适的定位不是“审核中心”，用户可见短名采用“角色资料”。

## Decision (ADR-lite)

**Context**: 当前模块已经覆盖角色资料、关系、传记、别名、合并建议、自检报告等多类操作。单纯叫“审核中心”会让用户误以为这里是 AI 结果审批页，而不是主录入工作区。

**Decision**: 顶层用户可见产品命名采用“角色资料”。用户选择完整硬迁移方向：除用户可见文案外，也要迁移内部组件、服务、后端模块与 API/路由命名；新页面路径采用 `/admin/role-workbench`，新 API 路径采用 `/api/admin/role-workbench/*`。内部领域命名、路由和 API 继续使用 `role-workbench`，避免为短文案再次扩大迁移面。

**Consequences**: 用户感知会从“审核 AI”转向“利用 AI 初稿完成角色资料录入”。实现范围扩大为重构级任务，需要同步更新路由、API、组件、服务、测试和 spec。旧链接不再作为主契约，若保留 redirect 也只作为迁移辅助。

## Migration Scope Options

**Option A: Add new route/API and keep legacy aliases**

* New product route: `/admin/role-workbench` and `/admin/role-workbench/[bookId]`.
* Keep `/admin/review` as redirect or compatibility route.
* New API path can be introduced as `/api/admin/role-workbench/*`, with old `/api/admin/review/*` retained as wrappers during migration.
* Pros: user-facing and code semantics become clearer while preserving old links.
* Cons: short term has duplicate route/API surface.

**Option B: Rename in place without changing URL/API**

* Keep `/admin/review` and `/api/admin/review/*`.
* Rename components/services/comments/spec wording to “角色资料工作台”.
* Pros: lower implementation risk.
* Cons: internal route/API remains semantically outdated.

**Option C: Hard rename route/API** (Selected)

* Replace `/admin/review` and `/api/admin/review/*` directly with `/admin/role-workbench` and `/api/admin/role-workbench/*`.
* Pros: cleanest final naming.
* Cons: highest risk; requires broad test updates and breaks old bookmarks unless explicit redirects are added.

## Implementation Plan

1. Rename user-facing routes and all internal links from `/admin/review` to `/admin/role-workbench`.
2. Rename role-workbench components/services/modules away from generic `review` where practical, keeping database status names unchanged.
3. Move chapter event API routes from `/api/admin/review/books/:bookId/...` to `/api/admin/role-workbench/books/:bookId/...` and update frontend service calls.
4. Update copy: “审核中心/审核数据/角色审核” becomes “角色资料/待确认” where it improves product fit.
5. Update affected tests and Trellis spec wording for the route/API contract.
6. Run lint, type-check, and focused tests for changed route/service/component surfaces.

## Implementation Result

* 页面主路径已硬迁移到 `/admin/role-workbench` 与 `/admin/role-workbench/[bookId]`。
* 章节事迹 API 已硬迁移到 `/api/admin/role-workbench/books/:bookId/chapter-events...`。
* 前端 service、管理后台入口、顶部导航、图谱快捷入口和相关测试已指向新路径。
* `src/server/modules/review/*` 已迁移为 `src/server/modules/roleWorkbench/*`；旧服务模块不再作为引用入口。
* 数据库枚举、Prisma 字段与持久化状态值保持不变，展示层改用“待确认/已确认”等录入语境文案。
* 旧 `/admin/review` 与 `/api/admin/review/*` 未保留兼容 wrapper，404 属于本次硬迁移的预期行为。
