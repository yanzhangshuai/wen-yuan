# 知识库前端模块现状

> 路径：`src/app/admin/knowledge-base/`
> 总代码量：~10000 行，集中在 12 个 `page.tsx` 客户端组件

## 1. 模块清单

| 子模块 | 路由 | 行数 | 主要功能 | 列表形式 | 编辑形式 | 批量操作 | 备注 |
|---|---|---|---|---|---|---|---|
| 总览 | `/page.tsx` | 113 | 展示模块入口与统计 | Card 网格 | — | — | 静态门户 |
| book-types | `/book-types` | 364 | 书籍类型 CRUD | Table | Dialog | ❌ | 体量小、最简单 |
| alias-packs | `/alias-packs` | **2249** | 别名知识包：包+条目+版本+审核 | 双栏（左侧包列表 + 右侧条目 Table）| Dialog 多个 | ✅ | 模块最复杂；包含审核流 |
| surnames | `/surnames` | 1064 | 姓氏词库 | Table+复选 | Dialog | ✅ | 含「AI 生成」对话框、导入对话框 |
| title-filters | `/title-filters` | 1072 | 泛化称谓过滤 | Table+复选 | Dialog | ✅ | 含「AI 生成」对话框 |
| relationship-types | `/relationship-types` | 983 | 关系类型 | Table+复选 | **Sheet 抽屉** | ✅ | 唯一用 Sheet 编辑的 KB 模块 |
| prompt-templates | `/prompt-templates` | 444 | Prompt 模板 + 版本 | 左侧列表 + 右侧版本 Table | Dialog | ❌ | 含 diff 对比 |
| ner-rules | `/ner-rules` | 878 | NER 词典规则 | Table+复选 | Dialog | ✅ | 含 AI 生成、排序持久化 |
| prompt-extraction-rules | `/prompt-extraction-rules` | 913 | Prompt 提取规则 | Table+复选 | Dialog | ✅ | 含 AI 生成、预览、排序 |
| historical-figures | `/historical-figures` | 566 | 历史人物词库 | Table+复选 | Dialog | ✅ | 含导入对话框 |
| name-patterns | `/name-patterns` | 551 | 姓名模式规则 | Table+复选 | Dialog | ✅ | 含规则测试器 |
| change-logs | `/change-logs` | 182 | 变更日志（只读） | Table | Dialog（详情） | ❌ | 只读 |

## 2. 交互模式分布

- **编辑表单**：
  - **Dialog 对话框**：除 `relationship-types` 外的所有可编辑模块（10/11）
  - **Sheet 抽屉**：仅 `relationship-types`
- **删除确认**：所有可写模块均使用 `AlertDialog`
- **AI 生成**：`surnames` / `title-filters` / `ner-rules` / `prompt-extraction-rules` / `relationship-types` 都各自实现一份「AI 生成 Dialog」
- **导入**：`surnames` / `historical-figures` 各自实现「导入 Dialog」
- **列表**：除 alias-packs/prompt-templates 双栏布局外，其他都是顶部工具栏 + Table

## 3. UI 组件复用情况

- 共用基础：`Button` `Input` `Select` `Badge` `Checkbox` `Table*` `Dialog*` `AlertDialog*` `Sheet*` `PageContainer` `PageHeader` `PageSection`
- **重复实现**（每个模块各写一遍，模式高度相似）：
  - 列表加载状态：`{loading ? <加载中...> : items.length === 0 ? <暂无数据> : <Table>}`
  - 行选择：`Set<string>` + checkbox + 全选/部分选/批量按钮
  - 搜索框 + 状态筛选 + 「刷新」按钮
  - 「批量启用 / 批量停用 / 批量删除 / 清空选择」工具条
  - 编辑对话框：`<Dialog open><DialogContent><DialogHeader>...表单字段... <DialogFooter><Button>取消</Button><Button>保存</Button></DialogFooter></DialogContent></Dialog>`
  - 删除影响预览（部分模块只有简单文字，部分有详细 ImpactDetails）
  - `useState` 散管：`dialogOpen` `editing` `saving` `selected` `error`
- 无统一的 `DataTable` / `CrudPage` / `EntityForm` 抽象组件

## 4. 共性问题清单

1. **新增/编辑路径不一致**：10 个模块用 Dialog，1 个 (`relationship-types`) 用 Sheet → 同一站点风格不统一
2. **重复样板代码**：每个 page 都写「工具栏 + 选择 + Table + Dialog + AlertDialog」，10 个模块累计约 6000+ 行可被抽象
3. **AI 生成、导入、批量操作**形态散乱：每模块各画一份对话框
4. **字段表单耦合在 page.tsx 内**：表单 state、校验、序列化逻辑全部内联，难以测试
5. **没有分页**：所有数据集都是「一次拉全」，对超过几百条记录的别名包/历史人物已存在性能风险
6. **筛选交互不统一**：有的模块走前端过滤，有的走后端 `?status=`、`?keyword=`
7. **批量操作 UI 散落**：每个模块都自己拼一条工具栏，间距/按钮层级有差异
8. **错误处理风格**：有的 `toast`，有的 `setError` 顶部红条，有的 silent
9. **手动测试工具内嵌**（name-patterns 的「规则测试器」直接嵌在主页面）— 视觉混乱
10. **复杂模块单文件超长**（alias-packs 2249 行、surnames/title-filters > 1000 行）— 可读性极差

## 5. 后端 API 概览（从 services 推断）

| 模块 | API 路径前缀 | 是否分页 | 是否批量 |
|---|---|---|---|
| book-types | `/api/admin/knowledge/book-types` | ❌ | ❌ |
| alias-packs | `/api/admin/knowledge/alias-packs` | ❌（前端取全量） | ✅（审核） |
| surnames | `/api/admin/knowledge/surnames` | ❌ | ✅ |
| title-filters | `/api/admin/knowledge/title-filters` | ❌ | ✅ |
| relationship-types | `/api/admin/knowledge/relationship-types` | ❌ | ✅ |
| prompt-templates | `/api/admin/knowledge/prompt-templates` | ❌ | ❌ |
| ner-rules | `/api/admin/knowledge/ner-rules` | ❌ | ✅ |
| prompt-extraction-rules | `/api/admin/knowledge/prompt-extraction-rules` | ❌ | ✅ |
| historical-figures | `/api/admin/knowledge/historical-figures` | ❌ | ✅（启停 + 删除） |
| name-patterns | `/api/admin/knowledge/name-patterns` | ❌ | ✅ |
| change-logs | `/api/admin/knowledge/change-logs` | ❌ | ❌ |

后端服务函数集中在 `src/lib/services/knowledge-base/*` 与 `src/server/modules/knowledge/*`。

## 6. 重构候选点

### 可抽取的统一组件

- `<CrudPage>`：页面骨架，承接 `title / description / actions / filters / table / pagination`
- `<DataTable>`：列定义 + 行选择 + 排序 + 空态/加载态 + 可选分页
- `<EntityFormDialog>`（或 `<EntityFormSheet>` 二选一统一）：标题/描述/表单字段/取消保存
- `<BatchActionBar>`：选中数 + 批量按钮 + 清空（已有 `batch-action-controls.tsx` 可复用）
- `<DeleteConfirmDialog>`：可选「删除影响预览」插槽
- `<AIGenerateDialog>`：统一「AI 生成」流程入口
- `<ImportDialog>`：统一「文本/JSON 粘贴导入」
- `<FormField>` 抽象：label + input + 校验提示

### 可统一的交互范式

- **CRUD 三件套**：列表 + 「右侧抽屉新增/编辑」 + 「AlertDialog 删除确认」
- **批量操作**：选中后顶部固定工具条出现
- **筛选搜索**：左输入框 + 右下拉，全部走后端
- **AI 生成 / 导入**：作为页面右上角次级按钮，进入二级 Dialog

### 数据层

- 引入 `useEntityList<T>` hook：封装 fetch / refresh / 选择 / 删除 / 错误态
- 表单层引入 `react-hook-form` 或自封 `useEntityForm`，把字段定义、校验、序列化集中到模块级别
