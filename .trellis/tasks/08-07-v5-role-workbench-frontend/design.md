# 技术设计：roleWorkbench 前端适配

> 调研依据：`08-06-v5-review/research/role-workbench-audit.md` §3（前端组件清单 + 数据契约）

## 0. 迁移原则

前端 roleReview 系组件消费 persona 概念，但 v5 后端已是 entity 模型。适配 = **数据契约 persona→entity + API 路由重挂**，不改业务逻辑。

| v4 前端概念 | v5 契约 |
|---|---|
| `PersonaSummary` / `PersonaDetail` / `BookPersonaListItem` | `EntitySummary` / `EntityDetail` / `BookEntityListItem` |
| `personaId` / `personaName` | `entityId` / `entityName` |
| `fetchPersonaSummary`（personas.ts:71） | 改 `getBookById` 或 entity 服务 |
| `/api/personas`（顶层，已删） | 改 books 下或 admin 下路由 |

## 1. 活动组件改造

| 组件 | 改造 |
|---|---|
| `RoleWorkbenchPanel`（5 Tab 容器） | 数据源改 drafts/merge-suggestions 新契约 |
| `RoleReviewWorkbench`（888 行，主 Tab） | persona→entity 全契约；`/api/personas|biography|relationships` 改挂新路由 |
| `RoleReviewSidebar` / `RoleReviewSections` / `RoleReviewSheetFields` / `RoleReviewUtils` | 字段 persona→entity（name/localName→entityName/localName 等） |
| `EntityMergeTool` / `ManualEntityTool` | `acceptMergeSuggestion` 新契约；manual merge 重挂 |
| `AliasReviewTab` | `AliasMappingItem.personaId→entityId` |
| `ChapterEventsWorkbench`（927 行） | 事件选人下拉改 entity；role-workbench chapter-events 新契约 |
| `BookRoleWorkbenchSidebar` | 无大改（book 列表） |

## 2. 死代码删除（调研 §3.2 已确认零引用）

- `review/index.ts` barrel（无 import 方）
- `review/role-management-tab.tsx`（576 行，零引用）
- `review/persona-edit-form.tsx` / `relationship-edit-form.tsx` / `biography-edit-form.tsx`（仅被死 barrel 再导出）

## 3. 前端 lib 服务更新

- `src/lib/services/role-workbench.ts`：drafts/merge/chapter-events 接口对齐后端
- `src/lib/services/books.ts`：fetchBookPersonas → entity 版本
- `src/lib/services/{relationships,alias-mappings,validation-reports}.ts`：对齐后端

## 4. API 路由重挂

- `/api/personas|biography|relationships`（顶层已删）→ 组件改调 books 下或 admin 下存活路由
- `books/[id]/personas|relationships|alias-mappings|validation-reports`：backend 子任务已修 service，前端服务层对齐

## 5. 关键边界

| 场景 | 处理 |
|---|---|
| 顶层 personas/biography/relationships 路由不存在 | 前端 lib 服务改指向 books 下路由（backend 已提供） |
| bulkVerify 字段改名 | `biographyRecordCount→factCount` 前端同步 |
| 死代码删除风险 | 先 grep 确认零引用再删（调研已确认） |

## 6. 风险

- **依赖 backend 完成**：前端重挂前需 backend 的 API 稳定。
- **契约字段多**：persona→entity 涉及约 10 组件 + 5 个 lib 服务，需系统化替换（grep personaId 定位）。
