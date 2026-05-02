# 角色关系录入设计（v3.5 · 关系+事件双层 · 终版）

> 历史版本：
> - v1（独立 RelationshipEvent + 三套词表 + 双 Prompt + 工作台 + 5 视图）已归档为 `prd.v1.md.bak`。
> - v2（按章节存 Relationship 行 + 6 枚举 evolutionEffect 状态机）已废弃。
> - v3 / v3.1 / v3.2 / v3.3 / v3.4 均在拷问中被逐代升级，本版为终稿。
> - v3.5 在 v3.4 基础上补足：attitudeTags Prompt 三分类引导 + 示例库；聚合 API MVP 不 cache；图谱单边 + 数字徽章；mergePersonas 内 SYMMETRIC re-canonicalize；re-analyze 仅清空 DRAFT。
>
> 本版（v3.5）确定的核心模型：
> - **结构关系** `Relationship`：`(bookId, sourceId, targetId, relationshipTypeCode)` 全书唯一一行，记录稳定身份关系。
> - **关系事件** `RelationshipEvent`：挂在结构关系下，按章节录入互动/态度演化。
> - 一切表现层语义（关系强弱、终结、转化）由前端从事件层推导，**不进 schema**。
>
> ⚠️ **不保留任何旧 Relationship 数据**：本任务上线前，存量 `relationships` 表清空（详见 §2.4）。

---

## 1. 目标

1. **一对人一关系类型只存一行**：`Relationship` 升级为书级唯一。
2. **事件按章节录入**：新增 `RelationshipEvent` 表。
3. **关系类型严格受控**：`relationshipTypeCode` NOT NULL，必须命中 `RelationshipTypeDefinition` 字典。
4. **`recordSource` 单调不可降级**：HUMAN > AI > DRAFT，AI 永远不能覆盖人工录入。

非目标：
- ❌ `evolutionEffect` 状态机
- ❌ `weight` 字段（已废）
- ❌ `Relationship.chapterId`（首次出现章节由前端从事件层 `MIN(events.chapterNo)` 推导）
- ❌ `Relationship.confidence`（结构关系是离散身份事实，置信度只对单条事件有意义）
- ❌ `endedAtChapterId` / `supersededByRelationshipId`（前端从事件层推导）
- ❌ `attitudeTags` 字典化（MVP 自由文本，后续按统计择优入字典）
- ❌ 双 Prompt 串行 / 5 套预置视图 / 连续录入工作台

---

## 2. 数据模型变更（Prisma）

### 2.1 `Relationship` 表（语义升级 · 书级唯一）

| 字段 | 变更 | 说明 |
| ---- | ---- | ---- |
| `bookId` | **新增** `String @db.Uuid` NOT NULL，FK → Book | 书级唯一所必需 |
| `chapterId` | **删除** | 结构关系是身份事实，不绑定章节；"首次出现章节" 由前端从 `MIN(events.chapterNo)` 推导 |
| `confidence` | **删除** | 结构关系是离散身份事实，置信度只对单条事件有意义；保留在 `RelationshipEvent.confidence` |
| `relationshipTypeCode` | 收紧为 NOT NULL，FK `onDelete: Restrict` | 必须命中字典 |
| `type` | **删除** | 不再使用，旧数据已清 |
| `weight` | **删除** | 图谱边粗细 = 该关系下事件数（前端聚合） |
| `description` / `evidence` | **删除** | 内容下沉到 `RelationshipEvent` |
| 旧唯一键 `(chapterId, sourceId, targetId, type, recordSource)` | **删除** | — |
| 新唯一键 `(bookId, sourceId, targetId, relationshipTypeCode)` | **新增** | 一对人一类型一行 |

保留字段：`recordSource` / `status` / `deletedAt` / `createdAt` / `updatedAt`。

最终 `Relationship` schema：

```prisma
model Relationship {
  id                   String @id @default(uuid()) @db.Uuid
  bookId               String @map("book_id") @db.Uuid
  sourceId             String @map("source_id") @db.Uuid
  targetId             String @map("target_id") @db.Uuid
  relationshipTypeCode String @map("relationship_type_code")

  recordSource RecordSource     @default(AI) @map("record_source")
  status       ProcessingStatus @default(DRAFT)

  deletedAt DateTime? @map("deleted_at") @db.Timestamptz(6)
  createdAt DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  book           Book                         @relation(fields: [bookId], references: [id])
  source         Persona                      @relation("RelationshipSource", fields: [sourceId], references: [id])
  target         Persona                      @relation("RelationshipTarget", fields: [targetId], references: [id])
  relationshipType RelationshipTypeDefinition @relation(fields: [relationshipTypeCode], references: [code], onDelete: Restrict)
  events         RelationshipEvent[]

  @@unique([bookId, sourceId, targetId, relationshipTypeCode], map: "relationships_pair_type_uk")
  @@map("relationships")
}
```

### 2.2 `RelationshipEvent` 表（新增）

```prisma
model RelationshipEvent {
  id             String   @id @default(uuid()) @db.Uuid
  relationshipId String   @map("relationship_id") @db.Uuid
  chapterId      String   @map("chapter_id") @db.Uuid

  description    String   @db.Text                          // 事件一句话描述（必填）
  evidenceQuote  String?  @map("evidence_quote") @db.Text   // 原文片段
  attitudeTags   String[] @default([]) @map("attitude_tags") // 自由文本，不进字典

  recordSource   RecordSource     @default(AI) @map("record_source")
  confidence     Float            @default(1.0)
  status         ProcessingStatus @default(DRAFT)

  deletedAt      DateTime? @map("deleted_at") @db.Timestamptz(6)
  createdAt      DateTime  @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt      DateTime  @updatedAt @map("updated_at") @db.Timestamptz(6)

  relationship Relationship @relation(fields: [relationshipId], references: [id], onDelete: Cascade)
  chapter      Chapter      @relation(fields: [chapterId], references: [id])

  @@index([relationshipId, chapterId], map: "rel_events_rel_chapter_idx")
  @@index([chapterId, status], map: "rel_events_chapter_status_idx")
  @@map("relationship_events")
}
```

**不设事件唯一键** —— 同一章可有多条事件，去重交给 AI/审核员。

### 2.3 `recordSource` 升级规则（结构关系层）

| 现状 → 新输入 | 行为 |
| ---- | ---- |
| 无记录 → 任意来源 | 新建 |
| `DRAFT` → `AI/HUMAN` | 升级 `recordSource` |
| `AI` → `HUMAN` | 升级 `recordSource = HUMAN` |
| `AI` → `AI` | 不动 |
| `HUMAN` → `AI` | **不覆盖**，仅触发事件层插入 |
| `HUMAN` → `HUMAN` | 不动 |

规则：`recordSource` 单调升级，序数 `DRAFT < AI < HUMAN`，永不降级。`RelationshipEvent` 不做来源升级（每条事件独立保留来源）。

### 2.4 软删除级联规则

| 操作 | 级联行为 |
| ---- | ---- |
| 软删 `Relationship`（`deletedAt = now()`） | **同事务**将该关系下所有 `RelationshipEvent.deletedAt` 一并写入 |
| 软删某条 `RelationshipEvent` | **不动** `Relationship`：结构关系是身份事实，无事件也成立 |
| 软删 `Relationship` 后再恢复（撤销软删） | 不级联恢复事件，需人工逐条恢复（避免误恢复历史脏数据） |

聚合 API 与图谱接口默认过滤 `deletedAt IS NOT NULL`。

### 2.5 迁移策略（一刀切）

由于产品仍在内测、存量 `relationships` 数据全部由 AI 抽取且未经人工核准：

1. **清空 `relationships` 表**（DELETE）。
2. 跑一次 `initializeCommonRelationshipTypes` 确保字典种子齐全。
3. 用 Prisma migration 一次性完成：
   - 删除旧字段：`chapterId` / `confidence` / `type` / `weight` / `description` / `evidence`；
   - 删除旧唯一键 `relationships_dedup_key`；
   - 新增 `bookId` NOT NULL FK + 新唯一键 `(bookId, sourceId, targetId, relationshipTypeCode)`；
   - `relationshipTypeCode` 改 NOT NULL；
   - 新建 `relationship_events` 表。
4. 用户可在管理后台对已导入书籍重新跑解析。

### 2.6 人物合并（mergePersonas）与 canonical 不变量

`mergePersonas(loserId → winnerId)` 在事务内重定向 `Relationship.sourceId/targetId` 时，必须**对 SYMMETRIC 类型重新 canonicalize**：

1. 先把 `sourceId=loserId` 与 `targetId=loserId` 全部改写为 `winnerId`；
2. 对改写后行的 `relationshipTypeCode` 查 `directionMode`：
   - `SYMMETRIC`：若 `sourceId > targetId`（UUID 字典序），事务内 swap 两列，使新行仍满足 §3 写入规则的 canonical 不变量（小 UUID 当 source）；
   - `INVERSE` / `DIRECTED`：方向保留不动。
3. 重定向后若与已有行触发 `(bookId, sourceId, targetId, relationshipTypeCode)` 唯一键冲突，按 `recordSource` 单调升级规则合并（保留高优先级一行，低优先级的事件 `relationshipId` 重定向到保留行）。

该流程保证：合并完成后，库内不存在「同 SYMMETRIC pair 用反向 source/target 双行存在」的破窗状态，聚合 API 与字典序 join 永远只看到一行。

---

## 3. AI 抽取协议

继续单 Prompt，输出协议两段：

```jsonc
{
  "relationships": [   // 结构关系（书级 upsert）
    {
      "sourcePersonaName": "胡屠户",
      "targetPersonaName": "范进",
      "relationshipTypeCode": "relationship_xxxxxx"
    }
  ],
  "relationshipEvents": [  // 章节事件
    {
      "sourcePersonaName": "胡屠户",
      "targetPersonaName": "范进",
      "relationshipTypeCode": "relationship_xxxxxx",
      "description": "范进中举后，胡屠户改口称\"贤婿老爷\"",
      "evidenceQuote": "胡屠户上前道：'我的女婿，方才不是我敢大胆……'",
      "attitudeTags": ["改口", "奉承"],
      "confidence": 0.9
    }
  ]
}
```

**写入规则**（服务端）：

1. **字典 gate**：`relationshipTypeCode` 必须命中 `RelationshipTypeDefinition` 且 `status='ACTIVE'`；否则整条丢进 DRAFT 字典审核队列，不写正式表。
2. **方向 canonicalize**（关键）：写入 `Relationship` 前查 `directionMode`：
   - `SYMMETRIC`：比较 `sourceId/targetId` UUID 字符串，**字典序小的当 `sourceId`**（保证 `(A,B)` 和 `(B,A)` 落同一行）。
   - `INVERSE` / `DIRECTED`：保留 AI 输出方向不动。
   - 同 canonicalize 规则也作用于 `RelationshipEvent` 写入前的关系查找。
3. `relationships`：canonicalize 后按 §2.3 规则 upsert。
4. `relationshipEvents`：canonicalize 后按 `(bookId, source, target, code)` 查找已有结构关系：
   - **命中** → 插入 `RelationshipEvent`。
   - **未命中** → 整条丢 DRAFT 字典审核队列，**不隐式 upsert 结构关系**（避免 AI 事件段误抽的 typeCode 静默污染 Pair；字典 gate 是唯一防线）。
5. **事件不去重、不限量**：同一章节同一关系允许多条事件，服务端不设任何上限（接受 AI 偶发重复，由审核员批量 reject；强制唯一键或截断反而会丢失同章多次互动如「同章节两次羞辱」）。
6. 行为词被 `generateRelationshipTypes` 拒绝清单拦截（已在子任务实现）。

Prompt 中嵌入字典 code 列表（仅 `status='ACTIVE'`，按 group 分组），由 `RelationshipTypeDefinition` 表生成。

**`attitudeTags` Prompt 引导规则**：

字段保持平铺 `String[]`、不入字典。Prompt 中明确要求 AI 按**三分类**输出，每事件每类 1-3 项：

1. **情绪态度**（描写 source 对 target 的情感色彩）：奉承 / 嘲讽 / 疏远 / 亲近 / 敌视 / 敬畏 / 轻蔑 / 真诚 / 虚伪 ……
2. **行为动作**（具体互动动作）：改口 / 跪拜 / 报恩 / 背叛 / 对抗 / 和解 ……
3. **评价定性**（对该次互动的总体定性）：原谅 / 决裂 / 修复 / 升级 ……

Prompt 内嵌**示例库**（约 16 个高频 tag，**优先复用**，无合适项再自创）：
`奉承 / 嘲讽 / 疏远 / 亲近 / 对抗 / 和解 / 改口 / 跪拜 / 虚伪 / 真诚 / 报恩 / 背叛 / 原谅 / 敌视 / 敬畏 / 轻蔑`。

服务端不在落库前做归并（保持自由文本灵活性），仅由前端做 lowercase + trim + 去标点的展示去重（§5.4）。

### 3.1 解析重跑（re-analyze）写入语义

触发书籍重新解析时，**同事务**先：

1. `DELETE FROM relationship_events WHERE chapter.bookId = :bookId AND status = 'DRAFT' AND record_source = 'AI'`；
2. `DELETE FROM relationships WHERE bookId = :bookId AND status = 'DRAFT' AND record_source = 'AI' AND NOT EXISTS (CONFIRMED 事件)`；
3. `recordSource = HUMAN` 或 `status = CONFIRMED` 或 `deletedAt IS NOT NULL` 的行**一律保留**；
4. 然后由本轮解析重新 upsert / 插入 DRAFT 数据。

该策略保证：重跑不会把上一轮的 AI DRAFT 与本轮 AI DRAFT 重复堆积成「追加污染」，同时人工核准成果不丢。

---

## 4. 聚合 API

```
GET /api/persona-pairs/:bookId/:personaAId/:personaBId
```

**路径参数顺序无关**：服务端按 `personaAId/personaBId` UUID 字典序内部 canonicalize（小者为 `aId`），不做 HTTP redirect。前端用返回的 `pairCanonical` 做 cache key。

返回：

```ts
{
  pairCanonical: { aId: string; bId: string },  // UUID 字典序，aId < bId
  relationships: Array<{
    id: string;
    relationshipTypeCode: string;
    relationshipTypeLabel: string;        // 字典 join
    directionMode: "SYMMETRIC" | "INVERSE" | "DIRECTED";
    sourceId: string;                     // canonicalize 后的真实存储方向
    targetId: string;
    sourceRoleLabel: string | null;
    targetRoleLabel: string | null;
    edgeLabel: string;
    firstChapterNo: number | null;        // 无事件时为 null（人工录入但未补事件）
    eventCount: number;                   // 用于图谱边粗细；不含 deletedAt 事件
    status: "DRAFT" | "CONFIRMED" | "REJECTED";
    recordSource: "AI" | "HUMAN" | "DRAFT";
    events: Array<{
      id: string;
      chapterNo: number;
      chapterTitle: string;
      description: string;
      evidenceQuote: string | null;
      attitudeTags: string[];
      status: "DRAFT" | "CONFIRMED" | "REJECTED";
      recordSource: "AI" | "HUMAN" | "DRAFT";
      confidence: number;
    }>;  // 按 chapterNo 升序
  }>
}
```

**结构关系排序**（服务端定，前端直接渲染）：
1. `firstChapterNo ASC`（`null` 排最后）
2. `eventCount DESC`
3. `relationshipTypeCode ASC`（稳定 tie-breaker）

实现：两次 query + dictionary join，无状态机、无 weight。

**性能策略：MVP 不做服务端 cache**，直接两次 query + 内存 join，预期 p95 < 50ms（全书 Pair 单次拉取，事件量级有限）。上线后接入 APM 监控；若 p95 突破阈值，再迭代加 ETag / Redis cache，**当前不投入**。

---

## 5. 前端

### 5.1 双人 Pair 抽屉

入口：图谱点边、人物详情页"关系"区点条目。

布局：
- 顶部：Pair 头像 + "他们之间的关系"
- 列出该 Pair 全部结构关系（每条一个折叠卡片，排序由聚合 API 决定）：
  - 关系标签（`edgeLabel` + 双侧称谓）
  - 元信息（首次章节 / 「尚无互动」、来源、事件数、`status` 徽章）
  - **跨事件 `attitudeTags` 词云**：卡片头部展示全部事件去重后的 `attitudeTags`，按**出现频次 DESC** 排序，并列时按首次出现章节升序（前端纯计算，零后端成本）。
  - 折叠展开 → 章节事件时间线（每条：章节号 + 描述 + 证据 + `attitudeTags` 徽章 + 事件 `status` 徽章）
  - 管理员可在此就地"新增事件"/"编辑事件"

**默认折叠策略**：
- 抽屉打开时**默认全部折叠**；
- 若该 Pair 仅一条结构关系 → 自动展开（节省一次点击）。

不再做 Tab、不再有总览图表。

### 5.2 人物详情页

四区：
1. 基础资料
2. 章节事迹（沿用 biography 模块）
3. **关系（按 Pair 列表）**：每个 Pair 一行，显示该 Pair 全部 `edgeLabel` 标签 + 总事件数；点开 5.1 抽屉。Pair 排序按 "事件总数 DESC"，便于发现核心关系人。对 `eventCount=0` 的 Pair（人工录入但未补事件）加"待补充事件"徽章以免被埋没，但**排序仍由 eventCount 决定**（事件密度即关系强度，不为手工录入破例）。
4. 证据与审核

### 5.3 图谱

同一 Pair **永远只画一条边**（不画平行边，避免视觉混乱）：

- **边色** = 该 Pair 中 `eventCount` 最大的那条 `Relationship` 所属 `relationshipType.group`（家族 / 师友 / 敌对 ……）。
- **边粗细** = 该 Pair 全部结构关系的 `eventCount` 之和（事件密度）。
- **数字徽章**：当该 Pair 的结构关系总数 `N > 1` 时，在边的右上角渲染小徽章显示 `N`，提示「这两人之间有多种身份关系」。
- **hover tooltip**：列出该 Pair 全部 `edgeLabel`（按聚合 API 排序），让用户一眼看到所有关系类型。
- **点边** → 5.1 Pair 抽屉，抽屉内逐条卡片展开。

### 5.4 `attitudeTags` 展示规则

- 前端做 lowercase + trim + 去标点的"展示去重"（同一卡片内 `"改口"` 和 `"改口 "` 合并）。
- 跨事件词云：同一结构关系下全部事件的 `attitudeTags`使用同一 normalize 函数后去重汇总（实现在抽屉卡片组件内，纡 useMemo）。
- 不做服务端归并。

---

## 6. AI 写入与审核

### 6.1 写入路径

| 路径 | 行为 |
| ---- | ---- |
| AI 输出 `relationships` 命中字典 | 按 §2.3 规则 upsert，`status=DRAFT`、`recordSource=AI`（首建时） |
| AI 输出 `relationships` 不命中字典 | 整条丢字典审核队列 |
| AI 输出 `relationshipEvents` 命中关系 | 插入 `RelationshipEvent`，`status=DRAFT` |
| AI 输出 `relationshipEvents` 找不到关系 | 整条丢 DRAFT 字典审核队列，**不隐式创建结构关系**（字典 gate 是唯一防线） |
| 人工录入结构关系 | `recordSource=HUMAN`，`status=CONFIRMED` |
| 人工录入事件 | `recordSource=HUMAN`，`status=CONFIRMED` |

### 6.2 双层 `status` 独立性

`Relationship.status` 与 `RelationshipEvent.status` 完全独立，互不联动：

- 关系层 `status` 表达 "这两人是否真存在该类型关系"（结构事实是否被采信）；
- 事件层 `status` 表达 "这条章节互动是否被采信"。
- AI 升级关系结构（DRAFT→CONFIRMED）不会自动确认其下任何事件；反之亦然。
- 审核台 "关系" 分页与 "关系事件" 分页相互独立工作。

### 6.3 展示过滤规则

| 场景 | 过滤条件 |
| ---- | ---- |
| 图谱默认视图 | 仅展示 `Relationship.status = CONFIRMED` 且 `deletedAt IS NULL` 的边；事件计数仅计 `RelationshipEvent.status = CONFIRMED` 的事件 |
| Pair 抽屉 | 列出 Pair 全部 `Relationship.status ∈ {CONFIRMED, DRAFT}`；事件按各自 `status` 显示徽章（DRAFT/CONFIRMED/REJECTED 视觉区分），管理员可全量查看 |
| 审核台 | 按 `status=DRAFT` 单独筛选关系层或事件层 |

审核台：现有 `/admin/review` 增加"关系事件"分页（结构与"关系"分页一致）。

### 6.4 批量操作责任边界

| 操作 | 允许与安全措施 |
| ---- | ---- |
| 批量 confirm 关系层 / 事件层 | 允许，无需额外确认 |
| 批量 reject 关系层 | 允许；**不级联 reject 事件**（双层 status 独立是本设计核心扯，参 §6.2）；如需同时 reject 事件请在事件分页独立操作 |
| 批量 reject 事件层 | 允许，无需额外确认 |
| 批量软删 `Relationship` | 允许；必须弹窗二次确认 + 勾选 `我知道将级联软删 N 条事件` checkbox（遵守 §2.4 级联规则） |
| 批量软删 `RelationshipEvent` | 允许，无需额外确认（不动 Relationship） |

不引入 "软删 30 天后 auto-purge" 机制（MVP 结构不必要）。

---

## 7. 验收标准（父任务）

1. **Schema 迁移**：migration 在测试库一次跑通，`relationships` 表新结构正确，`relationship_events` 表创建成功，存量数据已清空。
2. **`recordSource` 单调升级**：单测覆盖 §2.3 全部 6 条规则。
3. **SYMMETRIC canonicalize**：单测覆盖：同一对人 `(A,B)` 与 `(B,A)` 在 SYMMETRIC 类型下落同一行；INVERSE/DIRECTED 不被 canonicalize。
4. **字典 status gate**：`status≠'ACTIVE'` 的 code 被 AI 输出中命中时进 DRAFT 字典审核队列；已存在 Relationship 不受影响。
5. **AI 写入路径**：单测覆盖 4 条路径（命中/不命中 × 关系/事件）。
6. **软删除级联**：单测覆盖 §2.4 三条规则。
7. **聚合 API** `GET /api/persona-pairs/...` 单测覆盖率 ≥ 90%，覆盖 5 case：
   - 路径参数顺序互换后 `pairCanonical` 一致
   - 无结构关系
   - 单结构关系无事件（`firstChapterNo=null` 排最后）
   - 单结构关系多事件
   - 多结构关系多事件（验证三级排序 firstChapterNo / eventCount / typeCode）
8. **肉眼校验**：在儒林外史样书上重跑解析，王冕↔母亲、范进↔胡屠户、严监生↔王氏 三对 Pair 显示正确（结构关系类型 + 事件按章节排序）。
9. **子任务 `04-30-relationship-type-knowledge-base`** 已交付。
10. **`attitudeTags` Prompt 三分类 + 示例库**：单测/对话回放验证 Prompt 中明确出现三分类引导与 16 个示例 tag；金标小样本回归验证 AI 输出对示例库的复用率 ≥ 70%。
11. **图谱单边 + 数字徽章渲染**：组件测覆盖 N=1（无徽章）、N=2 / N=3（显示徽章），边色取 `eventCount` 最大关系的 group，hover tooltip 列出全部 `edgeLabel`。
12. **`mergePersonas` SYMMETRIC re-canonicalize**：单测覆盖（a）合并后产生 `source>target` 行被 swap；（b）唯一键冲突时按 `recordSource` 单调升级规则合并；（c）INVERSE / DIRECTED 类型方向保留不动。
13. **re-analyze DRAFT 清空 + HUMAN/CONFIRMED 保留**：单测覆盖重跑前同事务删除 DRAFT-AI 行，保留 HUMAN / CONFIRMED / `deletedAt IS NOT NULL` 数据；重跑后无重复堆积。

> **召回率指标**（如"`relationshipTypeCode` 不命中字典率 ≤ 5%"）依赖金标 v2 升级，已挪到子任务/后续专项验收，不在父任务范围。

---

## 8. 拆分

- **本父任务**：`Relationship` 重构 + `RelationshipEvent` 新表 + 一刀切迁移 + AI 双段输出协议 + `recordSource` 升级规则 + 聚合 API + Pair 抽屉。
- **子任务 `04-30-relationship-type-knowledge-base`**（保持原 PRD 不变）：字典 CRUD、aliases、AI 写入校验、反向预览。

---

## 9. 风险

| 风险 | 缓解 |
| ---- | ---- |
| 清空 `relationships` 后用户需重跑解析 | 内测期可接受；管理后台已支持一键重跑 |
| 同 Pair 同章节多事件无去重 | 接受重复，由审核合并；强制唯一键反而会丢真实多事件 |
| AI 把事件误抽为结构关系 | 字典强约束 + 行为词拒绝清单（子任务已实现） |
| `attitudeTags` 自由文本维度发散、近义词泛滥 | Prompt 三分类引导 + 16 个高频 tag 示例库强制优先复用；前端 normalize 去重；后续按统计择优入字典 |
| 聚合 API p95 飙升 | MVP 不投入 cache 复杂度，依赖 APM 监控 p95；超阈值再迭代加 ETag / Redis |
| 同 Pair 多关系类型在图谱呈现混乱 | 单边 + 数字徽章 + hover tooltip 列全部 `edgeLabel`，避免平行边视觉噪音 |
| `mergePersonas` 后 canonical 不变量被破坏（SYMMETRIC 反向双行） | 合并事务内对 SYMMETRIC 类型 re-canonicalize（swap source/target），唯一键冲突按 `recordSource` 单调升级合并 |
| re-analyze 追加污染（旧 DRAFT 与新 DRAFT 堆积） | 同事务先 DELETE 该书 DRAFT-AI 行，HUMAN / CONFIRMED / 已软删数据保留；本轮 AI 重新填充 |
| **SYMMETRIC 类型方向双行**（AI 分别产出 A→B 和 B→A） | 服务端写入前按 UUID 字典序 canonicalize（小者当 source），保证唯一键自然去重 |
| **字典 code 停用/合并**（`status≠'ACTIVE'` 或需迁移） | AI 写入仅接受 ACTIVE；已存 Relationship 不受影响；code 合并/删除工具在子任务实现，父任务依赖 `onDelete:Restrict` 兌底 |
| Pair 抽屉多关系交互冷却（全折叠） | 单关系自动展开，多关系默认全折叠，由使用者点击选择关注点 |
| **AI 事件段 typeCode 误抽静默创建结构关系** | 事件找不到关系不隐式 upsert，统一进 DRAFT 字典审核队列 |
| **人工录入无事件关系被埋没** | 人物详情页 Pair 列表加 「待补充事件」 徽章，避免肉眼遗漏 |
| **批量软删关系误点击丢全部事件** | 强制弹窗 + checkbox，展示将级联软删 N 条事件计数 |

---

## 10. 实施计划与文件清单（执行准绳）

> 本节是父任务的"指挥地图"：每个子任务必须严格按照 §10.1–§10.8 落地，子任务 PRD 不得绕过这些约束。

### 10.1 枚举与命名最终方案（**所有子任务统一遵守**）

为避免大规模破坏性重命名，**保留代码中现存命名**，PRD §1–§9 文本中的别名按下表读取：

| PRD 文本 | 代码实际值（来源：`@/generated/prisma/enums`） | 说明 |
| ---- | ---- | ---- |
| `recordSource = HUMAN` | `RecordSource.MANUAL` | 人工录入 |
| `recordSource = AI` | `RecordSource.AI` | AI 抽取 |
| `recordSource = DRAFT` | **新增枚举值** `RecordSource.DRAFT_AI` | AI 待审；子任务 A 在 Prisma schema 中扩展枚举 |
| `status = CONFIRMED` | `ProcessingStatus.VERIFIED` | 已审核确认 |
| `status = DRAFT` | `ProcessingStatus.PENDING` | 草稿待审 |
| `status = REJECTED` | `ProcessingStatus.REJECTED` | 已拒绝 |
| Persona 关系 alias `RelationshipSource` / `RelationshipTarget` | 保留现有 `SourcePersona` / `TargetPersona` | Prisma 关系名不改 |

**recordSource 单调升级链**（最终落地）：`DRAFT_AI` < `AI` < `MANUAL`。
**status 双层独立性**：`Relationship.status` 与 `RelationshipEvent.status` 独立流转；只要任一层 `recordSource=MANUAL` 即视为人工锁定。

### 10.2 现有代码触点（必须修改 / 联动验证）

| 文件 / 路径 | 关联子任务 | 触点说明 |
| ---- | ---- | ---- |
| [prisma/schema.prisma](prisma/schema.prisma) 行 372-410 | A | `Relationship` 改造、新增 `RelationshipEvent`、`RecordSource` 枚举扩展 |
| `prisma/migrations/2026XXXXXXXXXX_relationship_event_split/` | A | 新建迁移：DROP 旧唯一键 / 旧字段 → ALTER + ADD → CREATE 新表 → 清空旧数据 |
| [prisma/seed.ts](prisma/seed.ts) | A | 调用 `initializeCommonRelationshipTypes`（已交付） |
| [src/server/modules/relationships/createBookRelationship.ts](src/server/modules/relationships/createBookRelationship.ts) 行 130-200 | A | 改用 `(bookId,sourceId,targetId,relationshipTypeCode)` 唯一键；删除 `chapterId/type/weight/description/evidence/confidence` 写入；改为 upsert + canonicalize |
| [src/server/modules/relationships/listBookRelationships.ts](src/server/modules/relationships/listBookRelationships.ts) | A | 输出形态调整为新 schema |
| [src/server/modules/relationships/updateRelationship.ts](src/server/modules/relationships/updateRelationship.ts) | A | 仅允许改 `relationshipTypeCode / status / recordSource`；移除 `type/weight/...` |
| [src/server/modules/relationships/deleteRelationship.ts](src/server/modules/relationships/deleteRelationship.ts) | A | 软删时同事务级联软删该关系下全部 `RelationshipEvent` |
| [src/app/api/books/[id]/relationships/route.ts](src/app/api/books/[id]/relationships/route.ts) | A | Zod schema 同步 |
| [src/app/api/relationships/[id]/route.ts](src/app/api/relationships/[id]/route.ts) | A | PATCH/DELETE body 同步 |
| [src/lib/services/relationships.ts](src/lib/services/relationships.ts) | A、E | `PatchRelationshipBody` / `CreateRelationshipBody` 客户端类型同步 |
| [src/server/modules/analysis/services/ChapterAnalysisService.ts](src/server/modules/analysis/services/ChapterAnalysisService.ts) 行 ~559 | B | `tx.relationship.createMany` 唯一写入站点重构：解析 LLM 双段输出 → canonicalize → 字典 gate → upsert Relationship + createMany RelationshipEvent；`recordSource` 默认 `DRAFT_AI` |
| [src/server/modules/knowledge/prompt-template-baselines.ts](src/server/modules/knowledge/prompt-template-baselines.ts) 行 130-156 case `CHAPTER_ANALYSIS` | B | JSON 协议 `relationships` 段改为新格式 + 新增 `relationshipEvents` 段 + `attitudeTags` 三分类引导 + 16 tag 示例库 |
| [src/server/modules/knowledge/prompt-templates.ts](src/server/modules/knowledge/prompt-templates.ts) | B | `resolvePromptTemplate({slug:"CHAPTER_ANALYSIS"})` 不需要改；通过新建版本激活新 baseline |
| [src/server/modules/analysis/pipelines/sequential/SequentialPipeline.ts](src/server/modules/analysis/pipelines/sequential/SequentialPipeline.ts) | B | 仅做兼容性回归测试，无需改动 |
| [src/server/modules/analysis/pipelines/twopass/TwoPassPipeline.ts](src/server/modules/analysis/pipelines/twopass/TwoPassPipeline.ts) | B | 同上 |
| [src/server/modules/personas/mergePersonas.ts](src/server/modules/personas/mergePersonas.ts) 行 100-200 | C | 改造：(1) 关系迁移 `(sourceId|targetId)=loserId → winnerId`；(2) SYMMETRIC 类型 swap 保 canonical；(3) 唯一键冲突按 `recordSource` 单调升级合并；(4) 同事务迁移 `RelationshipEvent.relationshipId` |
| [src/server/modules/books/startBookAnalysis.ts](src/server/modules/books/startBookAnalysis.ts) | C | 同事务前置：`DELETE Relationship WHERE bookId=? AND recordSource='DRAFT_AI'` 与 `DELETE RelationshipEvent ...`；HUMAN/AI/已软删保留 |
| `src/server/modules/relationships/getPersonaPair.ts` (**新建**) | D | `(bookId, aId, bId)` Pair 聚合 service |
| `src/app/api/persona-pairs/[bookId]/[aId]/[bId]/route.ts` (**新建**) | D | GET 路由（admin + viewer 都可访问；MVP 不 cache） |
| `src/lib/services/persona-pairs.ts` (**新建**) | D、E | 客户端 fetch 工具 |
| [src/components/graph/force-graph.tsx](src/components/graph/force-graph.tsx) | E | 同 Pair 多关系合并为单边 + 数字徽章 + hover tooltip 列全部 `edgeLabel` |
| [src/components/review/relation-editor/](src/components/review/relation-editor/) | E | 关系编辑器扩展为 Pair 抽屉容器，分「结构关系」「关系事件」两 tab |
| [src/components/review/relationship-edit-form.tsx](src/components/review/relationship-edit-form.tsx) | E | 字段改造（去掉 `type/weight/description/evidence/confidence`，加 `relationshipTypeCode` 选择器） |
| `src/components/review/relationship-event-form.tsx` (**新建**) | E | 关系事件录入/编辑表单（含 `attitudeTags` 输入 + 16 tag 快捷输入） |
| [src/components/review/role-review-workbench.tsx](src/components/review/role-review-workbench.tsx) | E | 「关系事件」分页 tab 接入 |
| [src/app/admin/role-workbench/[bookId]/page.tsx](src/app/admin/role-workbench/[bookId]/page.tsx) | E | 集成 Pair 抽屉触发点 |

> 说明：文中"人物详情页"在当前代码中实际由 [src/components/graph/persona-detail-panel.tsx](src/components/graph/persona-detail-panel.tsx) 承载（图谱右侧抽屉）；子任务 E 在该面板加 Pair 列表入口，**不新建 `personas/[id]` 路由**。

### 10.3 子任务依赖关系（执行顺序）

```
A (schema + 服务层 CRUD 改造)
  ├─ 阻塞 B、C、D、E
B (AI 写入协议 + Prompt 升级)
  ├─ 依赖 A
  └─ 与 C 可并行
C (mergePersonas + re-analyze 清场)
  ├─ 依赖 A
  └─ 与 B 可并行
D (Pair 聚合 API)
  ├─ 依赖 A
  └─ 与 B、C 可并行
E (前端：图谱单边/Pair 抽屉/审核台事件分页)
  └─ 依赖 A、D（必需）；建议 B、C 完成后再联调
```

**串行执行建议**：A → (B ∥ C ∥ D) → E；其中 D 在 A 完成后即可起步，不必等 B/C。

### 10.4 迁移文件命名约定

参考 [prisma/migrations/20260415114937_kb_refactor](prisma/migrations/20260415114937_kb_refactor/)。子任务 A 新建：
- 目录：`prisma/migrations/2026XXXXXXXXXX_relationship_event_split/`（`X` 为执行时戳，由 `prisma migrate dev --name relationship_event_split` 自动生成）。
- 内容：
  1. `DROP INDEX relationships_dedup_key;`
  2. `ALTER TABLE relationships DROP COLUMN chapter_id, DROP COLUMN type, DROP COLUMN weight, DROP COLUMN description, DROP COLUMN evidence, DROP COLUMN confidence;`
  3. `ALTER TABLE relationships ADD COLUMN book_id UUID NOT NULL REFERENCES books(id);`
  4. `ALTER TABLE relationships ALTER COLUMN relationship_type_code SET NOT NULL;`
  5. `ALTER TYPE "RecordSource" ADD VALUE 'DRAFT_AI';`
  6. `CREATE UNIQUE INDEX relationships_book_pair_type_key ON relationships (book_id, source_id, target_id, relationship_type_code) WHERE deleted_at IS NULL;`
  7. `CREATE TABLE relationship_events (...)` 含 FK `relationship_id → relationships(id) ON DELETE RESTRICT`、`chapter_id → chapters(id)`、`source_id` / `target_id` 冗余便于查询；索引 `(relationship_id, chapter_no)`、`(book_id, chapter_id)`、`(deleted_at) WHERE deleted_at IS NULL`。
  8. `DELETE FROM relationships;`（一刀切，**v3.5 §2.5**）

### 10.5 单元测试目标

| 子任务 | 单测文件 | 必须覆盖的验收点 |
| ---- | ---- | ---- |
| A | `createBookRelationship.test.ts`、`updateRelationship.test.ts`、`deleteRelationship.test.ts`、`listBookRelationships.test.ts` 全部按新 schema 重写 | §7.1、§7.6 |
| B | `ChapterAnalysisService.test.ts`（新增针对关系/事件双段写入路径的用例） | §7.2、§7.3、§7.4、§7.5、§7.10 |
| C | `mergePersonas.test.ts`（补 SYMMETRIC re-canonicalize、唯一键冲突合并、级联事件迁移）、`startBookAnalysis.test.ts`（补 DRAFT_AI 清场） | §7.12、§7.13 |
| D | `getPersonaPair.test.ts`（新建）、route handler 集成测 | §7.7 |
| E | `force-graph.test.tsx`（补单边+数字徽章）、`relationship-event-form.test.tsx`（新建）、`role-review-workbench.test.tsx`（补关系事件分页） | §7.8、§7.11 |

行覆盖率门槛 ≥ 90%（与项目全局一致）；新增 service 文件本身覆盖率应 ≥ 95%。

### 10.6 Prompt 版本管理

- slug：`CHAPTER_ANALYSIS`（不新增 slug，避免与现有 pipeline stage 解耦）。
- 实施方式：子任务 B 在 [prompt-template-baselines.ts](src/server/modules/knowledge/prompt-template-baselines.ts) 修改 `case "CHAPTER_ANALYSIS"`；运行 `pnpm db:seed` 生成新 `PromptTemplateVersion`，同时通过 `isActive: true` 自动激活新版本。
- 旧版本通过 `prompt_template_versions` 历史记录回溯，无需手动归档。

### 10.7 attitudeTags 三分类引导（Prompt 内嵌·权威定义）

```
关系事件提取 attitudeTags 时，每个标签必须从下列三大维度中选取，并优先复用示例库（共 16 个高频值），不要发明同义词：

【情感态度】感激 / 怨恨 / 倾慕 / 厌恶 / 愧疚 / 惧怕
【行为倾向】资助 / 提携 / 排挤 / 背叛 / 庇护
【关系演化】疏远 / 决裂 / 修好 / 公开 / 隐瞒 / 利用

输出形如 ["感激","资助"]，最多 3 个；若文本无明确态度信号，输出空数组。
```

### 10.8 回滚与失败处理

- **本任务为内测期·破坏性升级**：不需要历史数据兼容。
- 单元测试任意失败 → 阻塞该子任务进入 check 阶段。
- 集成测试中如发现 prompt 召回率显著下降（>10pp）：先回滚 prompt baseline 版本（`isActive=false`），不回滚 schema。
- DB 出现意外脏数据：执行 `pnpm prisma:migrate reset` + `pnpm db:seed` + 在管理台一键重跑书籍解析；schema 与种子始终是单一事实源。

### 10.9 子任务清单与目录

| 子任务 slug | 一句话职责 | 验收点映射 |
| ---- | ---- | ---- |
| `05-01-relation-schema-migration`        | Prisma schema 改造 + 迁移 + relationships 服务层 CRUD 同步 | §7.1, §7.6 |
| `05-01-relation-ai-write-protocol`       | `ChapterAnalysisService` 写入路径重构 + `CHAPTER_ANALYSIS` baseline 升级 + 双 pipeline 兼容回归 | §7.2, §7.3, §7.4, §7.5, §7.10 |
| `05-01-relation-merge-and-reanalyze`     | `mergePersonas` SYMMETRIC re-canonicalize + 关系/事件迁移；`startBookAnalysis` 前置 DRAFT_AI 清场 | §7.12, §7.13 |
| `05-01-persona-pair-aggregation-api`     | `GET /api/persona-pairs/:bookId/:aId/:bId` 路由 + service + 客户端 fetch 工具 | §7.7 |
| `05-01-relation-frontend-pair-drawer`    | Pair 抽屉组件 + 关系事件表单 + 图谱单边+数字徽章 + 审核台关系事件分页 + attitudeTags 词云 | §7.8, §7.11 |

> 已交付子任务 `04-30-relationship-type-knowledge-base`（关系类型字典 CRUD + AI 写入校验）保持原样，不在本次新拆任务范围内。
