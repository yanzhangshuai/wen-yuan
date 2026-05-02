# 子任务 E：前端 Pair 抽屉与图谱单边重构

> **父任务**：[04-30-character-relation-entry-design](../04-30-character-relation-entry-design/prd.md)
> **依赖**：子任务 A（schema/类型）+ D（聚合 API）。建议 B、C 完成后联调。
> **验收点映射**：父 §7.8、§7.11

---

## 1. 目标

1. 图谱：同 Pair 多关系类型从「平行多边」改为「单边 + 数字徽章」；hover tooltip 列出全部关系类型 + 事件计数。
2. 新建 Pair 抽屉组件：从图谱边点击 / 人物详情面板 Pair 列表点击触发；展示该 Pair 全部结构关系（折叠卡片）+ 事件时间轴（按章节升序）+ attitudeTags 跨事件词云。
3. 审核台新增「关系事件」分页 tab；扩展现有 [relation-editor](../../../src/components/review/relation-editor/) 与 [relationship-edit-form.tsx](../../../src/components/review/relationship-edit-form.tsx)。
4. 新增「关系事件」录入/编辑表单组件（`relationship-event-form.tsx`），含 16 tag 快捷输入。
5. 人物详情面板（[persona-detail-panel.tsx](../../../src/components/graph/persona-detail-panel.tsx)）补 Pair 列表入口与「待补充事件」徽章。

> **不在范围**：服务端 API（→ D）、schema（→ A）。

---

## 2. 图谱单边 + 数字徽章

**文件**：[src/components/graph/force-graph.tsx](../../../src/components/graph/force-graph.tsx)。

### 2.1 数据预处理

- 上游传入的 `edges` 已是按 Pair + typeCode 拆分的多条记录；新增前端 reducer 将同 `(sourceId, targetId)`（无序对）的多条边合并为一条 visual edge：

```ts
interface VisualEdge {
  pairKey      : string;                      // = canonicalPair(sourceId, targetId)
  sourceId     : string;
  targetId     : string;
  typeCount    : number;                      // 该 Pair 下结构关系数（即 Relationship 行数）
  totalEvents  : number;                      // 该 Pair 下事件总数
  primaryLabel : string;                      // 渲染标签：当 typeCount=1 → 显示 type 名；> 1 → 显示首类型 +「等 N 类」
  underlying   : RawEdge[];                   // 透传给 hover/tooltip
}
```

`canonicalPair(a, b) = [min(a,b), max(a,b)].join("|")`。

### 2.2 渲染规则

- 单关系（`typeCount === 1`）：边粗细 = `f(totalEvents)`（线性，min 1px / max 4px）；标签直接显示关系类型名。
- 多关系（`typeCount > 1`）：单边渲染；边中点画一个数字徽章 SVG circle（直径 16px）显示 `typeCount`；标签显示 `${primaryTypeName} 等 ${typeCount} 类`。
- hover tooltip：`<ul>` 列出全部 `underlying` 边，每行 `${typeName}（${eventCount} 事件）`。

### 2.3 点击行为

- 单击边 → 触发 `onEdgeClick(pairKey, sourceId, targetId)`；上层组件打开 Pair 抽屉。
- 现有 `onEdgeHover` 不变。

### 2.4 单测

[force-graph.test.tsx](../../../src/components/graph/force-graph.test.tsx) 补：
1. 同 Pair 2 条原始边渲染为 1 条 visual edge + 数字徽章 `2`；
2. 单 Pair 单关系不显示数字徽章；
3. tooltip 列出全部底层边。

---

## 3. Pair 抽屉组件

**文件（新建）**：`src/components/relations/persona-pair-drawer.tsx`（建议放 `src/components/relations/`，与 review/graph 解耦）。

### 3.1 触发入口

- 图谱边点击（`force-graph` `onEdgeClick`）。
- 人物详情面板 Pair 列表点击（§5）。
- 审核台「关系事件」tab 行点击（§4）。

### 3.2 数据获取

```ts
const { data, isLoading } = useSWR(
  `persona-pair:${bookId}:${aId}:${bId}`,
  () => fetchPersonaPair(bookId, aId, bId)
);
```

### 3.3 布局

```
┌─ Sheet (Radix Drawer, 右侧 50% 宽) ──────────────┐
│  Header: 头像a × 头像b · 「a 与 b 的关系」        │
│  TopBar: attitudeTags 跨事件词云（聚合所有事件）  │
│  ───────────────────────────────────────────────│
│  关系卡片列表（每条结构关系一张折叠卡）           │
│    ▶ 父子（DRAFT_AI · 5 事件 · 第 3-12 回）     │
│    ▼ 同僚（MANUAL · 2 事件 · 第 7-9 回）         │
│      ├─ 第 7 回 · 「张元拜访范进」               │
│      │   tags: 资助, 提携 · evidence...           │
│      ├─ 第 9 回 · 「同朝议事」                    │
│      └─ + 录入新事件                              │
│  ───────────────────────────────────────────────│
│  Footer: + 新增结构关系（仅 admin）               │
└──────────────────────────────────────────────────┘
```

### 3.4 关键交互

- **单关系自动展开**；多关系默认全部折叠（父 §9 风险已要求）。
- attitudeTags 词云：合并全部事件 tags + 计数排序（去重 normalize：trim + 转小写比较，但展示原 tag）。
- DRAFT_AI / VERIFIED / REJECTED 用 Badge 区分颜色：DRAFT_AI=黄、AI=蓝、MANUAL=绿、REJECTED=灰。
- admin 角色：每张关系卡可编辑 `relationshipTypeCode / status / recordSource`；事件行可编辑/删除；可新增事件；可新增结构关系。
- viewer 角色：只读；隐藏所有编辑按钮。
- 卡片右上角加「**待补充事件**」徽章：当 `events.length === 0` 时显示。

### 3.5 单测

`persona-pair-drawer.test.tsx`：
1. 加载态 / 正常态 / 空关系态；
2. 单关系自动展开；
3. 多关系默认折叠；
4. attitudeTags 词云去重 + 计数；
5. viewer 隐藏编辑按钮；
6. admin 显示编辑入口；
7. 「待补充事件」徽章。

---

## 4. 审核台「关系事件」分页 tab

**文件**：[src/components/review/role-review-workbench.tsx](../../../src/components/review/role-review-workbench.tsx) + 新建 `relationship-events-tab.tsx`。

### 4.1 现有 workbench 结构

接入新 tab：`关系事件`，与现有 `角色管理 / 别名审核 / 章节事件 / 校验报告` 并列。

### 4.2 列表

- 数据源：`GET /api/admin/books/:id/relationship-events?status=PENDING&page=...`（**本任务无需新建该 list API**，可基于现有 review 列表 endpoint 扩展；如不存在，本任务范围内简化为：抽屉中按 Pair 单独录入，列表 tab 仅显示「敬请期待」占位 + 链接到「关系」tab）。
- **简化方案**（推荐）：本子任务的「关系事件」tab 内嵌入「按 Pair 检索 → 打开 Pair 抽屉」的入口（类似 ChapterEventsWorkbench 的形式），不直接做扁平事件列表，降低实现成本。

> 决策：与父任务对齐 MVP 范围，**实施简化方案**。

### 4.3 表单组件

**文件（新建）**：`src/components/review/relationship-event-form.tsx`

字段：
- `summary` *（必填，textarea）
- `evidence`（textarea）
- `paraIndex`（number 输入）
- `confidence`（slider 0-1，默认 0.8）
- `attitudeTags`（多选 chip 输入框，预置 16 个高频 tag 快捷按钮 + 自由输入兜底）
- `recordSource` / `status`（admin 可改）

**16 tag 快捷输入分组**（与父 §10.7 一致）：
```
情感：感激 怨恨 倾慕 厌恶 愧疚 惧怕
行为：资助 提携 排挤 背叛 庇护
演化：疏远 决裂 修好 公开 隐瞒 利用
```

提交按 `POST /api/relationships/:id/events` 或 `PATCH /api/relationship-events/:id`（**这两条 API 在子任务 A 范围内已实现**？— **未实现**，需在本子任务追加：见 §4.4）。

### 4.4 事件 CRUD API（追加到本子任务范围）

考虑到 D 只做读、A 做 Relationship CRUD，事件 CRUD 没人做；故本子任务**追加**：

- 新建 service：`src/server/modules/relationships/createRelationshipEvent.ts`、`updateRelationshipEvent.ts`、`deleteRelationshipEvent.ts`
- 新建路由：
  - `POST /api/relationships/[id]/events/route.ts`（admin only）
  - `PATCH /api/relationship-events/[id]/route.ts`
  - `DELETE /api/relationship-events/[id]/route.ts`（软删）
- 客户端工具：`src/lib/services/relationship-events.ts`

> **写入语义**：手动创建事件 `recordSource = MANUAL`、`status = VERIFIED`；软删时不级联（事件软删独立）；事件父关系若已软删 → 拒绝创建子事件。

### 4.5 单测

- service 三件套各 ≥ 4 用例；
- 路由 handler 鉴权 + 错误码映射；
- 表单组件交互（tag 快捷输入 / 提交参数正确）。

---

## 5. 人物详情面板补 Pair 列表

**文件**：[src/components/graph/persona-detail-panel.tsx](../../../src/components/graph/persona-detail-panel.tsx)。

新增 section「与他/她的关系」：
- 列出该 persona 在当前书籍下全部 Pair（按事件总数降序）。
- 每行：对方头像 + 名字 + `typeCount` + `totalEvents` + 「待补充事件」徽章（`totalEvents === 0` 时）。
- 点击 → 打开 Pair 抽屉（同图谱边点击）。

数据来源：复用前端已有的 `relationships` 数据 + 客户端聚合（无新 API），或新增 `GET /api/personas/:id/pairs?bookId=` —— **MVP 客户端聚合**，避免新 API。

### 5.1 单测

补 [persona-detail-panel](../../../src/components/graph/) 测试：Pair 列表正确渲染 + 点击触发打开抽屉。

---

## 6. 客户端类型与 fetch 同步

**文件**：[src/lib/services/relationships.ts](../../../src/lib/services/relationships.ts)（已在 A 同步）。本任务追加 `relationship-events.ts`、`persona-pairs.ts`（D 已建）。

---

## 7. 单元测试覆盖率

- 新组件 ≥ 90%；
- 新 service ≥ 95%；
- 路由 handler ≥ 90%。

---

## 8. 验收清单

- [ ] 图谱：同 Pair 2 条结构关系渲染为单边 + 数字徽章 `2`；hover tooltip 列出 2 条；点击打开 Pair 抽屉。
- [ ] Pair 抽屉：单关系自动展开 / 多关系全折叠 / attitudeTags 词云去重 / DRAFT_AI 与 MANUAL 颜色区分。
- [ ] 「待补充事件」徽章在 `eventCount === 0` 时显示。
- [ ] admin 可在抽屉内新增/编辑/软删事件；viewer 完全只读。
- [ ] 审核台「关系事件」tab 入口可点击；通过 Pair 检索打开抽屉。
- [ ] 人物详情面板「与他的关系」列表正确，点击进入抽屉。
- [ ] 16 tag 快捷输入按钮全部可用。
- [ ] `pnpm test` 全绿，覆盖率达标。
- [ ] `pnpm build` 无 TS 错误，bundle size 不显著回退（< +5%）。
- [ ] 父 §7.8、§7.11 人工抽样验证通过。

---

## 9. 风险与回退

- **图谱重渲染性能**：visual edge 合并放 useMemo，依赖 `edges` 引用稳定。
- **抽屉 SWR 反复拉取**：keepPreviousData，避免折叠/展开触发 re-fetch。
- **关系事件 API 未鉴权**：route handler 必须走 `requireAdmin(auth)`，单测覆盖。
- **回退**：feature flag 不引入；如发现严重 UX 问题，可隐藏图谱徽章 + 抽屉按钮，仅保留审核台 tab。
