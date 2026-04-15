# 知识库架构重构 — scope 语义修正与 UI 完善

## Goal

修正"人物别名知识包"的架构语义，落实三条核心原则：
1. **知识包是独立实体**，书籍依赖知识包，而非知识包属于书籍
2. **知识包可同时关联题材（bookTypeId）和具体书籍（BookKnowledgePack）**，两者不互斥
3. 导入条目时展示格式提示词，辅助用户填写

当前状态：后端数据模型已正确（`BookKnowledgePack` 多对多 + `bookTypeId` 可选 FK），问题只在于前端将 `scope` 作为强制分流条件。

---

## 已完成工作（本轮已执行，勿重复）

- [x] 后端 `listKnowledgePacks` 增加 `bookId` 过滤参数（`knowledge-packs.ts`）
- [x] API route `GET /api/admin/knowledge/alias-packs` 透传 `bookId`
- [x] 前端 `fetchKnowledgePacks` 增加 `bookId` 参数
- [x] 前端 service 新增 `mountPackToBook(bookId, packId)` 函数
- [x] 左栏过滤器改为题材 + 书籍两个独立选择器（移除 scope tab 切换）
- [x] `CreatePackDialog` 改为题材/书籍同时可选、不互斥；scope 由系统自动决定
- [x] 包列表信息展示同时显示题材和书籍挂载数

---

## 待实现需求

### R1：后端支持知识包同时关联题材+书籍（scope 语义修正）

**当前问题**：`KnowledgePack.scope` 字段约束为 `GENRE` xor `BOOK`，当有书籍绑定时强制设为 `BOOK`，导致 `bookTypeId` = null，丢失题材关联。

**期望**：
- 废除 `scope` 作为互斥约束，改为派生描述字段（或直接废弃）
- 创建/更新知识包时，允许 `bookTypeId` 和 `BookKnowledgePack` 同时存在
- `scope` 字段语义调整：
  - 有 bookTypeId 无书籍挂载 → `GENRE`
  - 有书籍挂载无 bookTypeId → `BOOK`  
  - 两者都有 → `BOTH`（新增枚举值，或废弃此字段）
  - 都没有 → `GLOBAL`

**文件影响**：
- `src/server/modules/knowledge/knowledge-packs.ts` → `createKnowledgePack` 不再限制两者互斥
- `src/app/api/admin/knowledge/_shared.ts` → `createPackSchema` 移除 `scope` 必填，改为可选或废弃
- `prisma/schema.prisma` → 可选：将 `scope` 改为枚举 `GLOBAL | GENRE | BOOK | BOTH`，或保留 string

### R2：导入对话框显示格式提示词

**需求**：`ImportEntriesDialog` 在内容区上方展示一个可折叠的"格式说明"区域，包含：
- JSON 格式模板（带注释）
- CSV 格式模板（带表头说明）

**实现位置**：`src/app/admin/knowledge-base/alias-packs/page.tsx` → `ImportEntriesDialog` 组件

**参考样式**：参考 `GenerateEntriesDialog` 中"提示词预览"区块的 `<pre>` 展示方式

**展示内容示例**：
```
JSON 格式：
[
  {
    "canonicalName": "关羽",       // 标准名（必填）
    "aliases": ["关云长", "云长"], // 别名列表（必填）
    "entryType": "CHARACTER",      // CHARACTER | LOCATION | ORGANIZATION
    "notes": "蜀汉五虎将首位"      // 备注（可选）
  }
]

CSV 格式（逗号分隔，别名用 | 分隔）：
canonicalName,aliases,entryType,notes
关羽,"关云长|云长",CHARACTER,蜀汉五虎将首位
```

### R3：编辑知识包支持修改题材/书籍关联

**当前 `EditPackDialog` 只能修改 name/description/isActive**，需增加：
- 题材选择器（修改 `bookTypeId`）
- 已挂载书籍列表（带解挂操作）+ 添加新书籍按钮

**API 支持**：
- `PATCH /api/admin/knowledge/alias-packs/:id` 增加 `bookTypeId` 字段支持
- `POST /DELETE /api/admin/knowledge/books/:bookId/knowledge-packs` 已存在，直接复用

### R4：知识包详情区展示关联信息

右栏 `EntryList` 头部展示当前知识包的关联关系：
- 关联题材 badge
- 关联书籍 badge 列表（可点击跳转书籍详情）

---

## Acceptance Criteria

- [ ] 创建知识包时，同时填写题材和书籍，两者均保存成功
- [ ] 同时填写题材+书籍的知识包，在题材过滤和书籍过滤两个维度均可被检索到
- [ ] `ImportEntriesDialog` 展示 JSON/CSV 格式说明，内容折叠展开正常
- [ ] `EditPackDialog` 可修改题材关联和书籍挂载
- [ ] `scope` 字段值与实际关联关系保持一致（无矛盾）
- [ ] TypeScript 编译无新增错误

---

## Definition of Done

- Tests added/updated（如有涉及 `knowledge-packs.ts` 的测试）
- Lint / typecheck 通过
- 原有知识包功能（生成、导入、导出、审核）不受影响

---

## Out of Scope

- 批量迁移已有 GENRE 包到书籍关联（数据迁移单独任务）
- 知识包与书籍的多对多解挂 UI（本次只做新增挂载）
- 多书籍同时挂载（本次只支持创建时挂载一本，后续在编辑面板追加）

---

## Technical Approach

### 架构原则（不变）
```
Book → [BookKnowledgePack] → KnowledgePack (独立实体)
                                  ↑
                              bookTypeId (可选，指向 BookType)
```

书籍与知识包是 **使用关系**（书籍使用知识包），不是所属关系。

### scope 字段处理策略

**推荐方案**：scope 改为派生计算字段（前端展示用），后端创建时根据 bookTypeId 和 bookId 自动决定：
```ts
function deriveScope(bookTypeId?: string, hasBookBinding?: boolean): string {
  if (bookTypeId && hasBookBinding) return "BOTH";
  if (bookTypeId) return "GENRE";
  if (hasBookBinding) return "BOOK";
  return "GLOBAL";
}
```

### 关键文件清单

| 文件 | 操作 |
|---|---|
| `src/server/modules/knowledge/knowledge-packs.ts` | `createKnowledgePack` 取消 scope 互斥限制 |
| `src/app/api/admin/knowledge/_shared.ts` | `createPackSchema` 修改：scope 可选/废弃 |
| `src/app/api/admin/knowledge/alias-packs/[id]/route.ts` | PATCH 增加 bookTypeId 支持 |
| `src/app/admin/knowledge-base/alias-packs/page.tsx` | `ImportEntriesDialog` 增加格式说明区；`EditPackDialog` 增加关联编辑 |

---

## Technical Notes

- `BookKnowledgePack` 表已存在，多对多关系已就绪，只需前端 UI 补充
- 上一轮已完成后端过滤、前端 filters 和 CreatePackDialog 改造
- 参考已有实现：`GET /api/admin/knowledge/books/:bookId/knowledge-packs` 已有完整书籍↔知识包操作 API
- `previewGenerateEntriesPrompt` 返回 `systemPrompt + userPrompt`，已有展示样式可复用给导入格式说明
