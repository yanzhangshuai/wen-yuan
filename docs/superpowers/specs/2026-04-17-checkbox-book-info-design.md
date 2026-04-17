# 多选框主题适配 + 书籍信息增强 设计文档

**日期：** 2026-04-17  
**状态：** 已审定，待实施  
**作者：** GitHub Copilot

---

## 一、背景与问题定义

### 1.1 多选框在四个主题下不明显

当前项目有 4 套主题（丹青/星空/靛藏/素雅），所有主题的 `--border` 与 `--background` 亮度对比均偏低：

| 主题 | `--border` 亮度 | `--background` 亮度 | ΔL |
|------|----------------|---------------------|----|
| 丹青 | 0.32 | 0.18 | 0.14 |
| 星空 | 0.14 | 0.04 | 0.10 ⚠️ |
| 靛藏 | 0.28 | 0.14 | 0.14 |
| 素雅 | 0.88 | 0.97 | 0.09 ⚠️ |

`Checkbox` 组件在未选中状态下是"透明背景 + 低对比边框"，实际上与背景几乎融合。

另外，导入向导第 3 步"多选指定章节"使用了原生 `<input type="checkbox">`，不受项目主题控制，在所有主题下都是浏览器默认样式。

**受影响范围（全局搜索结果）：**
- `src/components/ui/checkbox.tsx` — 核心组件
- `src/app/admin/knowledge-base/alias-packs/page.tsx` — 4 处 Checkbox
- `src/app/admin/knowledge-base/historical-figures/page.tsx` — 2 处 Checkbox
- `src/app/admin/knowledge-base/surnames/page.tsx` — Checkbox（同模式）
- `src/app/admin/knowledge-base/title-filters/page.tsx` — Checkbox（同模式）
- `src/app/admin/knowledge-base/name-patterns/page.tsx` — Checkbox（同模式）
- `src/app/admin/knowledge-base/ner-rules/page.tsx` — Checkbox（同模式）
- `src/app/admin/knowledge-base/prompt-extraction-rules/page.tsx` — Checkbox（同模式）
- `src/app/admin/books/import/page.tsx` — 原生 `<input type="checkbox">`（需替换）

### 1.2 书籍管理页面信息缺失

**导入向导（4 步向导）：**
- 第 1 步：用户填写书籍元数据和选择文件，有书名信息
- 第 2 步：CardDescription 里有 `《{book.title}》`，但位置不突出
- 第 3 步：无任何当前书籍信息，用户不知道在配置哪本书
- 第 4 步：BookDetailTabs 复用但无书籍标题显示

**书籍详情页（`/admin/books/[id]`）：**
- 已显示：标题、状态、作者、朝代、当前模型、章节数、人物数、创建时间、源文件
- 未显示：**最后一次解析架构**（sequential/twopass）
- 数据源：`analysis_jobs` 表中已有 `architecture` 字段（schema.prisma line 377）
- 当前 `getBookById.ts` 未查询该字段

---

## 二、设计方案

### 2.1 多选框可见性增强

**设计决策：在 Checkbox 未选中状态添加 `bg-muted/20` 背景填充**

原因：
- `bg-muted` 是语义化颜色，在所有主题下都比 `--background` 有细微偏差
- 不需要新增 CSS token，降低维护成本
- 20% opacity 足够形成视觉边界而不影响整体美观
- 选中后 `data-[state=checked]:bg-primary` 覆盖，不影响选中态

修改：
```diff
- "peer border-border data-[state=checked]:bg-primary ..."
+ "peer border-border bg-muted/20 data-[state=checked]:bg-primary ..."
```

**原生 checkbox 替换：** 导入向导 step 3 的 `<input type="checkbox">` 替换为 `<Checkbox>` 组件，保持与其他知识库页面一致。

### 2.2 导入向导书籍信息条

**设计决策：在步骤 2/3/4 上方添加内联"当前书籍"信息条**

信息条内容：`当前书籍：《{title}》`，若有 author/dynasty 也追加显示。  
位置：紧贴步骤导航指示器下方，每一步内容区上方。  
实现：在 import/page.tsx 中条件渲染（`step > 1 && createdBook` 时显示），保持内联 JSX 不抽取额外组件。

外观设计（遵循项目 UI 规范）：
```tsx
{step > 1 && createdBook && (
  <div className="flex items-center gap-2 px-4 py-2 rounded-md bg-muted/30 border border-border text-sm text-muted-foreground">
    <BookOpen size={14} />
    <span>当前书籍：<strong className="text-foreground">《{createdBook.title}》</strong></span>
    {/* 若有额外元数据（author/dynasty）在createdBook中可追加 */}
  </div>
)}
```

注意：`createdBook` 当前只有 `{ id, title }` 两个字段（由 `CreatedBookData` 类型约束），不需要修改该类型，只展示标题即可。

### 2.3 书籍详情页显示解析架构

**设计决策：扩展 getBookById DTO，添加 `lastArchitecture` 字段**

**后端变更（getBookById.ts）：**
1. `analysisJobs.select` 中加 `architecture: true`
2. `mapBookDetail` 中提取 `lastArchitecture: book.analysisJobs[0]?.architecture ?? null`

**类型变更（types/book.ts）：**
在 `BookLibraryListItem` 中新增：
```ts
/** 最后一次解析架构（null = 从未解析）。 */
lastArchitecture: "sequential" | "twopass" | null;
```

**前端展示（books/[id]/page.tsx）：**
在 `currentModel` 同行追加显示：
```tsx
{book.lastArchitecture && (
  <span>解析架构：{book.lastArchitecture === "sequential" ? "顺序式" : "两遍式"}</span>
)}
```

---

## 三、变更文件清单

### Task A：多选框增强

| 文件 | 操作 |
|------|------|
| `src/components/ui/checkbox.tsx` | 修改：添加 `bg-muted/20` 到 base className |
| `src/app/admin/books/import/page.tsx` | 修改：替换原生 `<input type="checkbox">` 为 `<Checkbox>` |

### Task B：书籍信息增强

| 文件 | 操作 |
|------|------|
| `src/types/book.ts` | 修改：`BookLibraryListItem` 添加 `lastArchitecture` 字段 |
| `src/server/modules/books/getBookById.ts` | 修改：查询 `architecture` 字段，映射到 `lastArchitecture` |
| `src/app/admin/books/[id]/page.tsx` | 修改：显示 `lastArchitecture` |
| `src/app/admin/books/import/page.tsx` | 修改：步骤 2/3/4 添加当前书籍信息条 |

---

## 四、验收标准

### 多选框：
- [ ] 在丹青、星空、靛藏、素雅四个主题下，未选中 Checkbox 的边框均清晰可见
- [ ] 导入向导第 3 步"多选指定章节"的章节选择框已替换为 `<Checkbox>` 组件
- [ ] 选中状态（checked/indeterminate）视觉不受影响
- [ ] 全局代码搜索确认无其他原生 checkbox 残留在 admin 页面

### 书籍信息：
- [ ] 导入向导第 2、3、4 步顶部显示"当前书籍：《书名》"信息条
- [ ] 书籍详情页元数据区显示"解析架构：顺序式/两遍式"（从未解析时不显示）
- [ ] 类型检查（pnpm type-check）通过
- [ ] 书籍详情页的 `getBookById.test.ts` 单元测试更新以覆盖 `lastArchitecture` 字段

---

## 五、不在范围内

- 不重构知识库列表页面的表格结构
- 不修改四个主题的 CSS token 值（不新增 `--checkbox-border` 等变量）
- 不修改 `BookDetailTabs` 组件
- 不修改导入向导的步骤流程逻辑
