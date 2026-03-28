# 后端执行任务：书籍导入流程重构

> 关联任务：`03-28-book-import-refactor`  
> 更新时间：2026-03-28

## 1. 变更清单

- [ ] `prisma/schema.prisma`：移除 `rawContent` 字段。
- [ ] 创建 migration：`ALTER TABLE books DROP COLUMN raw_content`。
- [ ] `storage.types.ts`：`StorageProviderClient` 增加 `getObject(key): Promise<Buffer>`。
- [ ] `localStorageProvider.ts`：实现 `getObject`（读取本地文件）。
- [ ] `ossStorageProvider.ts`：实现 `getObject`（从 OSS 下载）。
- [ ] `chapterSplit.ts`：修复正则全角空格，增加空章节过滤后处理。
- [ ] `errors.ts`：新增 `BookSourceFileMissingError`。
- [ ] `createBook.ts`：移除 `splitRawContentToChapterDrafts` 调用和 `chapter.createMany`；移除 `input.rawContent`。
- [ ] `getChapterPreview.ts`：改为 `storage.getObject(sourceFileKey)` → 解码 → 切分，不读 DB chapters。
- [ ] `confirmBookChapters.ts`：改为从 storage 读取源文件作为内容 fallback。
- [ ] 更新所有相关测试文件（mock storage）。

## 2. 详细实现说明

### 2.1 `chapterSplit.ts` 正则修复

```ts
// 修复：支持全角空格 \u3000
const CHINESE_CHAPTER_TITLE_REGEX = 
  /^(第[零〇一二三四五六七八九十百千万\d]+[回章节卷](?:[\s\u3000]+.+)?)$/;

const PRELUDE_TITLE_REGEX = 
  /^(楔子|序章?|序言|引子|前言|自序)(?:[\s\u3000]+.+)?$/;

const POSTLUDE_TITLE_REGEX = 
  /^(后记|尾声|跋|附录|结语)(?:[\s\u3000]+.+)?$/;
```

空章节过滤（在 `splitRawContentToChapterDrafts` 末尾追加）：

```ts
// 过滤空章节（wordCount=0）并重新编号
const result = titleLines.map(...);
const filtered = result.filter(item => item.wordCount > 0);
return filtered.map((item, index) => ({ ...item, index: index + 1 }));
```

### 2.2 Storage `getObject` 接口

```ts
// storage.types.ts 新增
getObject(key: string): Promise<Buffer>;
```

`LocalStorageProvider.getObject`：
```ts
async getObject(key: string): Promise<Buffer> {
  const normalizedKey = normalizeStorageKey(key);
  const targetPath = this.resolveFilePath(normalizedKey);
  return readFile(targetPath);
}
```

`OssStorageProvider.getObject`：使用 `oss.get(key)` 并转换为 Buffer。

### 2.3 `createBook.ts` 简化

移除：
- `splitRawContentToChapterDrafts` 导入与调用
- `chapter.createMany` 调用
- `input.rawContent` 字段（整个 `CreateBookInput` 移除该字段）
- Storage 失败时的章节回滚逻辑简化为只回滚文件

`CreateBookInput` 改为：
```ts
export interface CreateBookInput {
  title?      : string;
  author?     : string;
  dynasty?    : string;
  description?: string;
  fileName    : string;
  fileMime?   : string | null;
  fileContent : Buffer;   // 原始二进制（由 Route 传入，不再是文本字符串）
}
```

> 注：`fileContent` 仍由 route 传入，但 createBook 不负责解码（解码在 route 层）。
> 实际 storage 存储的是二进制原文件；读回时 getChapterPreview 负责解码。

Wait - 当前 `createBook` 接受 `rawContent: string` 并直接 `putObject` 存储文本。应改为接受 `Buffer` 并 `putObject(body: Buffer)`，这样取回时 decode 一次即可。

调用方（route.ts）将 `fileBuffer` 直接传入，createBook 不负责解码文字，getChapterPreview 时 `getObject` 返回 Buffer 后再 `decodeBookText(buffer)`。

### 2.4 `getChapterPreview.ts` 重构

```ts
async function getChapterPreview(bookId: string): Promise<ChapterPreviewResult> {
  const book = await prismaClient.book.findFirst({
    where : { id: bookId, deletedAt: null },
    select: { id: true, sourceFileKey: true }
  });

  if (!book) throw new BookNotFoundError(bookId);
  if (!book.sourceFileKey) throw new BookSourceFileMissingError(bookId);

  const fileBuffer = await storageClient.getObject(book.sourceFileKey);
  const rawContent = decodeBookText(fileBuffer);           // 统一解码函数（复用或本地定义）
  const items = splitRawContentToChapterPreview(rawContent);

  return { bookId: book.id, chapterCount: items.length, items };
}
```

### 2.5 `confirmBookChapters.ts` 重构

原来靠 DB chapters 提供正文 fallback，现改为靠 storage：

```ts
async function confirmBookChapters(bookId, items) {
  if (items.length === 0) throw new ChapterConfirmPayloadError("至少需要确认一个章节");

  const book = await prismaClient.book.findFirst({
    where : { id: bookId, deletedAt: null },
    select: { id: true, sourceFileKey: true }
  });

  if (!book) throw new BookNotFoundError(bookId);
  if (!book.sourceFileKey) throw new BookSourceFileMissingError(bookId);

  // 从 storage 读取并切分作为内容 fallback
  const fileBuffer = await storageClient.getObject(book.sourceFileKey);
  const rawContent = decodeBookText(fileBuffer);
  const drafts = splitRawContentToChapterDrafts(rawContent);
  const draftContentByIndex = new Map(drafts.map(d => [d.index, d.content]));

  const normalizedItems = normalizeChapterItems(items);
  const now = new Date();

  await prismaClient.$transaction(async (tx) => {
    await tx.chapter.deleteMany({ where: { bookId } });
    await tx.chapter.createMany({
      data: normalizedItems.map(item => ({
        bookId,
        type      : item.chapterType,
        no        : item.index,
        unit      : "回",
        noText    : null,
        title     : item.title.trim(),
        content   : item.content?.trim() || draftContentByIndex.get(item.index) || "",
        isAbstract: item.chapterType === ChapterType.PRELUDE,
        createdAt : now,
        updatedAt : now
      }))
    });
  });

  // 返回结果...
}
```

## 3. API 契约变更

### POST /api/books

**无变化**（从客户端视角）：入参和返回值格式不变。

**内部行为变化**：
- Before: 上传文件 → 解码 → 切分 → write Book + write Chapters
- After: 上传文件 → 解码 → 存 storage → write Book（无 Chapters）

### GET /api/books/:id/chapters/preview

**无变化**（契约不变）：仍返回 `{ bookId, chapterCount, items[] }`。

**内部行为变化**：从读 DB chapters 改为从 storage 实时切分。

### POST /api/books/:id/chapters/confirm

**无变化**（契约不变）：仍接受 `{ items[] }` 并落库。

**内部行为变化**：不再依赖 DB 中已存在的 chapters，改从 storage 读取 fallback 内容。

## 4. 测试覆盖

| 文件 | 测试场景 |
|------|----------|
| `chapterSplit.test.ts`（新建） | 全角空格识别、空章节过滤、楔子/后记类型判断 |
| `createBook.test.ts` | 不再校验 createMany chapters；校验 putObject 入参为 Buffer |
| `getChapterPreview.test.ts` | mock storage.getObject 返回文本 Buffer；校验切分结果 |
| `confirmBookChapters.test.ts` | mock storage.getObject；验证内容 fallback + user override 优先级 |

## 5. 验证点

1. `POST /api/books` 后，`chapters` 表无对应记录。
2. `GET /api/books/:id/chapters/preview` 返回切分后章节列表，不含空章节。
3. 全角空格标题（`第一回\u3000贾雨村风尘怀闺秀`）正确识别。
4. `POST /api/books/:id/chapters/confirm` 正确写入章节，user override 内容优先。
5. `npx tsc --noEmit` 无错误。
6. 全部单元测试通过。
