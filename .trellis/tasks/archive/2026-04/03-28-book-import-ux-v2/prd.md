# brainstorm: 书籍导入UX与进度功能优化

## Goal

对书籍导入向导进行整体优化：
1. 重构导入步骤的交互逻辑，使职责更清晰
2. 改进解析进度为按章节维度展示
3. 删除书籍时自动取消进行中的解析任务

---

## 已知背景

### 当前导入向导步骤

| Step | 标签 | 实际行为 |
|------|------|---------|
| 1 | 上传/元数据 | 上传文件 + createBook API |
| 2 | 预览&确认 | 仅显示一个"生成并检查章节"按钮（过渡态）|
| 3 | 模型配置 | 显示章节列表 + 模型选择 + 解析范围 → confirmBookChapters + startAnalysis |
| 4 | 完成 | 成功提示页 |

### 问题

1. **Step 2 是一个无意义的过渡步骤**（只有一个按钮）
2. **Step 3 混合了两个不同职责**：章节确认（内容） + 解析配置（AI参数）
3. **confirmBookChapters 在 handleStartAnalysis 里调用**，用户以为在配置AI，实际上同时确认了章节
4. **解析进度只有总进度条**（book.parseProgress），无法知道每章进度
5. **删除书籍不取消任务**，后台 job 仍可能继续写数据

### 代码位置

- `src/app/admin/books/import/page.tsx` — 导入向导（前端）
- `src/server/modules/books/deleteBook.ts` — 软删除（无取消逻辑）
- `src/server/modules/books/getBookStatus.ts` — 返回 `status/progress/stage`
- `src/app/api/books/[id]/status/route.ts` — 状态接口
- `src/generated/prisma/` — Prisma schema（Chapter 无 parseStatus 字段）

---

## Open Questions

1. 新导入向导步骤如何划分（见下方分析）？
2. 按章节进度：是在轮询进度接口时返回每章状态，还是独立接口？
3. 章节进度状态存在哪里（Chapter 表加字段 vs AnalysisJob 关联表）？

---

## Requirements (evolving)

### Issue 1: 导入交互流程重构
- 每个步骤职责单一
- confirmBookChapters 在用户点击"确认章节"时调用，不与启动解析混在一起

### Issue 2: 按章节进度展示
- 解析进度页面能看到每个章节的处理状态

### Issue 3: 删除书籍 → 取消解析
- deleteBook 软删除时，同步将 QUEUED/RUNNING 任务设为 CANCELED

---

## Technical Notes

- Prisma `AnalysisJob` 有 `status: AnalysisJobStatus`（QUEUED/RUNNING/SUCCEEDED/FAILED/CANCELED）
- `Chapter` 表目前无 `parseStatus` 字段，需评估是否需要加
- 当前 polling 进度走 `GET /api/books/:id/status`，返回整书状态
