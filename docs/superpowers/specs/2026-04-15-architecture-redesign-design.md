# 架构重设计：知识库重构 + 双管线最优方案

> **生成日期**：2026-04-15  
> **范围**：知识库数据模型重构 + Sequential 准确率提升 + TwoPass 修复  
> **前置文档**：
> - `docs/人物解析链路审计报告-v2.md`
> - `docs/Sequential-准确率提升整体优化方案.md`
> - `docs/全局知识库服务化重构设计.md`

---

## 一、背景与目标

### 现状问题

| 层级 | 问题 | 影响 |
|---|---|---|
| 知识库模型 | `ExtractionRule` 混放 NER 算法配置与 Prompt 注入指令 | 职责不清，维护困难 |
| 知识库模型 | `PromptTemplate.activeVersionId` 循环引用 | 迁移风险，删除顺序依赖 |
| 知识库模型 | `GenericTitleEntry.exemptInGenres` 为 JSON，不可查询 | 与 `exemptInBooks String[]` 不一致 |
| 知识库模型 | `BookType.presetConfig Json?` 为黑盒 | 类型结构不可见，与 DB 表割裂 |
| 知识库模型 | 三张新过滤表（历史人物/关系词/名字规则）只有 `isVerified`，无来源追踪 | 无法区分人工录入与 AI 批量生成 |
| Sequential | 无全局实体视图，同名人物在不同章节被拆分 | 准确率 ~65-70% |
| Sequential | AliasRegistry 实际产出 0 条，跨章节消歧失效 | 别名系统形同虚设 |
| TwoPass | Pass 1 无过滤层，泛称/关系词全部进候选池 | 产出 600+ 角色（正常应 ~200） |
| TwoPass | Pass 2 Union-Find 编辑距离 ≤1 太激进 | 随机合并不同人物 |

### 设计目标

| 目标 | 度量 |
|---|---|
| G1：知识库表职责清晰 | 每张表命名即语义，无 ruleType 混放 |
| G2：统一审核字段 | 所有知识条目有 `source / reviewStatus / reviewNote` |
| G3：配置显式化 | `BookType.presetConfig` 废弃，配置进对应表 |
| G4：Sequential 准确率 | 修复后达到 80-85% |
| G5：TwoPass 修复 | 产出角色数降至 180-200，准确率 88-92% |
| G6：两种架构共存 | 均可独立运行，通过 Admin UI 选择 |

---

## 二、知识库重设计

### 2.1 设计原则

1. **一张表一个职责** — 不用 `ruleType` 区分完全不同的事物
2. **统一质量管控** — `source / reviewStatus / reviewNote` 标准三件套
3. **范围继承一致** — 全局 → 书籍类型（`bookTypeId` FK） → 书籍（`bookId` FK）
4. **命名反映意图** — `KnowledgePack` → `AliasPack`，名字就是用途

### 2.2 架构总览（13 张表）

```
Domain 1: 书籍分类
  book_types                  ← 精简，移除 presetConfig JSON

Domain 2: NER 词典（PersonaResolver 算法配置）
  surname_rules               ← 原 surname_entries（改名）
  generic_title_rules         ← 原 generic_title_entries（修豁免字段）
                                 新增 RELATIONAL tier，合并 relational_term_entries
  ner_lexicon_rules           ← 从 extraction_rules 拆出 SUFFIX/STEM 类型

Domain 3: 实体过滤库（什么不应成为 persona）
  historical_figure_entries   ← 补全 source/reviewStatus/reviewNote/isActive
  name_pattern_rules          ← 同上
  （relational_term_entries 已合并进 generic_title_rules，tier=RELATIONAL）

Domain 4: 别名字典（谁映射到谁，预配置）
  alias_packs                 ← 原 knowledge_packs（改名）
  alias_entries               ← 原 knowledge_entries（改名，仅 CHARACTER）
  book_alias_packs            ← 原 book_knowledge_packs（改名）

Domain 5: Prompt 配置（告诉 AI 怎么提取）
  prompt_extraction_rules     ← 从 extraction_rules 拆出 ENTITY/RELATIONSHIP
  prompt_templates            ← 移除 activeVersionId 循环引用
  prompt_template_versions    ← 新增 isActive，替代 activeVersionId

Domain 6: 审计
  knowledge_audit_logs        ← 不变
```

### 2.3 变更清单

| # | 原表 | 新表 | 变更类型 | 原因 |
|---|---|---|---|---|
| 1 | `book_types` | `book_types` | 删 `presetConfig Json?` | JSON 黑盒，迁移到各对应表 |
| 2 | `extraction_rules` | `ner_lexicon_rules` | 拆分（SUFFIX/STEM 类型） | 算法配置与 Prompt 指令混放 |
| 3 | `extraction_rules` | `prompt_extraction_rules` | 拆分（ENTITY/REL 类型） | 同上 |
| 4 | `prompt_templates` | `prompt_templates` | 删 `activeVersionId` | 循环引用 |
| 5 | `prompt_template_versions` | `prompt_template_versions` | 加 `isActive Boolean` | 替代 activeVersionId |
| 6 | `generic_title_entries` | `generic_title_rules` | 修豁免字段 + 新增 `RELATIONAL` tier | 合并 relational_term_entries；JSON → String[] |
| 7 | `surname_entries` | `surname_rules` | 改名 | 语义统一 |
| 8 | `relational_term_entries` | — | **废弃，数据迁入 `generic_title_rules`** | 语义相同，tier=RELATIONAL 覆盖 |
| 9 | `historical_figure_entries` | `historical_figure_entries` | 补 `source/reviewStatus/reviewNote/isActive` | 与 AliasEntry 对齐 |
| 10 | `name_pattern_rules` | `name_pattern_rules` | 同上 | 同上 |
| 11 | `knowledge_packs` | `alias_packs` | 改名 | 真实用途是别名字典 |
| 12 | `knowledge_entries` | `alias_entries` | 改名 + 移除 LOCATION/ORGANIZATION | 只用于人物别名 |
| 13 | `book_knowledge_packs` | `book_alias_packs` | 改名 | 语义统一 |
| 14 | `knowledge_audit_logs` | `knowledge_audit_logs` | 不变 | — |

### 2.4 新 Prisma Schema

```prisma
// ═══════════════════════════════════════════════
// Domain 1: 书籍分类
// ═══════════════════════════════════════════════

model BookType {
  id          String  @id @default(uuid()) @db.Uuid
  key         String  @unique
  name        String
  description String? @db.Text
  isActive    Boolean @default(true)  @map("is_active")
  sortOrder   Int     @default(0)     @map("sort_order")

  // presetConfig 废弃 — 配置迁入 ner_lexicon_rules / prompt_extraction_rules
  books                Book[]
  aliasPacks           AliasPack[]
  surnameRules         SurnameRule[]
  nerLexiconRules      NerLexiconRule[]
  promptExtractionRules PromptExtractionRule[]
  promptVersions       PromptTemplateVersion[]

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt      @map("updated_at") @db.Timestamptz(6)

  @@index([key])
  @@index([isActive, sortOrder])
  @@map("book_types")
}

// ═══════════════════════════════════════════════
// Domain 2: NER 词典
// ═══════════════════════════════════════════════

model SurnameRule {
  id          String  @id @default(uuid()) @db.Uuid
  surname     String  @unique
  isCompound  Boolean @default(false) @map("is_compound")
  priority    Int     @default(0)
  bookTypeId  String? @map("book_type_id") @db.Uuid  // null = 通用
  description String? @db.Text
  isActive    Boolean @default(true)  @map("is_active")
  source      String  @default("MANUAL")  // MANUAL | LLM_SUGGESTED | IMPORTED

  bookType BookType? @relation(fields: [bookTypeId], references: [id])

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt      @map("updated_at") @db.Timestamptz(6)

  @@index([isCompound, priority])
  @@index([isActive])
  @@map("surname_rules")
}

model GenericTitleRule {
  id       String  @id @default(uuid()) @db.Uuid
  title    String  @unique
  /// SAFETY:     绝对泛称，永远过滤，无例外
  /// DEFAULT:    默认泛称，dynamicTitleResolution 可升级为 personalized
  /// RELATIONAL: 关系词（父亲/兄长/嫂子），过滤，除非 aliasRegistry 有稳定绑定
  ///             原 relational_term_entries 合并至此 tier
  tier     String  @default("DEFAULT")  // SAFETY | DEFAULT | RELATIONAL
  category String? @db.VarChar(30)     // OFFICIAL | RELIGIOUS | SERVANT | MILITARY | KINSHIP | SOCIAL

  /// 豁免：在以下书籍类型中不视为泛称（存 BookType.id UUID 数组，仅 SAFETY/DEFAULT 有效）
  exemptInBookTypeIds String[] @default([]) @map("exempt_in_book_type_ids")
  /// 豁免：在以下书籍中不视为泛称（存 Book.id UUID 数组，仅 SAFETY/DEFAULT 有效）
  exemptInBooks       String[] @default([]) @map("exempt_in_books")

  description String? @db.Text
  isActive    Boolean @default(true)   @map("is_active")
  source      String  @default("MANUAL")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt      @map("updated_at") @db.Timestamptz(6)

  @@index([tier, isActive])
  @@map("generic_title_rules")
}

/// NER 算法配置：后缀惩罚规则与称号/职位词干
/// 与 prompt_extraction_rules 的区别：本表配置评分算法，不注入 AI Prompt
model NerLexiconRule {
  id        String  @id @default(uuid()) @db.Uuid
  /// HARD_BLOCK_SUFFIX: 词尾命中 → 得分直接归 0
  /// SOFT_BLOCK_SUFFIX: 词尾命中 → 得分乘以 softBlockPenalty 系数
  /// TITLE_STEM:        用于构建 titlePattern 正则
  /// POSITION_STEM:     用于构建 positionPattern 正则
  ruleType   String  @map("rule_type")
  content    String  @db.Text
  bookTypeId String? @map("book_type_id") @db.Uuid  // null = 全局
  sortOrder  Int     @default(0)  @map("sort_order")
  isActive   Boolean @default(true) @map("is_active")
  source     String  @default("MANUAL")
  changeNote String? @db.Text @map("change_note")

  bookType BookType? @relation(fields: [bookTypeId], references: [id])

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt      @map("updated_at") @db.Timestamptz(6)

  @@index([ruleType, isActive, sortOrder])
  @@index([bookTypeId])
  @@map("ner_lexicon_rules")
}

// ═══════════════════════════════════════════════
// Domain 3: 实体过滤库
// ═══════════════════════════════════════════════

model HistoricalFigureEntry {
  id          String   @id @default(uuid()) @db.Uuid
  name        String   @db.VarChar(100)
  aliases     String[] @default([])
  dynasty     String?  @db.VarChar(50)
  /// EMPEROR | SAGE | POET | GENERAL | MYTHICAL | STATESMAN
  category    String   @db.VarChar(30)
  description String?  @db.Text

  source       String    @default("MANUAL")   // MANUAL | LLM_GENERATED | IMPORTED
  reviewStatus String    @default("PENDING")  // PENDING | VERIFIED | REJECTED
  reviewNote   String?   @map("review_note")  @db.Text
  reviewedAt   DateTime? @map("reviewed_at")  @db.Timestamptz(6)
  isActive     Boolean   @default(true)       @map("is_active")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt      @map("updated_at") @db.Timestamptz(6)

  @@index([name])
  @@index([category, reviewStatus])
  @@map("historical_figure_entries")
}

// RelationalTermEntry 已废弃，数据迁入 GenericTitleRule（tier=RELATIONAL）
// PersonaResolver 中对应逻辑：
//   if (tier === "RELATIONAL") {
//     const hasBinding = await aliasRegistry.lookupAlias(bookId, rawName, chapterNo)
//     if (!hasBinding) return { status: "hallucinated", reason: "relational_term" }
//   }

model NamePatternRule {
  id       String @id @default(uuid()) @db.Uuid
  /// FAMILY_HOUSE | DESCRIPTIVE_PHRASE | RELATIONAL_COMPOUND
  ruleType String @db.VarChar(30) @map("rule_type")
  /// 正则表达式，长度上限 200
  pattern  String @db.VarChar(200)
  /// BLOCK | WARN
  action   String @db.VarChar(20)
  description String? @db.Text

  source       String    @default("MANUAL")
  reviewStatus String    @default("PENDING")  // PENDING | VERIFIED | REJECTED
  reviewNote   String?   @map("review_note")  @db.Text
  isActive     Boolean   @default(true)       @map("is_active")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt      @map("updated_at") @db.Timestamptz(6)

  @@index([ruleType, reviewStatus])
  @@map("name_pattern_rules")
}

// ═══════════════════════════════════════════════
// Domain 4: 别名字典
// ═══════════════════════════════════════════════

model AliasPack {
  id          String  @id @default(uuid()) @db.Uuid
  name        String
  description String? @db.Text
  /// GLOBAL: 所有书籍通用
  /// BOOK_TYPE: 特定书籍类型自动继承
  /// BOOK: 需手动挂载到指定书籍
  scope      String  @default("GLOBAL")
  bookTypeId String? @map("book_type_id") @db.Uuid  // scope=BOOK_TYPE 时设置
  version    Int     @default(1)
  isActive   Boolean @default(true) @map("is_active")

  bookType  BookType?      @relation(fields: [bookTypeId], references: [id])
  entries   AliasEntry[]
  bookPacks BookAliasPack[]

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt      @map("updated_at") @db.Timestamptz(6)

  @@index([scope, isActive])
  @@index([bookTypeId, isActive])
  @@map("alias_packs")
}

/// 别名映射条目，仅存储人物（CHARACTER）别名
/// 运行时通过 loadFullRuntimeKnowledge 加载为 aliasLookup Map
model AliasEntry {
  id            String   @id @default(uuid()) @db.Uuid
  packId        String   @map("pack_id") @db.Uuid
  canonicalName String   @map("canonical_name")
  aliases       String[] @default([])
  confidence    Float    @default(1.0)

  source       String    @default("MANUAL")   // MANUAL | LLM_GENERATED | IMPORTED
  reviewStatus String    @default("PENDING")  // PENDING | VERIFIED | REJECTED
  reviewNote   String?   @map("review_note")  @db.Text
  reviewedAt   DateTime? @map("reviewed_at")  @db.Timestamptz(6)
  notes        String?   @db.Text

  pack AliasPack @relation(fields: [packId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt      @map("updated_at") @db.Timestamptz(6)

  @@index([packId, reviewStatus])
  @@map("alias_entries")
}

model BookAliasPack {
  id       String @id @default(uuid()) @db.Uuid
  bookId   String @map("book_id") @db.Uuid
  packId   String @map("pack_id") @db.Uuid
  priority Int    @default(0)

  book Book      @relation(fields: [bookId], references: [id], onDelete: Cascade)
  pack AliasPack @relation(fields: [packId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@unique([bookId, packId])
  @@index([bookId])
  @@map("book_alias_packs")
}

// ═══════════════════════════════════════════════
// Domain 5: Prompt 配置
// ═══════════════════════════════════════════════

/// Prompt 注入规则：告诉 AI 如何提取实体和关系
/// 与 ner_lexicon_rules 的区别：本表内容注入 AI Prompt，不配置评分算法
model PromptExtractionRule {
  id       String  @id @default(uuid()) @db.Uuid
  /// ENTITY: 实体提取指令 | RELATIONSHIP: 关系提取指令
  ruleType   String  @map("rule_type")  // ENTITY | RELATIONSHIP
  content    String  @db.Text
  bookTypeId String? @map("book_type_id") @db.Uuid  // null = 全局
  sortOrder  Int     @default(0)  @map("sort_order")
  isActive   Boolean @default(true) @map("is_active")
  source     String  @default("MANUAL")
  changeNote String? @db.Text @map("change_note")

  bookType BookType? @relation(fields: [bookTypeId], references: [id])

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt      @map("updated_at") @db.Timestamptz(6)

  @@index([ruleType, isActive, sortOrder])
  @@index([bookTypeId])
  @@map("prompt_extraction_rules")
}

/// 提示词模板槽，每个分析阶段对应一个 slug
model PromptTemplate {
  id          String  @id @default(uuid()) @db.Uuid
  slug        String  @unique  // "roster_discovery" | "chapter_analysis" | ...
  name        String
  description String? @db.Text
  codeRef     String? @map("code_ref")  // 对应 build*Prompt 函数名
  isActive    Boolean @default(true) @map("is_active")

  // activeVersionId 废弃 — 查询 versions WHERE isActive = true
  versions PromptTemplateVersion[]

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt      @map("updated_at") @db.Timestamptz(6)

  @@map("prompt_templates")
}

model PromptTemplateVersion {
  id           String  @id @default(uuid()) @db.Uuid
  templateId   String  @map("template_id") @db.Uuid
  versionNo    Int     @map("version_no")
  systemPrompt String  @db.Text @map("system_prompt")
  userPrompt   String  @db.Text @map("user_prompt")

  /// 适用书籍类型（null = 所有类型通用）
  bookTypeId String? @map("book_type_id") @db.Uuid

  /// 当前是否为该 template（+ bookType 组合）的生效版本
  /// 替代 PromptTemplate.activeVersionId，消除循环引用
  isActive   Boolean @default(false) @map("is_active")
  isBaseline Boolean @default(false) @map("is_baseline")
  changeNote String? @db.Text @map("change_note")
  createdBy  String? @map("created_by")

  template PromptTemplate @relation(fields: [templateId], references: [id])
  bookType BookType?       @relation(fields: [bookTypeId], references: [id])

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)

  @@unique([templateId, versionNo])
  @@index([templateId, isActive])
  @@index([templateId, bookTypeId])
  @@map("prompt_template_versions")
}
```

### 2.5 数据迁移要点

| 迁移项 | 来源 | 目标 | 说明 |
|---|---|---|---|
| `BookType.presetConfig` 中的 SUFFIX/STEM | JSON blob | `ner_lexicon_rules`（`bookTypeId` = 对应类型） | 按字段逐条插入 |
| `BookType.presetConfig` 中的 ENTITY/REL rules | JSON blob | `prompt_extraction_rules`（`bookTypeId` = 对应类型） | 同上 |
| `ExtractionRule` SUFFIX/STEM 类 | `extraction_rules` | `ner_lexicon_rules` | 直接迁移，字段对应 |
| `ExtractionRule` ENTITY/REL 类 | `extraction_rules` | `prompt_extraction_rules` | 同上 |
| `KnowledgePack` 数据 | `knowledge_packs` | `alias_packs` | 改名，数据不变 |
| `KnowledgeEntry` 数据 | `knowledge_entries` | `alias_entries` | LOCATION/ORGANIZATION 条目可保留历史数据但标记为 inactive |
| `PromptTemplate.activeVersionId` 指向的版本 | FK | `PromptTemplateVersion.isActive = true` | 迁移后该字段删除 |
| `GenericTitleEntry.exemptInGenres` | JSON string[] of keys | `exemptInBookTypeIds` string[] of UUIDs | 需按 key 查 BookType.id 转换 |

---

## 三、Sequential 最优方案

### 3.1 核心修复（三个 Fix）

**Fix S1：AliasRegistry 扩大注册范围（最高优先级）**

当前 `registerAlias()` 只对 `TITLE_ONLY` 或 `positionPattern/titlePattern` 命中时注册，导致实际产出 0 条记录。

修复方向：
```typescript
// 当前（过于严格）：
if (nameType === NameType.TITLE_ONLY
  || positionPattern.test(extractedName)
  || titlePattern.test(extractedName)) {
  await aliasRegistry.registerAlias(...)
}

// 修复后（所有有效别名都注册）：
// 条件：resolved 成功 + extractedName 与 canonicalName 不同 + 名字长度合理
if (resolveResult.status === "resolved"
  && normalizeName(input.extractedName) !== normalizeName(canonicalName)
  && input.extractedName.length >= 2) {
  await aliasRegistry.registerAlias(...)
}
```

效果：第一章出现"范进" → 注册。第十五章出现"主考范进" → AliasRegistry 命中 → 不再新建 persona。

---

**Fix S2：PersonaResolver 短中文名相似度加固**

`scorePair()` 对 2 字中文名的评分策略调整：

```
规则 1：两个 2 字名，姓（第一字）不同 → 得分上限 0.30（强制低于 0.72 阈值）
规则 2：两个 2 字名，姓相同但第二字完全不同 → 得分上限 0.50
规则 3：不影响「短名 + 长别称」的正常加权（如"范进" ↔ "范举人"）

修复的错误案例：
  "向鼎" ↔ "董知县"：第一字不同 → 0.30，不合并 ✓
  "杜倩" ↔ "杜慎卿"：同姓但余字无关 → 0.50，不合并 ✓
  "范进" ↔ "范举人"：同姓，有子串关系 → 走 applySurnameTitleBoost 正常加权 ✓
```

---

**Fix S3：PostAnalysisMerger 增加 Tier 4**

全书完成后的全局补偿，纯规则，零 LLM 成本：

```
Tier 1（现有）：精确名字匹配              → confidence 1.0  → AUTO_MERGED
Tier 2（现有）：KB alias 驱动             → confidence 0.90 → PENDING
Tier 3（现有）：alias 交叉匹配            → confidence 0.85 → PENDING
Tier 4（新增）：同姓 + 章节共现 ≥ 50%     → confidence 0.80 → PENDING

Tier 4 判定逻辑：
  persona A 和 B 同姓（extractSurname 确认）
  且 A 出现的章节集合与 B 出现的章节集合，交集 / 较小集合 ≥ 50%
  → 很可能是同一人的不同称谓，生成 PENDING 合并建议供人工确认
```

### 3.2 预期效果

| 指标 | 修复前 | 修复后 |
|---|---|---|
| 准确率 | 65-70% | 80-85% |
| AliasRegistry 产出 | 0 条 | 覆盖全书有效别名 |
| 错误合并（不同人） | 5+ 组 | < 2 组 |
| 分裂 persona（同一人） | 7+ 组 | < 3 组 |

---

## 四、TwoPass 修复方案

### 4.1 根因分析

```
问题：儒林外史产出 600+ 角色（正常应 ~200）

根因 1：Pass 1 无过滤层（贡献约 400 个多余候选）
  buildIndependentExtractionPrompt() 直接让 AI 提取人名
  → 泛称（管家/差人/邻居）全部进候选池
  → 关系词（父亲/兄长）全部进候选池

根因 2：Pass 2 Union-Find 编辑距离 ≤1 太激进（贡献错误合并）
  中文 2 字名，编辑距离 1 = 任意一个字不同 = 随机合并
  "杜倩" ↔ "杜慎"  编辑距离 = 1 → 被归为同一组 → 错误合并
  "向鼎" ↔ "向晴"  编辑距离 = 1 → 同上
```

### 4.2 Fix T1：Pass 1 加入过滤层

在 Pass 1 实体提取完成后，用 `FullRuntimeKnowledge` 做与 `PersonaResolver` 对齐的前置过滤：

```typescript
// Pass 1 提取完成后，过滤无效候选
function filterPass1Candidates(
  rawNames: string[],
  runtimeKnowledge: FullRuntimeKnowledge
): string[] {
  return rawNames.filter((name) => {
    const raw = name.trim();
    if (raw.length < 2 || raw.length > 8)                         return false; // 过短/过长
    if (/[的之]/.test(raw) && raw.length >= 4)                    return false; // 描述性短语
    if (runtimeKnowledge.safetyGenericTitles.has(raw))            return false; // 安全泛称
    if (runtimeKnowledge.relationalTerms.has(raw))                return false; // 关系词
    if (runtimeKnowledge.namePatternRules.some(
      r => r.action === "BLOCK" && r.compiled.test(raw)))         return false; // 名字规则
    if (runtimeKnowledge.historicalFigures.has(raw))              return false; // 历史人物（暂全过滤）
    return true;
  });
}
```

效果：候选集从 ~600 降至 ~150，与 Sequential 最终人物数对齐。

### 4.3 Fix T2：Pass 2 移除激进编辑距离

`GlobalEntityResolver.buildCandidateGroups()` 调整 Union-Find 分组条件：

```typescript
// 当前三个分组条件：
//   ① KB alias 查找          ← ✅ 保留
//   ② 编辑距离 ≤ 1           ← ❌ 删除
//   ③ 同姓 + alias 重叠      ← ✅ 保留（收窄：alias 重叠需 ≥ 1 个，非空）

// 修复后只保留 ① 和 ③
function buildCandidateGroups(candidates: GlobalCandidate[]): CandidateGroup[] {
  // 仅 KB alias 命中 和 同姓+alias重叠 触发分组
  // 移除所有基于字符编辑距离的相似度分组
}
```

### 4.4 Fix T3：LLM 消歧范围收窄

```
当前：所有候选组批量送 LLM（15 组/次）
改为：只有「规则无法确定」的模糊组才送 LLM

规则可直接确定（不送 LLM）：
  KB alias 命中                → 直接合并
  名字归一化后完全相同          → 直接合并
  同姓但余字零重叠             → 直接不合并

送 LLM 的条件（同时满足）：
  同姓 + 有 alias 重叠 + 未被 KB 覆盖
  AND 组大小 ≤ 5（超过 5 说明可能是泛称漏网，跳过）

预估 LLM 调用：儒林外史从全量 ~60 次 → ~8-12 次
```

### 4.5 预期效果

| 指标 | 修复前 | 修复后 |
|---|---|---|
| 产出角色数（儒林外史） | 600+ | 180-200 |
| 准确率 | 20-30%（因大量错误） | 88-92% |
| Pass 2 LLM 调用次数 | ~60 | ~10 |
| 错误合并（不同人） | 大量 | < 3 组 |

---

## 五、双架构对比与选择建议

| 维度 | Sequential（修复后） | TwoPass（修复后） |
|---|---|---|
| 产出角色数 | ~200-220 | ~180-200 |
| 准确率 | 80-85% | 88-92% |
| API 成本 | 低（单轮分析） | 中（+Pass1扫描，-Pass2LLM大幅减少） |
| 适用场景 | 短篇 / 角色少 / 快速预览 | 长篇 / 角色流动大 / 准确率优先 |
| 全局实体视图 | 无（靠 PostAnalysisMerger 补偿） | 有（Pass 2 全局消解） |

**Admin 导入建议逻辑：**
```
章节数 ≤ 20  OR  预估人物数 ≤ 50  → 推荐 Sequential
章节数 > 20  AND 书籍类型 = 古典长篇 → 推荐 TwoPass
用户可手动覆盖
```

---

## 六、实施顺序建议

### Phase 1：知识库重构（基础）
1. Prisma schema 变更（新增 `ner_lexicon_rules`、`prompt_extraction_rules`，重命名各表）
2. 数据迁移脚本（`BookType.presetConfig` → 各对应表）
3. `load-book-knowledge.ts` 适配新表名和新字段
4. 管理后台 API 路由更新

### Phase 2：共享修复（两架构均受益）
1. Fix S1：AliasRegistry 扩大注册范围
2. Fix S2：PersonaResolver 短中文名相似度加固
3. 知识库种子数据补全（HistoricalFigureEntry 500+ 条）

### Phase 3：Sequential 优化
1. Fix S3：PostAnalysisMerger Tier 4

### Phase 4：TwoPass 修复
1. Fix T1：Pass 1 过滤层
2. Fix T2：移除编辑距离 ≤1
3. Fix T3：LLM 消歧范围收窄

### Phase 5：验收
1. 重跑儒林外史（Sequential）→ 验证角色数 ≤ 220，准确率 ≥ 80%
2. 重跑儒林外史（TwoPass）→ 验证角色数 ≤ 200，准确率 ≥ 88%

---

## 七、不在本方案范围内

- 前端 Admin UI 的展示改动（仅 API 层改动）
- `AliasMapping`（运行时表，非知识库）的结构调整
- `MergeSuggestion` 审核工作流改动
- Persona 性别字段提取（独立问题，单独处理）
