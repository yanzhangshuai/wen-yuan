---
stage: mvp
source: adapted from mindfold-ai marketplace-specs/shared/code-quality.md
---

# 代码质量规范

> 全局强制规则，适用于前端和后端所有代码。

---

## 代码风格与修改原则

### 必须遵守

- 遵循 **KISS**：优先选择直接、容易读懂的实现；只有在复用已经成立或扩展点明确时，才新增抽象层。
- 遵循 **DRY**：新增逻辑前先搜索仓库内是否已有相同或近似实现；能复用就复用，避免复制粘贴后分叉维护。
- 秉承**最小修改原则**：只改完成当前目标所必需的代码，尽量保持既有目录结构、公开接口、数据流和命名稳定。
- 编辑后必须完成**格式化与风格对齐**：缩进、import 顺序、命名、空行、引号风格都要与周边文件保持一致，不允许把个人习惯混入已有文件。
- 总体目标是让每次提交都**聚焦、可读、易审查**；除非需求明确要求，否则不要顺手引入新的 helper、配置、类型层或目录层。

### 代码示例

反例：

```tsx
// 为一次性展示逻辑新增两层抽象，并复制已有的标题处理逻辑
function trimBookTitle(title: string) {
  return title.trim();
}

function buildBookCardTitle(title: string) {
  return trimBookTitle(title);
}

export function BookCard({ rawTitle }: { rawTitle: string }) {
  const displayTitle = buildBookCardTitle(rawTitle);
  return <h2>{displayTitle}</h2>;
}
```

正例：

```tsx
import { normalizeBookTitle } from '@/lib/books/title';

// 优先复用已有逻辑；如果只是局部行为，直接在原位置做最小修改
export function BookCard({ title }: { title: string }) {
  const displayTitle = normalizeBookTitle(title);
  return <h2>{displayTitle}</h2>;
}
```

### 原因

- 简单直接的实现更容易被后续维护者快速理解，也更不容易藏入无意义的间接层。
- 复用已有代码能减少行为漂移，避免同一规则在多个副本里被改出不同结果。
- 最小修改可以降低回归风险，减少 review 噪声，并保留现有稳定结构带来的上下文优势。
- 格式统一能让 diff 聚焦在真实行为变化上，而不是缩进、命名或 import 排序噪声。

### 落地参考

- 修改前先搜索：`rg "目标逻辑关键词" src .trellis`
- `src/**/*.ts(x)` 改动后优先运行：`pnpm lint:fix`
- 提交前至少运行：`pnpm lint`
- 影响类型或构建链路时补充运行：`pnpm type-check` 或 `pnpm build`

---

## 禁止非空断言（`!`）

`!` 绕过 TypeScript 的 null 检查，是运行时崩溃的高发来源。

```typescript
// 禁止
const name = user!.name;
const val = data!.items![0]!;

// 正确：显式判断
const user = getUser();
if (!user) {
  return { success: false, code: 'USER_NOT_FOUND' };
}
const name = user.name;

// 正确：可选链 + 空值合并
const val = data?.items?.[0] ?? defaultValue;
```

---

## 禁止 `any`

```typescript
// 禁止
function parseOutput(data: any) { ... }

// 正确：用 unknown + Zod 校验
function parseOutput(data: unknown): ChapterAnalysis {
  return chapterAnalysisSchema.parse(data);
}
```

---

## 禁止 `@ts-ignore` / `@ts-expect-error`

这两个指令掩盖真实类型问题，应该修复根源而非压制错误。

```typescript
// 禁止
// @ts-ignore
doSomething(invalidArg);

// 正确：更新类型定义，或使用类型守卫
```

---

## 禁止 `console.log`（提交前）

调试时可用，但不得提交到代码库。

```typescript
// 禁止提交
console.log('解析结果:', result);

// 正确：使用结构化日志（或在提交前删除）
// 后端暂无 logger 时，用 console.error/warn 替代关键路径日志
```

---

## import 顺序

按以下顺序排列，组之间空一行：

```typescript
// 1. Node 内置
import path from 'node:path';

// 2. 外部包
import { z } from 'zod';
import { useQuery } from '@tanstack/react-query';

// 3. 内部模块（绝对路径 @/）
import { ApiResponse } from '@/types/api';
import { parseAiOutput } from '@/lib/ai-parser';

// 4. 相对路径
import { formatDate } from './utils';
import type { Props } from './types';
```

类型专用导入必须使用 `import type`：

```typescript
// 正确
import type { Character } from '@/types/analysis';

// 禁止混用不标注 type
import { Character, parseAiOutput } from '@/types/analysis';
```

---

## 命名约定

| 类型 | 风格 | 示例 |
|------|------|------|
| React 组件文件 | PascalCase | `CharacterCard.tsx` |
| Hook | camelCase + `use` 前缀 | `useGraphData.ts` |
| 工具函数文件 | kebab-case | `date-utils.ts` |
| 类型文件 | kebab-case 或 `types.ts` | `analysis-types.ts` |
| 目录 | kebab-case | `graph-dashboard/` |
| 布尔变量 | `is/has/should/can` 前缀 | `isLoading`, `hasVerified` |
| 常量 | SCREAMING_SNAKE_CASE | `MAX_RETRY_COUNT` |

---

## 错误处理

### 不能静默吞掉错误

```typescript
// 禁止
try {
  await analyzeChapter(chapterId);
} catch (e) {
  // 空 catch
}

// 正确：至少记录或向上抛出
try {
  await analyzeChapter(chapterId);
} catch (error) {
  console.error('章节分析失败', { chapterId, error });
  throw error;
}
```

### API 响应统一使用 `api-response-standard.md` 结构

参见 `.trellis/spec/backend/api-response-standard.md`，不要临时拼装响应结构。

---

## 消除死代码

提交前必须删除：

- 无用的 `import`（ESLint 会报警）
- 被注释掉的代码块
- `return` 之后的不可达代码
- 未使用的变量、函数、类型

```typescript
// 禁止提交
function processCharacter(char: Character) {
  // const old = char.name.toLowerCase();
  const result = newProcess(char);
  return result;
  cleanup(); // 不可达
}
```

---

## 提交前检查

```bash
# 每次提交前必须通过
pnpm lint
pnpm build   # 类型检查 + 构建
```
