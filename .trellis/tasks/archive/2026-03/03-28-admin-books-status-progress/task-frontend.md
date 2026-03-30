# 前端执行任务：Admin 书籍状态进度 + 行操作文档补充

> 关联任务：`03-28-admin-books-status-progress`  
> 更新时间：2026-03-28

## 1. 变更清单

- [x] 在书籍列表状态列增加“状态徽章 + 阶段文本 + 进度条”。
- [x] 对 `PROCESSING` 行进行自动轮询刷新（3 秒一次）。
- [x] 保留并确认“重试解析 / 删除书籍”行操作可用。
- [x] 补充接口行为文档（状态、重试、删除）。

## 2. 前端实现点

### 2.1 页面接入

- 页面：`src/app/admin/books/page.tsx`
- 改动：状态列改为渲染 `BookStatusCell` 客户端组件。

### 2.2 新增组件

- 文件：`src/app/admin/books/_components/book-status-cell.tsx`
- 职责：
  - 展示当前状态（`PENDING / PROCESSING / COMPLETED / ERROR`）
  - 展示解析阶段文本（`stage`）
  - 展示解析进度（`progress`，0-100）
  - 当状态为 `PROCESSING` 时自动轮询刷新

### 2.3 服务层补充

- 文件：`src/lib/services/books.ts`
- 新增：
  - `BookStatusSnapshot` 类型
  - `fetchBookStatus(bookId)` 方法（调用状态接口）

## 3. 行操作补充文档（重试 / 删除）

### 3.1 重试解析

- UI 入口：`BookRowActions` 中“重新解析”按钮
- 调用服务：`restartAnalysis(bookId)`
- API：`POST /api/books/:id/analyze`
- 请求体：`{}`（空对象，后端按默认策略重启全书解析）
- 成功反馈：Toast 成功提示 + `router.refresh()` 刷新列表
- 失败反馈：Toast 错误提示（优先展示接口返回 message/detail）

### 3.2 删除书籍

- UI 入口：`BookRowActions` 中“删除”按钮 + 二次确认弹窗
- 调用服务：`deleteBookById(bookId)`
- API：`DELETE /api/books/:id`
- 成功反馈：Toast 成功提示 + 关闭弹窗 + `router.refresh()`
- 失败反馈：Toast 错误提示

## 4. 状态查询文档（新增进度展示依赖）

- 服务方法：`fetchBookStatus(bookId)`
- API：`GET /api/books/:id/status`
- 返回核心字段：
  - `status: string`
  - `progress: number`
  - `stage?: string`
  - `errorLog?: string`
- 轮询策略：
  - 首次加载即拉取一次
  - `PROCESSING` 状态下每 3 秒轮询
  - 进入终态（`COMPLETED` / `ERROR`）后自动停止

## 5. 验收步骤

1. 打开 `/admin/books`，确认每行展示状态+进度+阶段。
2. 对一条 `PROCESSING` 书籍观察 10 秒，确认进度自动更新。
3. 点击“重新解析”，确认出现成功提示并列表刷新。
4. 点击“删除”，确认弹窗二次确认后删除并刷新。
