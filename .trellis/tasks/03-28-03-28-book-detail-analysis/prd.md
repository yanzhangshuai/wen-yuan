# 书库详情页：解析进度与日志

## Goal

书库管理目前只有列表视图，缺少单书详情入口。需要新增 `/admin/books/[id]` 详情页，提供解析进度实时监控、历次解析任务记录（作为结构化日志）和已提取人物三大维度的信息，帮助管理员快速判断解析质量与定位错误。

同时，导入向导最后一步（Step 4）直接复用相同 Tab 布局，让用户在完成导入后立即看到解析进度、解析任务和人物三个维度，无需跳转到详情页。

## Requirements

- **R1** 书库列表页（`/admin/books`）书名列可点击，链接到 `/admin/books/:id`
- **R2** 详情页顶部展示书籍元数据（书名/作者/朝代/章节数/人物数/当前模型/错误摘要）及操作按钮（重新解析/删除）
- **R3** 详情页使用 Tab 布局，三个 Tab：解析进度 / 解析任务 / 人物
- **R4** **解析进度 Tab**：
  - 实时进度卡片（3 秒轮询 `/api/books/:id/status`），含进度条、阶段文字、错误摘要
  - 章节状态表格（no / title / parseStatus 带颜色 badge）
- **R5** **解析任务 Tab**（"解析日志"）：
  - 新增 `GET /api/books/:id/jobs` API，返回该书所有 AnalysisJob 按 createdAt 降序
  - 每条记录显示：状态 badge / 解析范围 / AI 模型名 / 创建时间 / 耗时 / 错误摘要（折叠展开）
- **R6** **人物 Tab**：
  - 复用现有 `GET /api/books/:id/personas`
  - 以卡片或表格展示：名称/性别/别名/官职/书内标签/置信度/审核状态
- **R7** 书籍不存在时返回 404 页面
- **R8** 解析进行中时每 3 秒自动刷新进度，完成/出错后停止轮询
- **R9** 导入向导 Step 4 直接嵌入 `BookDetailTabs` 组件（bookId + initialStatus），同时显示"返回书库列表"和"查看书籍详情"操作按钮

## Acceptance Criteria

- [ ] 点击书库列表书名跳转到详情页
- [ ] 详情页加载书籍不存在时显示友好 404
- [ ] 解析进度 Tab 进度条和章节状态实时更新
- [ ] 解析任务 Tab 显示历史所有 AnalysisJob 记录
- [ ] 人物 Tab 显示当前书籍提取的人物列表
- [ ] 导入向导 Step 4 展示相同三 Tab 布局（含操作按钮）
- [ ] 所有新 API 有对应 vitest 单元测试
- [ ] TypeScript 无类型错误，lint 通过

## Definition of Done

- Tests added/updated (unit/integration where appropriate)
- Lint / typecheck / CI green
- 新 API 路由有测试覆盖

## Technical Approach

### 新增 API

`GET /api/books/:id/jobs`
- 查询 `AnalysisJob` where `bookId = :id`，orderBy `createdAt desc`
- 返回字段：id / status / scope / chapterStart / chapterEnd / chapterIndices / attempt / errorLog / startedAt / finishedAt / createdAt / aiModel{name}
- 校验 bookId UUID，书不存在返回 404

### 新增 Server Module

`src/server/modules/analysis/jobs/listBookAnalysisJobs.ts`  
- 函数 `listBookAnalysisJobs(bookId)` → `AnalysisJobListItem[]`

### 新增 Frontend

```
src/app/admin/books/[id]/
  page.tsx                          # Server Component：初始加载书籍信息
  not-found.tsx                     # 404 页面
  _components/
    book-detail-tabs.tsx             # Tab 客户端切换（接收 bookId + initialStatus）
    parse-progress-panel.tsx         # 实时进度 + 章节表（3s 轮询，client）
    analysis-jobs-panel.tsx          # 解析任务历史列表（client，一次加载）
    personas-panel.tsx               # 人物列表（client，一次加载）
```

`BookDetailTabs` 接收 `{ bookId: string; initialStatus: string }`，同时被书籍详情页和导入向导 Step 4 复用。

### 客户端 Service

`src/lib/services/books.ts` 新增：
- `fetchBookJobs(bookId)` → `AnalysisJobListItem[]`
- `fetchBookPersonas(bookId)` → `BookPersonaListItem[]`

### 复用现有

- `/api/books/:id/status` 已返回章节 parseStatus
- `/api/books/:id/personas` 已存在
- `BookRowActions`（重新解析/删除）已存在，可复用

## Decision (ADR-lite)

**Context**: 是否需要新增专用 log 表还是复用 AnalysisJob 记录作为"解析日志"
**Decision**: 复用 AnalysisJob 记录。按时间序展示每次解析任务（状态/范围/耗时/错误），配合 chapter.parseStatus changelog 已满足"详细日志"需求，无需增加数据库复杂度。
**Consequences**: 暂无章节级时间戳（无法知道某章在哪个时间点开始/结束），可在未来需要时通过新增 ChapterJobEvent 表扩展。

**Context**: 导入向导 Step 4 与书籍详情页共用 Tab 布局
**Decision**: 将 `BookDetailTabs` props 收窄为 `(bookId, initialStatus)`，不再依赖完整的 `BookLibraryListItem`，两处均可轻量传参。
**Consequences**: Step 4 不需要额外 API 请求来获取书籍元数据，所有信息由内部各 Panel 自行按需请求。

## Out of Scope

- 章节级精确时间戳（每章开始/结束时间）
- 实时 WebSocket / SSE 推送（用轮询替代）
- 解析结果的人工审核/修改功能

## Technical Notes

- `listBookPersonas` 已在 `src/server/modules/personas/listBookPersonas.ts`
- `getBookStatus` 已返回 `chapters[]`（no/title/parseStatus）
- `BookRowActions` 在 `src/app/admin/books/_components/book-row-actions.tsx` 可复用
- AnalysisJob 的 scope 枚举：FULL_BOOK / CHAPTER_RANGE / CHAPTER_LIST
- `BookDetailTabs` 参数：`bookId: string; initialStatus: string`（书籍详情页和导入向导 Step 4 共用）
