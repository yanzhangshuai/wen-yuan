# PRD：书籍导入流程重构

> 任务编号：`03-28-book-import-refactor`  
> 创建日期：2026-03-28  
> 优先级：P1

## 1. 背景

当前书籍导入流程存在三个核心问题：

1. **职责耦合**：`createBook` 同时承担"上传文件 + 切分章节 + 落库 Book + 落库 Chapters"，步骤1就写入章节，导致用户若不继续操作会产生孤儿章节，且无法重试切分。
2. **rawContent 冗余**：`books.raw_content` 字段已不再使用（代码未写入），但 schema 遗留该字段，造成迷惑。原始文件已通过 `sourceFileKey/sourceFileUrl` 存储在对象存储中，无需重复存于数据库。
3. **章节切分正则不完整**：`chapterSplit.ts` 的正则未覆盖全角空格（`\u3000`），也无空章节保护，容易在包含目录的文本中产生大量字数为 0 的无效章节。

## 2. 目标

重构导入流程为三步分离架构，同时优化章节切分逻辑：

1. **Step 1（上传）**：仅上传文件 + 写入 Book 元数据，不切分不写章节。
2. **Step 2（预览）**：从对象存储读取原文 → 实时切分 → 返回预览（不写DB）；用户确认后才写入章节。
3. **Step 3（解析）**：配置模型和范围 → 启动 AnalysisJob。

## 3. 范围

### In Scope

- 移除 `books.raw_content` 字段（Prisma schema + migration）。
- Storage Provider 增加 `getObject` 读取能力。
- `createBook`：移除章节切分，不再写入 `chapters` 表。
- `getChapterPreview`：改为从 storage 读取源文件 → 实时切分 → 返回预览（非DB读取）。
- `confirmBookChapters`：改为从 storage 读取源文件 → 切分作为内容 fallback（user override 优先）。
- `chapterSplit.ts`：修复全角空格匹配（`\u3000`），增加空章节过滤（`wordCount = 0` 的章节在无有效内容时合并或丢弃）。
- `errors.ts`：新增 `BookSourceFileMissingError`（sourceFileKey 为空时使用）。
- 前端 `import/page.tsx`：步骤标签由"章节预览"调整为"预览&确认"，其余流程保持不变。
- 更新所有受影响的单元测试。

### Out of Scope

- 书籍重新切分（已创建书籍重新切分归另一任务）。
- AI 辅助章节切分。
- 用户手动编辑章节（UI 手动合并/拆分）。
- 其他书库接口的改动。

## 4. 架构设计

### 三步流分离

```
POST /api/books                          → 上传文件 + 创建 Book（无 chapters）
GET  /api/books/:id/chapters/preview     → Storage读文件 → 切分 → 预览（纯计算）
POST /api/books/:id/chapters/confirm     → Storage读文件 → 确认写入 chapters
POST /api/books/:id/analyze              → 创建 AnalysisJob（不变）
```

### Storage Provider 扩展

```ts
interface StorageProviderClient {
  putObject(input: PutObjectInput): Promise<StoredObject>;
  deleteObject(key: string): Promise<void>;
  getObjectUrl(key: string): string;
  getObject(key: string): Promise<Buffer>;   // 新增
}
```

### 章节切分正则修复

```ts
// 修复前：\s+ 不匹配全角空格
/^(第[零〇一二三四五六七八九十百千万\d]+[回章节](?:\s+.+)?)$/

// 修复后：[\s\u3000]+ 同时匹配全角（\u3000）和半角空格
/^(第[零〇一二三四五六七八九十百千万\d]+[回章节](?:[\s\u3000]+.+)?)$/
```

空章节过滤：切分结束后，过滤掉 `wordCount === 0` 的章节，并重新分配 `index`。

## 5. 数据库变更

```sql
-- 移除 raw_content 字段
ALTER TABLE books DROP COLUMN raw_content;
```

对应 Prisma schema 删除：
```prisma
// 删除此行：
rawContent String? @map("raw_content") @db.Text
```

## 6. 验收标准

1. `POST /api/books` 成功后，`books` 表有新记录，`chapters` 表无任何对应章节。
2. `GET /api/books/:id/chapters/preview` 从 storage 读取文件并切分，正确识别"第X回"标题（含全角空格），不含 `wordCount=0` 的章节。
3. `POST /api/books/:id/chapters/confirm` 成功落库章节，章节内容来源优先级：user override > storage 切分内容。
4. `rawContent` 字段在 schema 和 DB 中均不存在，接口不返回该字段。
5. 全部单元测试通过（包含新增 storage mock 覆盖）。
6. `npx tsc --noEmit` 无错误，`npx eslint src` 无警告。

---

## 7. 补充需求：解析范围三模式（2026-03-28）

### 背景

原解析配置仅支持「全书」和「指定范围」两种模式，无法满足跳章（非连续）解析需求。

### 新增解析范围

| 模式 | scope 值 | 说明 |
|------|----------|------|
| 全书解析 | `FULL_BOOK` | 解析全书所有章节（原有） |
| 多选指定章节 | `CHAPTER_LIST` | 勾选具体章节（非连续，新增） |
| 指定范围 | `CHAPTER_RANGE` | 起止章节号连续区间（原有） |

### 数据库变更

```sql
-- 新增 chapter_indices 字段（PostgreSQL 整数数组）
ALTER TABLE "analysis_jobs" ADD COLUMN "chapter_indices" integer[] NOT NULL DEFAULT '{}';
```

Migration: `20260328100000_add_analysis_chapter_indices`

Prisma schema 新增字段：
```prisma
chapterIndices Int[] @default([]) @map("chapter_indices") // 指定章节编号列表（CHAPTER_LIST 任务）
```

### API 变更

`POST /api/books/:id/analyze` 请求体新增字段：
```ts
{
  scope         : "FULL_BOOK" | "CHAPTER_RANGE" | "CHAPTER_LIST",
  chapterStart  ?: number,   // 仅 CHAPTER_RANGE
  chapterEnd    ?: number,   // 仅 CHAPTER_RANGE
  chapterIndices?: number[], // 仅 CHAPTER_LIST，传入章节 no（index）列表
}
```

后端自动对 `chapterIndices` 去重并升序排序后存入 DB。

### 前端 UI 变更

- 解析范围下拉新增「多选指定章节」选项
- 选择「多选指定章节」时，上方章节列表显示复选框（含全选），已选行高亮
- 底部显示"已选 N / M 个章节"计数
- 切换范围模式时自动清空已选章节

### 验收标准（补充）

1. `CHAPTER_LIST` scope 传入 `chapterIndices: [5, 1, 3]`，DB 存储为 `[1, 3, 5]`（去重升序）。
2. `chapterIndices` 为空数组时，后端返回 400（`AnalysisScopeInvalidError`）。
3. 前端多选模式：全选/反选复选框正确工作，已选章节高亮显示。
4. 全部单元测试通过（414 tests）。
