# data-model 技术设计：schema 最小调整

> 基于现有 28 表 schema（已 v3 迁移），按 v5.1 只做最小调整。权威链 `facts→relationships→Neo4j` 不动。

## 1. 变更清单

| 变更 | 涉及 | 理由 |
|---|---|---|
| 新增 `relationship_types` 表 | 关系域 | 关系码唯一权威（DB 表驱动 + 书型作用域） |
| `analysis_jobs.relationshipTypesSnapshot` | 运行域 | 任务级快照，防跑批中途改表片间 schema 漂移 |
| `agent_runs.runType` 枚举调整 | 运行域 | 适配 v5 管线（无工具循环） |
| 删除 `agent_steps` 表 + `AgentStepKind` 枚举 | 运行域 | 无工具调用，逐步留痕无意义 |
| `RecordSource` 加 `AUTO_VERIFIED` | 实体/事实域 | 区分机器自动接受 vs 人工确认 |

## 2. relationship_types 表设计

```prisma
enum RelationDirection {
  INVERSE   // A→B 有向
  SYMMETRIC // 双向对称
}

model RelationshipType {
  id         String            @id @default(uuid()) @db.Uuid
  code       String            @map("code") @db.VarChar(60)   // 规范码：父子/师生/同年...
  name       String            @map("name") @db.VarChar(60)   // 展示名
  direction  RelationDirection @map("direction")
  category   String            @map("category") @db.VarChar(30) // 六大分类（家庭/亲密/等级/社交/敌对/其他）
  aliases    String[]          @map("aliases") @db.Text[]     // 口语叫法（父与子/父子关系...）
  bookTypeId String?           @map("book_type_id") @db.Uuid  // null=全局；非空=书型专属
  bookType   BookType?         @relation(fields: [bookTypeId], references: [id], onDelete: Cascade)
  sortOrder  Int               @default(0) @map("sort_order")
  isActive   Boolean           @default(true) @map("is_active")
  createdAt  DateTime          @default(now()) @map("created_at")
  updatedAt  DateTime          @updatedAt @map("updated_at")

  @@unique([code, bookTypeId], map: "relationship_types_code_booktype_key")
  @@map("relationship_types")
}
```

**关键语义**：
- `bookTypeId = null` → 全局行；非空 → 书型专属行（科举：座师/门生/同年 挂 keju-novel）。
- 查询/生成 schema：`WHERE isActive AND (bookTypeId IS NULL OR bookTypeId = :current)`——书型专属码**不污染**其他书型。
- 新增码 = 插行，无代码改动（D13 承诺）。
- `aliases` 用于 schema 生成时的**教学参考**（skill 侧），不做运行时权威。

## 3. 任务级快照

- `analysis_jobs.relationshipTypesSnapshot Json? @map("relationship_types_snapshot")`（同 skillsSnapshot 模式）。
- 快照内容：任务启动时 `[{ code, direction, category }]` 全量（含全局 + 本书型行）。
- 消费方：Pass1 schema 动态生成读**快照**而非实时表——任务中途管理员改表不影响已跑任务。

## 4. runType 枚举调整

```prisma
enum AgentRunType {
  PRESCAN          // 确定性预扫描
  IDENTITY         // 身份解析（Tier1/Tier2）
  EXTRACTION       // 分片事实提取
  RECONCILE        // 漏网高频补判
  VALIDATION       // 确定性校验（零 LLM）
  CROSS_VALIDATION // 跨模型复核
  SKILL_GENERATION // 技能候选生成
  @@map("agent_run_type")
}
```

删除：JOB_PIPELINE / ENTITY_PRESCAN / CHAPTER_ANALYSIS / GLOBAL_RESOLUTION / TITLE_RESOLUTION。

## 5. 删除 agent_steps

- 删 `AgentStep` model + `AgentStepKind` enum + `AgentRun.steps` 关系。
- 同步清理 src 中引用（grep `AgentStep` / `agent_steps`）。
- 成本细账若需要：`agent_runs.usage`（Json）已含 prompt/completion/total tokens，逐片即一次 run，无需逐步表。

## 6. AUTO_VERIFIED

- `RecordSource` 加 `AUTO_VERIFIED // 自动接受栈落库（机器验收），区别于 MANUAL`。
- 语义：事实经自动接受栈五条件通过后落 VERIFIED + recordSource=AUTO_VERIFIED。棘轮校准用 recordSource 区分统计自动接受准确率。

## 7. 种子数据

- `prisma/seed.ts`（或独立 `scripts/seed-relationship-types.ts`）：幂等 upsert。
- 全局 10 类：父子/母子/兄弟/夫妻/师生/同年/同僚/主仆/朋友/仇敌（含 direction/category/aliases）。
- 书型 keju-novel：座师/门生/同年（INVERSE 或 SYMMETRIC 语义，与全局"师生/同年"并存但码不同——书型码更精确）。
- `isBaseline` 式标记：关系码种子可标记来源，便于管理台维护。

## 8. 迁移与验证

1. 改 `prisma/schema.prisma` → `pnpm prisma:generate` → `pnpm prisma:migrate --name v5_data_model`
2. 跑种子 → 验证幂等（重跑不报错、不重复）
3. `grep -r "AgentStep\|agent_steps" src/ prisma/` 零引用
