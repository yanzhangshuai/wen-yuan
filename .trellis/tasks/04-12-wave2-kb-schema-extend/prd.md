# Wave2: 知识库表扩展 — 历史人物/关系词/名字规则

> **收敛修订 2026-04-13**: 根据 D2/D8/D11/D13 决策修订。历史人物表为"标记库"非"黑名单"；Book.genre 直接删除；GENRE_PRESETS 直接删除。

## Goal

在 Prisma schema 中新增 3 张知识库表，扩展 ExtractionRule 和 GenericTitleEntry，迁移硬编码词表到 DB，提供管理后台 CRUD API。**历史人物表为"已知历史人物标记库"，非简单黑名单（D13）。**

## 前置文档

- `docs/全局知识库服务化重构设计.md` — 第 3/4/6/7 节
- `docs/spec/persona-entity-types.md` — 人物实体定义
- `docs/spec/persona-field-spec.md` — 字段规范

## 验收标准

- [ ] Prisma migration 成功，3 张新表 + ExtractionRule 扩展 + GenericTitleEntry 扩展
- [ ] 初始化脚本 `scripts/init-knowledge-phase7.ts` 填充全部种子数据
- [ ] 历史人物 API 全部端点可用（GET/POST/PATCH/DELETE/import）
- [ ] 关系词 API 全部端点可用
- [ ] 名字模式规则 API 全部端点可用（含 test 端点 + D9 正则安全校验）
- [ ] `loadFullRuntimeKnowledge()` 可一次性加载全部知识到内存
- [ ] Book.genre 字段已从 Prisma schema 移除（D8）
- [ ] GENRE_PRESETS 已删除（D11）
- [ ] 已有测试全通过

## R1: 新增 Prisma 模型

### `HistoricalFigureEntry`

```prisma
model HistoricalFigureEntry {
  id          String    @id @default(uuid()) @db.Uuid
  name        String    @db.VarChar(50)
  aliases     String[]  @default([])
  category    String    @db.VarChar(30)   // EMPEROR / SAGE / POET / GENERAL / MYTHICAL / STATESMAN
  era         String?   @db.VarChar(30)
  bookTypeId  String?   @db.Uuid
  isActive    Boolean   @default(true)
  source      String    @default("MANUAL") @db.VarChar(20)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  bookType    BookType? @relation(fields: [bookTypeId], references: [id])
  @@unique([name, bookTypeId])
  @@map("historical_figure_entries")
}
```

### `RelationalTermEntry`

```prisma
model RelationalTermEntry {
  id          String    @id @default(uuid()) @db.Uuid
  term        String    @db.VarChar(20)
  category    String    @db.VarChar(20)   // KINSHIP / SOCIAL / GENERIC_ROLE
  isActive    Boolean   @default(true)
  bookTypeId  String?   @db.Uuid
  source      String    @default("MANUAL") @db.VarChar(20)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  bookType    BookType? @relation(fields: [bookTypeId], references: [id])
  @@unique([term, bookTypeId])
  @@map("relational_term_entries")
}
```

### `NamePatternRule`

```prisma
model NamePatternRule {
  id          String    @id @default(uuid()) @db.Uuid
  pattern     String    @db.VarChar(200)
  ruleType    String    @db.VarChar(30)   // DESCRIPTIVE_PHRASE / FAMILY_HOUSE / RELATIONAL_COMPOUND
  action      String    @db.VarChar(20)   // BLOCK / WARN / ALLOW
  description String?   @db.VarChar(200)
  priority    Int       @default(0)
  isActive    Boolean   @default(true)
  bookTypeId  String?   @db.Uuid
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  bookType    BookType? @relation(fields: [bookTypeId], references: [id])
  @@map("name_pattern_rules")
}
```

## R2: ExtractionRule 扩展

在 `ExtractionRule` 表中新增 4 种 `ruleType`:
- `HARD_BLOCK_SUFFIX` — 迁移 HARD_BLOCK_SUFFIXES (10 条)
- `SOFT_BLOCK_SUFFIX` — 迁移 DEFAULT_SOFT_BLOCK_SUFFIXES (12 条)
- `TITLE_STEM` — 迁移 UNIVERSAL_TITLE_STEMS (10 条)
- `POSITION_STEM` — 迁移 DEFAULT_POSITION_STEMS (10 条)

## R2.5: GenericTitleEntry 扩展

新增字段:
- `exemptInBooks String[] @default([])` — 书籍级豁免 (bookId 列表)
- `category String? @db.VarChar(30)` — OFFICIAL / RELIGIOUS / SERVANT / MILITARY / ...

## R3: 初始化脚本

**文件**: `scripts/init-knowledge-phase7.ts`

种子数据:
- 历史人物 ~100 条（从审计报告 B 类扩充 + 通用中国历史人物，**非黑名单，而是标记库 D13**）
- 关系词 ~80 条（从审计报告 A 类关系词子集 + 手工扩充）
- 名字模式规则 ~15 条（描述短语/家族名/关系复合词规则，**含 D9 正则安全校验**）
- hardBlock/softBlock/titleStems/positionStems 共 42 条
- 牛布衣 aliases 修复（D1）: 移除牛浦郎，新增独立牛浦郎条目
- 新增泛称 ~50 条写入 GenericTitleEntry

在 `prisma/seed.ts` 中追加调用。

## R4: `loadFullRuntimeKnowledge()` 实现

**文件**: `src/server/modules/knowledge/load-book-knowledge.ts`

扩展现有 `loadAnalysisRuntimeConfig()` 或新增 `loadFullRuntimeKnowledge()`:
- 新增加载 historicalFigures、relationalTerms、namePatternRules
- 新增加载 hardBlockSuffixes、softBlockSuffixes、titleStems、positionStems（从 ExtractionRule）
- 编译 namePatternRules 的正则表达式 **（含 D9 安全校验: 100ms 超时 + ≤200 字符 + 禁嵌套量词）**
- 缓存策略: bookId 级别，**解析任务启动时强制刷新一次，任务内不热更新（D12）**

## R5: 管理后台 API

参见 `docs/全局知识库服务化重构设计.md` 第 6 节。

文件位置:
- `src/app/api/admin/knowledge/historical-figures/route.ts`
- `src/app/api/admin/knowledge/historical-figures/[id]/route.ts`
- `src/app/api/admin/knowledge/historical-figures/import/route.ts`
- `src/app/api/admin/knowledge/relational-terms/route.ts`
- `src/app/api/admin/knowledge/relational-terms/[id]/route.ts`
- `src/app/api/admin/knowledge/name-patterns/route.ts`
- `src/app/api/admin/knowledge/name-patterns/[id]/route.ts`
- `src/app/api/admin/knowledge/name-patterns/test/route.ts`

## 依赖

- Prisma `npx prisma migrate dev`
- 本任务完成后，Wave1 的硬编码常量直接删除（D2/D11: 无 fallback，无过渡期）

## 附加: Book.genre 删除（D8）

本任务同时负责:
1. `prisma/schema.prisma` — Book model 删除 `genre String?` 行
2. 新增 Prisma migration 删除 `genre` 列
3. 全局搜索 `book.genre` 引用替换为 `book.bookType?.key ?? null`

## 附加: GENRE_PRESETS 删除（D11）

1. `src/server/modules/analysis/config/pipeline.ts` — 删除 `GENRE_PRESETS` 对象
2. 删除所有引用 `GENRE_PRESETS` 的代码路径
3. `BookType.presetConfig` 成为唯一配置来源
