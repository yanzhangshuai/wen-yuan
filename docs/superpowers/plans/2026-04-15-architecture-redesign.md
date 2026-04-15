# Architecture Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the knowledge-base schema (13 tables, clear responsibilities) and fix the Sequential pipeline (80-85% accuracy) and TwoPass pipeline (88-92% accuracy, 180-200 characters).

**Architecture:** Phase 1 migrates the Prisma schema and data; Phases 2-3 update all code that references the old models; Phases 4-6 apply algorithm fixes to PersonaResolver, PostAnalysisMerger, and GlobalEntityResolver.

**Tech Stack:** TypeScript, Prisma 7, PostgreSQL 16, Next.js App Router API routes, Vitest

---

## File Map

### Phase 1 – Schema

| File | Action |
|---|---|
| `prisma/schema.prisma` | Modify: rename 5 models, add NerLexiconRule + PromptExtractionRule, field changes |
| `prisma/migrations/YYYYMMDD_kb_refactor/migration.sql` | Create: hand-edited migration SQL |
| `scripts/migrate-kb-data.ts` | Create: data migration script (ExtractionRule split, RelationalTermEntry merge, etc.) |

### Phase 2 – Knowledge Service Layer

| File | Action |
|---|---|
| `src/server/modules/knowledge/load-book-knowledge.ts` | Modify: use new model names, new field names |
| `src/server/modules/knowledge/surnames.ts` | Modify: `surnameEntry` → `surnameRule` |
| `src/server/modules/knowledge/generic-titles.ts` | Modify: `genericTitleEntry` → `genericTitleRule`, add RELATIONAL tier |
| `src/server/modules/knowledge/extraction-rules.ts` | Modify: split into ner-lexicon-rules + prompt-extraction-rules |
| `src/server/modules/knowledge/ner-lexicon-rules.ts` | Create: CRUD for NerLexiconRule |
| `src/server/modules/knowledge/prompt-extraction-rules.ts` | Create: CRUD for PromptExtractionRule |
| `src/server/modules/knowledge/knowledge-packs.ts` | Modify: `knowledgePack` → `aliasPack` |
| `src/server/modules/knowledge/knowledge-entries.ts` | Modify: `knowledgeEntry` → `aliasEntry` |
| `src/server/modules/knowledge/book-knowledge-packs.ts` | Modify: `bookKnowledgePack` → `bookAliasPack` |
| `src/server/modules/knowledge/index.ts` | Modify: update exports |

### Phase 3 – API Routes

| File | Action |
|---|---|
| `src/app/api/admin/knowledge/surnames/route.ts` | Modify: model ref update |
| `src/app/api/admin/knowledge/surnames/[id]/route.ts` | Modify: model ref update |
| `src/app/api/admin/knowledge/title-filters/route.ts` | Modify: model ref update (includes RELATIONAL tier) |
| `src/app/api/admin/knowledge/title-filters/[id]/route.ts` | Modify: model ref update |
| `src/app/api/admin/knowledge/relational-terms/route.ts` | Modify: point to genericTitleRule tier=RELATIONAL |
| `src/app/api/admin/knowledge/relational-terms/[id]/route.ts` | Modify: same |
| `src/app/api/admin/knowledge/ner-rules/route.ts` | Modify: extractionRule → nerLexiconRule |
| `src/app/api/admin/knowledge/ner-rules/[id]/route.ts` | Modify: same |
| `src/app/api/admin/knowledge/alias-packs/route.ts` | Modify: knowledgePack → aliasPack |
| `src/app/api/admin/knowledge/alias-packs/[id]/route.ts` | Modify: same |
| `src/app/api/admin/knowledge/books/[bookId]/knowledge-packs/route.ts` | Modify: same |
| `src/app/api/admin/knowledge/prompt-templates/[slug]/activate/[versionId]/route.ts` | Modify: remove activeVersionId logic, use isActive |

### Phase 4 – Fix S1: AliasRegistry Expansion

| File | Action |
|---|---|
| `src/server/modules/analysis/services/PersonaResolver.ts` | Modify: expand registerAlias condition (lines ~695-719) |
| `src/server/modules/analysis/services/PersonaResolver.test.ts` | Modify: add test cases for new registration logic |

### Phase 5 – Fix S2: Short Chinese Name Guard

| File | Action |
|---|---|
| `src/server/modules/analysis/services/PersonaResolver.ts` | Modify: add `guardShortChineseName()` called in `scorePair()` |
| `src/server/modules/analysis/services/PersonaResolver.test.ts` | Modify: add 4 test cases |

### Phase 6 – Fix S3: PostAnalysisMerger Tier 4

| File | Action |
|---|---|
| `src/server/modules/analysis/services/PostAnalysisMerger.ts` | Modify: add Tier 4 (co-surname + chapter co-occurrence ≥ 50%) |
| `src/server/modules/analysis/services/PostAnalysisMerger.test.ts` | Modify: add Tier 4 test cases |

### Phase 7 – Fix T1: TwoPass Pass1 Filter

| File | Action |
|---|---|
| `src/server/modules/analysis/pipelines/twopass/TwoPassPipeline.ts` | Modify: call filterPass1Candidates after Pass1 extraction |
| `src/server/modules/analysis/pipelines/twopass/GlobalEntityResolver.ts` | Modify: accept pre-filtered candidates |

### Phase 8 – Fix T2: Remove Edit Distance

| File | Action |
|---|---|
| `src/server/modules/analysis/pipelines/twopass/GlobalEntityResolver.ts` | Modify: remove `editDistance` loop from `buildCandidateGroups()` (lines ~193-199) |

### Phase 9 – Fix T3: Narrow LLM Scope

| File | Action |
|---|---|
| `src/server/modules/analysis/pipelines/twopass/GlobalEntityResolver.ts` | Modify: pre-filter groups before sending to LLM |

---

## Task 1: Prisma Schema — New Models and Field Changes

**Files:**
- Modify: `prisma/schema.prisma`

This task writes the new schema. No migration runs yet — that's Task 2.

- [ ] **Step 1: Replace BookType model** (remove `presetConfig`, add relations)

In `prisma/schema.prisma`, find the `BookType` model (line ~523) and replace:

```prisma
model BookType {
  id          String  @id @default(uuid()) @db.Uuid
  key         String  @unique
  name        String
  description String? @db.Text
  isActive    Boolean @default(true)  @map("is_active")
  sortOrder   Int     @default(0)     @map("sort_order")

  // presetConfig 废弃 — 配置已迁入 ner_lexicon_rules / prompt_extraction_rules
  books                 Book[]
  aliasPacks            AliasPack[]
  surnameRules          SurnameRule[]
  nerLexiconRules       NerLexiconRule[]
  promptExtractionRules PromptExtractionRule[]
  promptVersions        PromptTemplateVersion[]

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt      @map("updated_at") @db.Timestamptz(6)

  @@index([key])
  @@index([isActive, sortOrder])
  @@map("book_types")
}
```

- [ ] **Step 2: Replace KnowledgePack → AliasPack**

Replace the entire `KnowledgePack` model block:

```prisma
model AliasPack {
  id          String  @id @default(uuid()) @db.Uuid
  name        String
  description String? @db.Text
  /// GLOBAL: 所有书籍通用 | BOOK_TYPE: 特定书籍类型自动继承 | BOOK: 需手动挂载
  scope      String  @default("GLOBAL")
  bookTypeId String? @map("book_type_id") @db.Uuid
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
```

- [ ] **Step 3: Replace KnowledgeEntry → AliasEntry**

Replace the entire `KnowledgeEntry` model block:

```prisma
/// 别名映射条目，仅存储人物（CHARACTER）别名
model AliasEntry {
  id            String   @id @default(uuid()) @db.Uuid
  packId        String   @map("pack_id") @db.Uuid
  canonicalName String   @map("canonical_name")
  aliases       String[] @default([])
  confidence    Float    @default(1.0)

  source       String    @default("MANUAL")
  reviewStatus String    @default("PENDING") @map("review_status")
  reviewNote   String?   @map("review_note")  @db.Text
  reviewedAt   DateTime? @map("reviewed_at")  @db.Timestamptz(6)
  notes        String?   @db.Text

  pack AliasPack @relation(fields: [packId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt      @map("updated_at") @db.Timestamptz(6)

  @@index([packId, reviewStatus])
  @@map("alias_entries")
}
```

- [ ] **Step 4: Replace BookKnowledgePack → BookAliasPack**

Replace the entire `BookKnowledgePack` model block:

```prisma
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
```

- [ ] **Step 5: Replace SurnameEntry → SurnameRule**

Replace the entire `SurnameEntry` model block:

```prisma
model SurnameRule {
  id          String  @id @default(uuid()) @db.Uuid
  surname     String  @unique
  isCompound  Boolean @default(false) @map("is_compound")
  priority    Int     @default(0)
  bookTypeId  String? @map("book_type_id") @db.Uuid
  description String? @db.Text
  isActive    Boolean @default(true)  @map("is_active")
  source      String  @default("MANUAL")

  bookType BookType? @relation(fields: [bookTypeId], references: [id])

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt      @map("updated_at") @db.Timestamptz(6)

  @@index([isCompound, priority])
  @@index([isActive])
  @@map("surname_rules")
}
```

- [ ] **Step 6: Replace GenericTitleEntry → GenericTitleRule**

Replace the entire `GenericTitleEntry` model block:

```prisma
model GenericTitleRule {
  id       String  @id @default(uuid()) @db.Uuid
  title    String  @unique
  /// SAFETY:     绝对泛称，永远过滤
  /// DEFAULT:    默认泛称，可通过 exemptInBookTypeIds/exemptInBooks 豁免
  /// RELATIONAL: 关系词（父亲/兄长/嫂子），原 relational_term_entries 合并于此
  tier     String  @default("DEFAULT")
  category String? @db.VarChar(30)

  /// 豁免书籍类型（存 BookType.id UUID 数组，仅 SAFETY/DEFAULT 有效）
  exemptInBookTypeIds String[] @default([]) @map("exempt_in_book_type_ids")
  /// 豁免书籍（存 Book.id UUID 数组）
  exemptInBooks       String[] @default([]) @map("exempt_in_books")

  description String? @db.Text
  isActive    Boolean @default(true)  @map("is_active")
  source      String  @default("MANUAL")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt      @map("updated_at") @db.Timestamptz(6)

  @@index([tier, isActive])
  @@map("generic_title_rules")
}
```

- [ ] **Step 7: Add NerLexiconRule model** (after GenericTitleRule)

```prisma
/// NER 算法配置：后缀惩罚规则与称号/职位词干
/// 与 prompt_extraction_rules 的区别：本表配置评分算法，不注入 AI Prompt
model NerLexiconRule {
  id        String  @id @default(uuid()) @db.Uuid
  /// HARD_BLOCK_SUFFIX | SOFT_BLOCK_SUFFIX | TITLE_STEM | POSITION_STEM
  ruleType   String  @map("rule_type")
  content    String  @db.Text
  bookTypeId String? @map("book_type_id") @db.Uuid
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
```

- [ ] **Step 8: Update HistoricalFigureEntry** (add source/reviewStatus/reviewNote/isActive, remove isVerified)

Replace `HistoricalFigureEntry`:

```prisma
model HistoricalFigureEntry {
  id          String   @id @default(uuid()) @db.Uuid
  name        String   @db.VarChar(100)
  aliases     String[] @default([])
  dynasty     String?  @db.VarChar(50)
  category    String   @db.VarChar(30)
  description String?  @db.Text

  source       String    @default("MANUAL")
  reviewStatus String    @default("PENDING") @map("review_status")
  reviewNote   String?   @map("review_note") @db.Text
  reviewedAt   DateTime? @map("reviewed_at") @db.Timestamptz(6)
  isActive     Boolean   @default(true)      @map("is_active")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt      @map("updated_at") @db.Timestamptz(6)

  @@index([name])
  @@index([category, reviewStatus])
  @@map("historical_figure_entries")
}
```

- [ ] **Step 9: Update NamePatternRule** (add source/reviewStatus/isActive, remove isVerified, add updatedAt)

Replace `NamePatternRule`:

```prisma
model NamePatternRule {
  id          String  @id @default(uuid()) @db.Uuid
  ruleType    String  @db.VarChar(30) @map("rule_type")
  pattern     String  @db.VarChar(200)
  action      String  @db.VarChar(20)
  description String? @db.Text

  source       String  @default("MANUAL")
  reviewStatus String  @default("PENDING") @map("review_status")
  reviewNote   String? @map("review_note") @db.Text
  isActive     Boolean @default(true)      @map("is_active")

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt      @map("updated_at") @db.Timestamptz(6)

  @@index([ruleType, reviewStatus])
  @@map("name_pattern_rules")
}
```

- [ ] **Step 10: Update PromptTemplate** (remove activeVersionId)

Replace `PromptTemplate`:

```prisma
model PromptTemplate {
  id          String  @id @default(uuid()) @db.Uuid
  slug        String  @unique
  name        String
  description String? @db.Text
  codeRef     String? @map("code_ref")
  isActive    Boolean @default(true) @map("is_active")

  // activeVersionId 废弃 — 查 versions WHERE isActive = true
  versions PromptTemplateVersion[]

  createdAt DateTime @default(now()) @map("created_at") @db.Timestamptz(6)
  updatedAt DateTime @updatedAt      @map("updated_at") @db.Timestamptz(6)

  @@map("prompt_templates")
}
```

- [ ] **Step 11: Update PromptTemplateVersion** (add isActive, bookTypeId FK; remove genreKey)

Replace `PromptTemplateVersion`:

```prisma
model PromptTemplateVersion {
  id           String  @id @default(uuid()) @db.Uuid
  templateId   String  @map("template_id") @db.Uuid
  versionNo    Int     @map("version_no")
  systemPrompt String  @db.Text @map("system_prompt")
  userPrompt   String  @db.Text @map("user_prompt")

  bookTypeId String? @map("book_type_id") @db.Uuid
  /// 当前是否为该 template（+ bookType 组合）的生效版本，替代 activeVersionId
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

- [ ] **Step 12: Add PromptExtractionRule model** (after PromptTemplateVersion)

```prisma
/// Prompt 注入规则：告诉 AI 如何提取实体和关系
/// 与 ner_lexicon_rules 的区别：本表内容注入 AI Prompt，不配置评分算法
model PromptExtractionRule {
  id         String  @id @default(uuid()) @db.Uuid
  /// ENTITY | RELATIONSHIP
  ruleType   String  @map("rule_type")
  content    String  @db.Text
  bookTypeId String? @map("book_type_id") @db.Uuid
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
```

- [ ] **Step 13: Remove RelationalTermEntry model** 

Delete the entire `RelationalTermEntry` model block from `schema.prisma`. Add a comment in its place:

```prisma
// RelationalTermEntry 已废弃 — 数据已迁入 GenericTitleRule（tier=RELATIONAL）
```

- [ ] **Step 14: Update Book model relations**

In the `Book` model, update relation names:
- Find `bookKnowledgePacks` relation → rename to `bookAliasPacks`
- Type: `BookAliasPack[]`

- [ ] **Step 15: Verify schema compiles**

```bash
cd /home/mwjz/code/wen-yuan
pnpm prisma validate
```

Expected: `The schema at "prisma/schema.prisma" is valid!`

---

## Task 2: Database Migration

**Files:**
- Create: `prisma/migrations/<timestamp>_kb_refactor/migration.sql`

This task creates a safe migration that preserves all existing data by using `RENAME` instead of DROP+CREATE.

- [ ] **Step 1: Generate migration scaffold**

```bash
cd /home/mwjz/code/wen-yuan
pnpm prisma migrate dev --name kb_refactor --create-only
```

Expected: Creates `prisma/migrations/<timestamp>_kb_refactor/migration.sql` with auto-generated SQL.

- [ ] **Step 2: Replace migration.sql with safe hand-edited version**

Open the generated file and replace its entire contents with:

```sql
-- =====================================================================
-- Phase 1: Rename tables (preserve data)
-- =====================================================================

ALTER TABLE "knowledge_packs"       RENAME TO "alias_packs";
ALTER TABLE "knowledge_entries"     RENAME TO "alias_entries";
ALTER TABLE "book_knowledge_packs"  RENAME TO "book_alias_packs";
ALTER TABLE "surname_entries"       RENAME TO "surname_rules";
ALTER TABLE "generic_title_entries" RENAME TO "generic_title_rules";

-- Rename indexes on alias_packs
ALTER INDEX IF EXISTS "knowledge_packs_book_type_active_idx" RENAME TO "alias_packs_book_type_active_idx";
ALTER INDEX IF EXISTS "knowledge_packs_scope_idx"            RENAME TO "alias_packs_scope_idx";

-- Rename indexes on alias_entries
ALTER INDEX IF EXISTS "knowledge_entries_pack_review_idx"    RENAME TO "alias_entries_pack_review_idx";
ALTER INDEX IF EXISTS "knowledge_entries_canonical_name_idx" RENAME TO "alias_entries_canonical_name_idx";

-- Rename indexes on book_alias_packs
ALTER INDEX IF EXISTS "book_knowledge_pack_unique" RENAME TO "book_alias_pack_unique";
ALTER INDEX IF EXISTS "book_knowledge_packs_book_id_idx" RENAME TO "book_alias_packs_book_id_idx";

-- Rename indexes on surname_rules
ALTER INDEX IF EXISTS "surname_compound_priority_idx" RENAME TO "surname_rules_compound_priority_idx";
ALTER INDEX IF EXISTS "surname_active_idx"             RENAME TO "surname_rules_active_idx";

-- Rename indexes on generic_title_rules
ALTER INDEX IF EXISTS "generic_titles_tier_idx" RENAME TO "generic_title_rules_tier_idx";

-- =====================================================================
-- Phase 2: Field changes on existing tables
-- =====================================================================

-- book_types: drop preset_config
ALTER TABLE "book_types" DROP COLUMN IF EXISTS "preset_config";

-- generic_title_rules: replace exemptInGenres JSON with exemptInBookTypeIds String[]
ALTER TABLE "generic_title_rules" ADD COLUMN IF NOT EXISTS "exempt_in_book_type_ids" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "generic_title_rules" ADD COLUMN IF NOT EXISTS "tier_new" TEXT NOT NULL DEFAULT 'DEFAULT';
-- Copy tier
UPDATE "generic_title_rules" SET "tier_new" = "tier";
ALTER TABLE "generic_title_rules" DROP COLUMN "tier";
ALTER TABLE "generic_title_rules" RENAME COLUMN "tier_new" TO "tier";
-- Drop old JSON column
ALTER TABLE "generic_title_rules" DROP COLUMN IF EXISTS "exempt_in_genres";

-- historical_figure_entries: swap isVerified for reviewStatus/source/reviewNote/reviewedAt/isActive
ALTER TABLE "historical_figure_entries" ADD COLUMN IF NOT EXISTS "source"        TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "historical_figure_entries" ADD COLUMN IF NOT EXISTS "review_status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "historical_figure_entries" ADD COLUMN IF NOT EXISTS "review_note"   TEXT;
ALTER TABLE "historical_figure_entries" ADD COLUMN IF NOT EXISTS "reviewed_at"   TIMESTAMPTZ(6);
ALTER TABLE "historical_figure_entries" ADD COLUMN IF NOT EXISTS "is_active"     BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "historical_figure_entries" ADD COLUMN IF NOT EXISTS "updated_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now();
-- Migrate isVerified → reviewStatus
UPDATE "historical_figure_entries" SET "review_status" = 'VERIFIED' WHERE "is_verified" = true;
UPDATE "historical_figure_entries" SET "review_status" = 'PENDING'  WHERE "is_verified" = false;
ALTER TABLE "historical_figure_entries" DROP COLUMN "is_verified";
DROP INDEX IF EXISTS "historical_figure_entries_category_verified_idx";
CREATE INDEX "historical_figure_entries_category_review_idx" ON "historical_figure_entries"("category", "review_status");

-- name_pattern_rules: same swap
ALTER TABLE "name_pattern_rules" ADD COLUMN IF NOT EXISTS "source"        TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "name_pattern_rules" ADD COLUMN IF NOT EXISTS "review_status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "name_pattern_rules" ADD COLUMN IF NOT EXISTS "review_note"   TEXT;
ALTER TABLE "name_pattern_rules" ADD COLUMN IF NOT EXISTS "is_active"     BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "name_pattern_rules" ADD COLUMN IF NOT EXISTS "updated_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now();
UPDATE "name_pattern_rules" SET "review_status" = 'VERIFIED' WHERE "is_verified" = true;
UPDATE "name_pattern_rules" SET "review_status" = 'PENDING'  WHERE "is_verified" = false;
ALTER TABLE "name_pattern_rules" DROP COLUMN "is_verified";
DROP INDEX IF EXISTS "name_pattern_rules_type_verified_idx";
CREATE INDEX "name_pattern_rules_type_review_idx" ON "name_pattern_rules"("rule_type", "review_status");

-- =====================================================================
-- Phase 3: New tables
-- =====================================================================

CREATE TABLE "ner_lexicon_rules" (
  "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
  "rule_type"    TEXT        NOT NULL,
  "content"      TEXT        NOT NULL,
  "book_type_id" UUID,
  "sort_order"   INTEGER     NOT NULL DEFAULT 0,
  "is_active"    BOOLEAN     NOT NULL DEFAULT true,
  "source"       TEXT        NOT NULL DEFAULT 'MANUAL',
  "change_note"  TEXT,
  "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "ner_lexicon_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ner_lexicon_rules_book_type_id_fkey"
    FOREIGN KEY ("book_type_id") REFERENCES "book_types"("id") ON DELETE SET NULL
);
CREATE INDEX "ner_lexicon_rules_type_active_idx" ON "ner_lexicon_rules"("rule_type", "is_active", "sort_order");
CREATE INDEX "ner_lexicon_rules_book_type_idx"   ON "ner_lexicon_rules"("book_type_id");

CREATE TABLE "prompt_extraction_rules" (
  "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
  "rule_type"    TEXT        NOT NULL,
  "content"      TEXT        NOT NULL,
  "book_type_id" UUID,
  "sort_order"   INTEGER     NOT NULL DEFAULT 0,
  "is_active"    BOOLEAN     NOT NULL DEFAULT true,
  "source"       TEXT        NOT NULL DEFAULT 'MANUAL',
  "change_note"  TEXT,
  "created_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at"   TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "prompt_extraction_rules_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "prompt_extraction_rules_book_type_id_fkey"
    FOREIGN KEY ("book_type_id") REFERENCES "book_types"("id") ON DELETE SET NULL
);
CREATE INDEX "prompt_extraction_rules_type_active_idx" ON "prompt_extraction_rules"("rule_type", "is_active", "sort_order");
CREATE INDEX "prompt_extraction_rules_book_type_idx"   ON "prompt_extraction_rules"("book_type_id");

-- =====================================================================
-- Phase 4: PromptTemplate / PromptTemplateVersion changes
-- =====================================================================

-- PromptTemplateVersion: add book_type_id, isActive; drop genre_key
ALTER TABLE "prompt_template_versions" ADD COLUMN IF NOT EXISTS "book_type_id" UUID;
ALTER TABLE "prompt_template_versions" ADD COLUMN IF NOT EXISTS "is_active"    BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "prompt_template_versions" ADD CONSTRAINT "prompt_template_versions_book_type_id_fkey"
  FOREIGN KEY ("book_type_id") REFERENCES "book_types"("id") ON DELETE SET NULL;

-- Migrate genreKey → bookTypeId (lookup by key)
UPDATE "prompt_template_versions" ptv
SET "book_type_id" = bt.id
FROM "book_types" bt
WHERE ptv.genre_key = bt.key AND ptv.genre_key IS NOT NULL;

-- Migrate activeVersionId → isActive on version rows
UPDATE "prompt_template_versions" ptv
SET "is_active" = true
FROM "prompt_templates" pt
WHERE pt."active_version_id" = ptv.id;

ALTER TABLE "prompt_template_versions" DROP COLUMN IF EXISTS "genre_key";
ALTER TABLE "prompt_templates"         DROP COLUMN IF EXISTS "active_version_id";

CREATE INDEX "prompt_versions_template_active_idx"    ON "prompt_template_versions"("template_id", "is_active");
CREATE INDEX "prompt_versions_template_booktype_idx"  ON "prompt_template_versions"("template_id", "book_type_id");

-- =====================================================================
-- Phase 5: Migrate data from extraction_rules to new tables
-- =====================================================================

-- NER lexicon rules (SUFFIX/STEM types)
INSERT INTO "ner_lexicon_rules" ("id", "rule_type", "content", "book_type_id", "sort_order", "is_active", "change_note", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  er.rule_type,
  er.content,
  bt.id,                      -- lookup BookType.id from genreKey
  er.sort_order,
  er.is_active,
  er.change_note,
  er.created_at,
  er.updated_at
FROM "extraction_rules" er
LEFT JOIN "book_types" bt ON bt.key = er.genre_key
WHERE er.rule_type IN ('HARD_BLOCK_SUFFIX','SOFT_BLOCK_SUFFIX','TITLE_STEM','POSITION_STEM');

-- Prompt extraction rules (ENTITY/RELATIONSHIP types)
INSERT INTO "prompt_extraction_rules" ("id", "rule_type", "content", "book_type_id", "sort_order", "is_active", "change_note", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  er.rule_type,
  er.content,
  bt.id,
  er.sort_order,
  er.is_active,
  er.change_note,
  er.created_at,
  er.updated_at
FROM "extraction_rules" er
LEFT JOIN "book_types" bt ON bt.key = er.genre_key
WHERE er.rule_type IN ('ENTITY','RELATIONSHIP');

-- =====================================================================
-- Phase 6: Migrate relational_term_entries → generic_title_rules
-- =====================================================================

INSERT INTO "generic_title_rules" ("id", "title", "tier", "category", "is_active", "source", "created_at", "updated_at")
SELECT
  gen_random_uuid(),
  rte.term,
  'RELATIONAL',
  rte.category,
  true,
  'IMPORTED',
  rte.created_at,
  now()
FROM "relational_term_entries" rte
ON CONFLICT ("title") DO UPDATE SET "tier" = 'RELATIONAL';

-- =====================================================================
-- Phase 7: Rename scope values in alias_packs
-- =====================================================================

UPDATE "alias_packs" SET scope = 'BOOK_TYPE' WHERE scope = 'GENRE';

-- =====================================================================
-- Phase 8: Drop old tables (after code migration is complete)
-- Run this block ONLY after Task 5 (service layer) is verified
-- =====================================================================

-- DROP TABLE "extraction_rules";
-- DROP TABLE "relational_term_entries";
```

> **Note:** The final DROP TABLE block is commented out intentionally. Run it manually after Task 5 confirms service layer compiles and tests pass.

- [ ] **Step 3: Apply migration**

```bash
cd /home/mwjz/code/wen-yuan
pnpm prisma migrate dev
```

Expected: Migration applied successfully, no errors.

- [ ] **Step 4: Regenerate Prisma client**

```bash
pnpm prisma:generate
```

Expected: Client generated to `src/generated/prisma/`, no TypeScript errors in generation.

- [ ] **Step 5: Check for TypeScript errors from schema changes**

```bash
pnpm type-check 2>&1 | head -60
```

Expected: Errors about old model names (`knowledgePack`, `surnameEntry`, etc.) — these will be fixed in Tasks 3-5.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: kb schema refactor — rename tables, split ExtractionRule, add NerLexiconRule/PromptExtractionRule"
```

---

## Task 3: Update load-book-knowledge.ts

**Files:**
- Modify: `src/server/modules/knowledge/load-book-knowledge.ts`

`load-book-knowledge.ts` is the runtime bridge between DB and the analysis pipeline. It loads all knowledge at task start. This task updates all Prisma model references.

- [ ] **Step 1: Update loadRuntimeLexiconPayload — replace extractionRule with nerLexiconRule**

Find `loadRuntimeLexiconPayload` (line ~141). Replace the `extractionRules` query:

```typescript
// OLD:
prisma.extractionRule.findMany({
  where: {
    isActive: true,
    OR: [
      { genreKey: null },
      ...(bookTypeKey ? [{ genreKey: bookTypeKey }] : [])
    ]
  },
  orderBy: [{ ruleType: "asc" }, { sortOrder: "asc" }],
  select : { ruleType: true, content: true }
})

// NEW:
prisma.nerLexiconRule.findMany({
  where: {
    isActive: true,
    OR: [
      { bookTypeId: null },
      ...(bookTypeKey ? [{ bookType: { key: bookTypeKey } }] : [])
    ]
  },
  orderBy: [{ ruleType: "asc" }, { sortOrder: "asc" }],
  select : { ruleType: true, content: true }
})
```

- [ ] **Step 2: Update loadRuntimeLexiconPayload — replace surnameEntry**

```typescript
// OLD:
prisma.surnameEntry.findMany({
  where: {
    isActive: true,
    OR: [
      { bookTypeId: null },
      ...(bookTypeKey ? [{ bookType: { key: bookTypeKey } }] : [])
    ]
  },
  orderBy: [{ isCompound: "desc" }, { priority: "desc" }, { surname: "asc" }],
  select : { surname: true, isCompound: true }
})

// NEW:
prisma.surnameRule.findMany({
  where: {
    isActive: true,
    OR: [
      { bookTypeId: null },
      ...(bookTypeKey ? [{ bookType: { key: bookTypeKey } }] : [])
    ]
  },
  orderBy: [{ isCompound: "desc" }, { priority: "desc" }, { surname: "asc" }],
  select : { surname: true, isCompound: true }
})
```

- [ ] **Step 3: Update loadRuntimeLexiconPayload — replace genericTitleEntry**

```typescript
// OLD:
prisma.genericTitleEntry.findMany({
  where  : { isActive: true },
  orderBy: [{ tier: "asc" }, { title: "asc" }],
  select : { title: true, tier: true }
})

// NEW:
prisma.genericTitleRule.findMany({
  where  : { isActive: true },
  orderBy: [{ tier: "asc" }, { title: "asc" }],
  select : { title: true, tier: true }
})
```

- [ ] **Step 4: Update buildRuntimeLexiconConfig — handle RELATIONAL tier**

In `buildRuntimeLexiconConfig`, the `genericTitles` filtering now has three tiers. Replace the SAFETY/DEFAULT filter blocks and add RELATIONAL:

```typescript
const safetyGenericTitles = toUniqueList(payload.genericTitles
  .filter((item) => item.tier === "SAFETY")
  .map((item) => item.title));

const defaultGenericTitles = toUniqueList(payload.genericTitles
  .filter((item) => item.tier === "DEFAULT")
  .map((item) => item.title));

// NEW: relational terms now come from genericTitles with tier=RELATIONAL
const relationalTermTitles = toUniqueList(payload.genericTitles
  .filter((item) => item.tier === "RELATIONAL")
  .map((item) => item.title));
```

- [ ] **Step 5: Update RuntimeLexiconPayload and RuntimeLexiconBuildResult types**

In `RuntimeLexiconPayload`:
```typescript
interface RuntimeLexiconPayload {
  baseConfig     : BookLexiconConfig;
  genericTitles  : Array<{ title: string; tier: string }>;
  surnames       : Array<{ surname: string; isCompound: boolean }>;
  extractionRules: Array<{ ruleType: string; content: string }>;
}
```

The `extractionRules` field name stays but now loads from `nerLexiconRule` (already done in Step 1).

In `RuntimeLexiconBuildResult`, add `relationalTermTitles`:
```typescript
interface RuntimeLexiconBuildResult {
  lexiconConfig        : BookLexiconConfig;
  safetyGenericTitles  : string[];
  defaultGenericTitles : string[];
  relationalTermTitles : string[];   // NEW
  hardBlockSuffixes    : string[];
  softBlockSuffixes    : string[];
  titleStems           : string[];
  positionStems        : string[];
}
```

- [ ] **Step 6: Update loadFullRuntimeKnowledge — replace relationalTermEntry query with GenericTitleRule RELATIONAL**

In `loadFullRuntimeKnowledge`, find:
```typescript
prisma.relationalTermEntry.findMany({
  where : { isVerified: true },
  select: { term: true }
})
```

Delete this query from the `Promise.all`. The relational terms are now in `runtimeLexiconPayload.genericTitles` (tier=RELATIONAL), so load them from there after `buildRuntimeLexiconConfig`:

```typescript
// After: const runtimeLexicon = buildRuntimeLexiconConfig(runtimeLexiconPayload);
const relationalTerms = new Set(toUniqueList(
  runtimeLexicon.relationalTermTitles.map(normalizeLookupValue)
));
```

Remove the old `relationalTermEntries` variable and its `new Set(...)` construction.

- [ ] **Step 7: Update loadFullRuntimeKnowledge — replace historicalFigureEntry query**

```typescript
// OLD:
prisma.historicalFigureEntry.findMany({
  where : { isVerified: true },
  ...
})

// NEW:
prisma.historicalFigureEntry.findMany({
  where : { reviewStatus: "VERIFIED", isActive: true },
  select: { id: true, name: true, aliases: true, dynasty: true, category: true, description: true }
})
```

- [ ] **Step 8: Update loadFullRuntimeKnowledge — replace namePatternRule query**

```typescript
// OLD:
prisma.namePatternRule.findMany({
  where  : { isVerified: true },
  ...
})

// NEW:
prisma.namePatternRule.findMany({
  where  : { reviewStatus: "VERIFIED", isActive: true },
  orderBy: [{ ruleType: "asc" }, { createdAt: "asc" }],
  select : { id: true, ruleType: true, action: true, pattern: true, description: true }
})
```

- [ ] **Step 9: Update buildAliasLookupFromDb — replace knowledgePack/knowledgeEntry/bookKnowledgePack**

```typescript
// OLD:
const bookPacks = await prisma.bookKnowledgePack.findMany({ ... })
const typePacks = await prisma.knowledgePack.findMany({
  where : { bookType: { key: bookTypeKey }, isActive: true, scope: "GENRE" },
  ...
})
const entries = await prisma.knowledgeEntry.findMany({
  where : { packId: { in: packIds }, reviewStatus: "VERIFIED" },
  ...
})

// NEW:
const bookPacks = await prisma.bookAliasPack.findMany({ ... })
const typePacks = await prisma.aliasPack.findMany({
  where : { bookType: { key: bookTypeKey }, isActive: true, scope: "BOOK_TYPE" },
  select: { id: true }
})
const entries = await prisma.aliasEntry.findMany({
  where : { packId: { in: packIds }, reviewStatus: "VERIFIED" },
  select: { packId: true, canonicalName: true, aliases: true, confidence: true }
})
```

- [ ] **Step 10: Update loadBookTypeConfig — no change needed** (uses `prisma.bookType` which is unchanged)

- [ ] **Step 11: Verify type-check passes for this file**

```bash
pnpm type-check 2>&1 | grep "load-book-knowledge"
```

Expected: No errors for this file.

- [ ] **Step 12: Run knowledge loader test**

```bash
npx vitest run src/server/modules/knowledge/load-book-knowledge.test.ts
```

Expected: All tests pass. If tests reference old model names (e.g., `relationalTermEntry`), update the mock setup in the test to use new names.

- [ ] **Step 13: Commit**

```bash
git add src/server/modules/knowledge/load-book-knowledge.ts
git commit -m "feat: update load-book-knowledge to use new schema model names"
```

---

## Task 4: Update Knowledge Service Files

**Files:**
- Modify: `src/server/modules/knowledge/surnames.ts`
- Modify: `src/server/modules/knowledge/generic-titles.ts`
- Modify: `src/server/modules/knowledge/extraction-rules.ts`
- Create: `src/server/modules/knowledge/ner-lexicon-rules.ts`
- Create: `src/server/modules/knowledge/prompt-extraction-rules.ts`
- Modify: `src/server/modules/knowledge/knowledge-packs.ts`
- Modify: `src/server/modules/knowledge/knowledge-entries.ts`
- Modify: `src/server/modules/knowledge/book-knowledge-packs.ts`
- Modify: `src/server/modules/knowledge/index.ts`

- [ ] **Step 1: Update surnames.ts** — replace all `surnameEntry` → `surnameRule`

In `src/server/modules/knowledge/surnames.ts`, do a global replace:
- `prisma.surnameEntry` → `prisma.surnameRule`
- `Prisma.SurnameEntryWhereInput` → `Prisma.SurnameRuleWhereInput`
- Any function parameter types using `SurnameEntry` → `SurnameRule`

- [ ] **Step 2: Update generic-titles.ts** — replace `genericTitleEntry` → `genericTitleRule`, add RELATIONAL support

In `src/server/modules/knowledge/generic-titles.ts`, do a global replace:
- `prisma.genericTitleEntry` → `prisma.genericTitleRule`
- `Prisma.GenericTitleEntryWhereInput` → `Prisma.GenericTitleRuleWhereInput`
- In create/update data, replace `exemptInGenres` with `exemptInBookTypeIds` (String[] of UUIDs, not JSON)
- The tier field now accepts `"SAFETY" | "DEFAULT" | "RELATIONAL"`

- [ ] **Step 3: Create ner-lexicon-rules.ts**

Create `src/server/modules/knowledge/ner-lexicon-rules.ts`:

```typescript
import { type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

export async function listNerLexiconRules(params?: {
  ruleType?  : string;
  bookTypeId?: string;
  active?    : boolean;
}) {
  const where: Prisma.NerLexiconRuleWhereInput = {};
  if (params?.ruleType)   where.ruleType   = params.ruleType;
  if (params?.bookTypeId) where.bookTypeId = params.bookTypeId;
  if (params?.active !== undefined) where.isActive = params.active;

  return prisma.nerLexiconRule.findMany({
    where,
    orderBy: [{ ruleType: "asc" }, { sortOrder: "asc" }]
  });
}

export async function createNerLexiconRule(data: {
  ruleType   : string;
  content    : string;
  bookTypeId?: string;
  sortOrder? : number;
  changeNote?: string;
}) {
  return prisma.nerLexiconRule.create({
    data: {
      ruleType  : data.ruleType,
      content   : data.content,
      bookTypeId: data.bookTypeId,
      sortOrder : data.sortOrder ?? 0,
      changeNote: data.changeNote
    }
  });
}

export async function updateNerLexiconRule(
  id: string,
  data: {
    content?   : string;
    bookTypeId?: string | null;
    sortOrder? : number;
    isActive?  : boolean;
    changeNote?: string;
  }
) {
  return prisma.nerLexiconRule.update({
    where: { id },
    data : {
      ...(data.content    !== undefined && { content    : data.content }),
      ...(data.bookTypeId !== undefined && { bookTypeId : data.bookTypeId }),
      ...(data.sortOrder  !== undefined && { sortOrder  : data.sortOrder }),
      ...(data.isActive   !== undefined && { isActive   : data.isActive }),
      ...(data.changeNote !== undefined && { changeNote : data.changeNote })
    }
  });
}

export async function deleteNerLexiconRule(id: string) {
  return prisma.nerLexiconRule.delete({ where: { id } });
}
```

- [ ] **Step 4: Create prompt-extraction-rules.ts**

Create `src/server/modules/knowledge/prompt-extraction-rules.ts`:

```typescript
import { type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

export async function listPromptExtractionRules(params?: {
  ruleType?  : string;
  bookTypeId?: string;
  active?    : boolean;
}) {
  const where: Prisma.PromptExtractionRuleWhereInput = {};
  if (params?.ruleType)   where.ruleType   = params.ruleType;
  if (params?.bookTypeId) where.bookTypeId = params.bookTypeId;
  if (params?.active !== undefined) where.isActive = params.active;

  return prisma.promptExtractionRule.findMany({
    where,
    orderBy: [{ ruleType: "asc" }, { sortOrder: "asc" }]
  });
}

export async function createPromptExtractionRule(data: {
  ruleType   : string;
  content    : string;
  bookTypeId?: string;
  sortOrder? : number;
  changeNote?: string;
}) {
  return prisma.promptExtractionRule.create({
    data: {
      ruleType  : data.ruleType,
      content   : data.content,
      bookTypeId: data.bookTypeId,
      sortOrder : data.sortOrder ?? 0,
      changeNote: data.changeNote
    }
  });
}

export async function updatePromptExtractionRule(
  id: string,
  data: {
    content?   : string;
    bookTypeId?: string | null;
    sortOrder? : number;
    isActive?  : boolean;
    changeNote?: string;
  }
) {
  return prisma.promptExtractionRule.update({
    where: { id },
    data : {
      ...(data.content    !== undefined && { content    : data.content }),
      ...(data.bookTypeId !== undefined && { bookTypeId : data.bookTypeId }),
      ...(data.sortOrder  !== undefined && { sortOrder  : data.sortOrder }),
      ...(data.isActive   !== undefined && { isActive   : data.isActive }),
      ...(data.changeNote !== undefined && { changeNote : data.changeNote })
    }
  });
}

export async function deletePromptExtractionRule(id: string) {
  return prisma.promptExtractionRule.delete({ where: { id } });
}
```

- [ ] **Step 5: Update knowledge-packs.ts** — replace `knowledgePack` → `aliasPack`

In `src/server/modules/knowledge/knowledge-packs.ts`, do a global replace:
- `prisma.knowledgePack` → `prisma.aliasPack`
- `Prisma.KnowledgePackWhereInput` → `Prisma.AliasPackWhereInput`
- scope value `"GENRE"` → `"BOOK_TYPE"` in any hardcoded scope filters

- [ ] **Step 6: Update knowledge-entries.ts** — replace `knowledgeEntry` → `aliasEntry`

In `src/server/modules/knowledge/knowledge-entries.ts`, do a global replace:
- `prisma.knowledgeEntry` → `prisma.aliasEntry`
- `Prisma.KnowledgeEntryWhereInput` → `Prisma.AliasEntryWhereInput`

- [ ] **Step 7: Update book-knowledge-packs.ts** — replace `bookKnowledgePack` → `bookAliasPack`, `knowledgePack` → `aliasPack`

Do a global replace in `src/server/modules/knowledge/book-knowledge-packs.ts`.

- [ ] **Step 8: Update index.ts exports**

In `src/server/modules/knowledge/index.ts`, update exports:
- Add exports from `ner-lexicon-rules.ts`
- Add exports from `prompt-extraction-rules.ts`
- Keep existing exports (renamed functions will compile after Steps 1-7)

- [ ] **Step 9: Run type-check for knowledge module**

```bash
pnpm type-check 2>&1 | grep "modules/knowledge"
```

Expected: Zero errors for `modules/knowledge`.

- [ ] **Step 10: Run knowledge module tests**

```bash
npx vitest run src/server/modules/knowledge/
```

Expected: All tests pass. Update test mocks for renamed models if needed.

- [ ] **Step 11: Commit**

```bash
git add src/server/modules/knowledge/
git commit -m "feat: update knowledge service layer — new model names, NerLexiconRule/PromptExtractionRule services"
```

---

## Task 5: Update API Routes

**Files:** All `src/app/api/admin/knowledge/**/*.ts`

- [ ] **Step 1: Update ner-rules API routes** — `extractionRule` → `nerLexiconRule`

In `src/app/api/admin/knowledge/ner-rules/route.ts` and `ner-rules/[id]/route.ts`:
- Replace all `prisma.extractionRule` → `prisma.nerLexiconRule`
- Replace `genreKey` parameter handling with `bookTypeId` (look up BookType by key if frontend sends a key string)
- Replace `Prisma.ExtractionRuleWhereInput` → `Prisma.NerLexiconRuleWhereInput`

- [ ] **Step 2: Update relational-terms API routes** — `relationalTermEntry` → `genericTitleRule` with `tier="RELATIONAL"`

In `src/app/api/admin/knowledge/relational-terms/route.ts`:

```typescript
// GET: add tier=RELATIONAL filter
const where: Record<string, unknown> = { tier: "RELATIONAL" };
if (category) where.category = category;
if (q) where.title = { contains: q, mode: "insensitive" };

const [data, total] = await Promise.all([
  prisma.genericTitleRule.findMany({
    where,
    skip   : (page - 1) * pageSize,
    take   : pageSize,
    orderBy: { createdAt: "desc" }
  }),
  prisma.genericTitleRule.count({ where })
]);

// POST: force tier=RELATIONAL
const data = await prisma.genericTitleRule.create({
  data: { ...parsed.data, tier: "RELATIONAL" }
});
```

In `src/app/api/admin/knowledge/relational-terms/[id]/route.ts`:
- Update `PUT` and `DELETE` to use `prisma.genericTitleRule`
- Add guard: `if (existing.tier !== "RELATIONAL") return 404`

Update the Zod schema in both files:
```typescript
const createSchema = z.object({
  title    : z.string().trim().min(1).max(20),   // was "term"
  category : z.enum(["KINSHIP", "SOCIAL", "GENERIC_ROLE"]),
  isActive : z.boolean().optional()
});
```

- [ ] **Step 3: Update title-filters API routes** — `genericTitleEntry` → `genericTitleRule`

In `src/app/api/admin/knowledge/title-filters/route.ts` and `[id]/route.ts`:
- Replace `prisma.genericTitleEntry` → `prisma.genericTitleRule`
- Update exempt field: `exemptInGenres` → `exemptInBookTypeIds`
- The Zod schema should accept `tier: z.enum(["SAFETY","DEFAULT","RELATIONAL"]).optional()`

- [ ] **Step 4: Update surnames API routes** — `surnameEntry` → `surnameRule`

In `src/app/api/admin/knowledge/surnames/route.ts` and `[id]/route.ts`:
- Replace `prisma.surnameEntry` → `prisma.surnameRule`

- [ ] **Step 5: Update alias-packs API routes** — `knowledgePack` → `aliasPack`

In all `src/app/api/admin/knowledge/alias-packs/**/*.ts`:
- Replace `prisma.knowledgePack` → `prisma.aliasPack`
- scope filter: `"GENRE"` → `"BOOK_TYPE"`

- [ ] **Step 6: Update books/[bookId]/knowledge-packs route** — `bookKnowledgePack` → `bookAliasPack`

In `src/app/api/admin/knowledge/books/[bookId]/knowledge-packs/route.ts`:
- Replace `prisma.bookKnowledgePack` → `prisma.bookAliasPack`

- [ ] **Step 7: Update prompt-templates activate route** — remove activeVersionId logic

In `src/app/api/admin/knowledge/prompt-templates/[slug]/activate/[versionId]/route.ts`:

```typescript
// OLD: set activeVersionId on template + maybe set old version inactive
// NEW: set isActive=true on target version, set isActive=false on previously active versions

await prisma.$transaction(async (tx) => {
  // Deactivate all versions for this template (+ optional bookTypeId scope)
  await tx.promptTemplateVersion.updateMany({
    where: { templateId: template.id, isActive: true },
    data : { isActive: false }
  });
  // Activate the requested version
  await tx.promptTemplateVersion.update({
    where: { id: versionId },
    data : { isActive: true }
  });
});
```

- [ ] **Step 8: Run full type-check**

```bash
pnpm type-check 2>&1 | head -80
```

Expected: Errors should be only in files not yet updated (if any). Knowledge and API routes: zero errors.

- [ ] **Step 9: Run lint**

```bash
pnpm lint 2>&1 | head -40
```

Fix any lint errors before proceeding.

- [ ] **Step 10: Drop old tables** (run the commented-out SQL from Task 2)

```bash
cd /home/mwjz/code/wen-yuan
psql "$DATABASE_URL" -c 'DROP TABLE IF EXISTS "extraction_rules"; DROP TABLE IF EXISTS "relational_term_entries";'
```

Expected: Tables dropped successfully.

- [ ] **Step 11: Commit**

```bash
git add src/app/api/admin/knowledge/
git commit -m "feat: update admin knowledge API routes to use new schema models"
```

---

## Task 6: Fix S1 — AliasRegistry Expansion

**Files:**
- Modify: `src/server/modules/analysis/services/PersonaResolver.ts`
- Modify: `src/server/modules/analysis/services/PersonaResolver.test.ts`

The AliasRegistry currently produces 0 records because `registerAlias` is only called for `TITLE_ONLY` names or when title/position patterns match. Fix: register all resolved aliases where `extractedName ≠ canonicalName`.

- [ ] **Step 1: Write the failing test**

In `PersonaResolver.test.ts`, add a test that verifies `registerAlias` is called when extractedName differs from the resolved canonicalName:

```typescript
it("should register alias when extractedName differs from resolved canonicalName", async () => {
  const mockAliasRegistry = {
    lookupAlias  : vi.fn().mockResolvedValue(null),
    registerAlias: vi.fn().mockResolvedValue(undefined)
  };
  const resolver = createPersonaResolver(mockPrisma, mockAliasRegistry);

  // Setup: "范举人" resolves to existing persona "范进" (via roster map)
  mockPrisma.persona.findUnique.mockResolvedValue({ name: "范进", aliases: ["范进"] });
  mockPrisma.profile.upsert.mockResolvedValue({});

  await resolver.resolve({
    extractedName   : "范举人",
    bookId          : "book-1",
    chapterNo       : 5,
    chapterContent  : "范举人走进来说",
    lexiconConfig   : {},
    rosterMap       : new Map([["范举人", "persona-fan-jin-id"]]),
    runtimeKnowledge: mockRuntimeKnowledge
  });

  // Should have called registerAlias since "范举人" ≠ "范进"
  expect(mockAliasRegistry.registerAlias).toHaveBeenCalledWith(
    expect.objectContaining({
      bookId: "book-1",
      alias : "范举人"
    }),
    expect.anything()
  );
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/server/modules/analysis/services/PersonaResolver.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — `registerAlias` was not called.

- [ ] **Step 3: Fix the registerAlias condition in PersonaResolver.ts**

Find the current alias registration block (lines ~695-719):

```typescript
// OLD condition:
if (
  aliasRegistry &&
  (
    nameType === NameType.TITLE_ONLY ||
    effectiveLexicon.positionPattern.test(input.extractedName) ||
    effectiveLexicon.titlePattern.test(input.extractedName)
  )
) {
  // ... registerAlias call
}
```

Replace with the new broader condition. This block should be in the "similarity resolved" branch AND in the "roster resolved" branch. Add the registration logic to the roster-hit return path:

In the similarity-resolved branch (after `winner.score >= personaResolveMinScore`), add before `return`:

```typescript
// Fix S1: 有效别名自动注册 — 不局限于 TITLE_ONLY
if (
  aliasRegistry &&
  input.chapterNo !== undefined &&
  rawName !== normalizeName(winner.candidate.name) &&
  rawName.length >= 2
) {
  const aliasType = inferAliasType(rawName, effectiveLexicon.titlePattern, effectiveLexicon.positionPattern);
  await aliasRegistry.registerAlias({
    bookId      : input.bookId,
    personaId   : winner.candidate.id,
    alias       : input.extractedName,
    resolvedName: winner.candidate.name,
    aliasType,
    confidence  : winner.score,
    evidence    : "相似度命中自动注册",
    chapterStart: input.chapterNo,
    status      : winner.score >= 0.9 ? "CONFIRMED" : "PENDING"
  }, client);
}
```

Also, in the roster-hit branch (after `profile.upsert` in the rosterValue path), add the same registration:

```typescript
// Fix S1: roster 命中时同步注册别名
if (
  aliasRegistry &&
  input.chapterNo !== undefined &&
  rawName !== normalizeName(targetPersona.name) &&
  rawName.length >= 2
) {
  const aliasType = inferAliasType(rawName, effectiveLexicon.titlePattern, effectiveLexicon.positionPattern);
  await aliasRegistry.registerAlias({
    bookId      : input.bookId,
    personaId   : rosterValue,
    alias       : input.extractedName,
    resolvedName: targetPersona.name,
    aliasType,
    confidence  : 0.97,
    evidence    : "名册命中自动注册",
    chapterStart: input.chapterNo,
    status      : "CONFIRMED"
  }, client);
}
```

Keep the old TITLE_ONLY registration block in the `created` (new persona) path — it's still correct for new personas.

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx vitest run src/server/modules/analysis/services/PersonaResolver.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/modules/analysis/services/PersonaResolver.ts \
        src/server/modules/analysis/services/PersonaResolver.test.ts
git commit -m "fix: S1 expand AliasRegistry registration to all resolved aliases"
```

---

## Task 7: Fix S2 — Short Chinese Name Guard in scorePair

**Files:**
- Modify: `src/server/modules/analysis/services/PersonaResolver.ts`
- Modify: `src/server/modules/analysis/services/PersonaResolver.test.ts`

Two 2-character Chinese names with different surnames were being scored ≥ 0.72 via Jaccard similarity, causing wrong merges.

- [ ] **Step 1: Write the failing tests**

In `PersonaResolver.test.ts`, add tests for `scorePair` (it's exported via `calculateSubstringMatchScore`; test the full scoring logic via the resolver or by calling `scorePair` directly if you export it):

```typescript
describe("guardShortChineseName", () => {
  it("should cap score at 0.30 when two 2-char names have different first character", () => {
    // "向鼎" vs "董知县" — different surnames
    const score = scorePair("向鼎", "董知", new Set(), new Set());
    expect(score).toBeLessThan(0.31);
  });

  it("should cap score at 0.50 when same surname but second char different", () => {
    // "杜倩" vs "杜慎" — same surname, second char different, no substring
    const score = scorePair("杜倩", "杜慎", new Set(), new Set());
    expect(score).toBeLessThan(0.51);
  });

  it("should NOT cap score for same-surname with substring relationship", () => {
    // "范进" vs "范举人" — same surname, "范进" is not a substring of "范举人" but shares "范"
    // This should go through applySurnameTitleBoost, not be capped
    const score = scorePair("范进", "范举人", new Set(), new Set());
    expect(score).toBeGreaterThan(0.50);  // should not be hard-capped
  });

  it("should return 1.0 for identical names", () => {
    expect(scorePair("范进", "范进", new Set(), new Set())).toBe(1.0);
  });
});
```

Export `scorePair` for testing by adding `export` to its declaration in `PersonaResolver.ts`:
```typescript
export function scorePair(...)
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run src/server/modules/analysis/services/PersonaResolver.test.ts -t "guardShortChineseName" 2>&1 | tail -15
```

Expected: FAIL — first two tests pass unintentionally but the actual values are wrong; or the function isn't exported yet.

- [ ] **Step 3: Add guardShortChineseName function**

In `PersonaResolver.ts`, add this function before `scorePair`:

```typescript
/**
 * 短中文名相似度上限守卫。
 * 规则：
 *   R1: 两个 2 字名，首字（姓）不同 → 得分上限 0.30
 *   R2: 两个 2 字名，同姓但余字完全不同（无子串关系）→ 得分上限 0.50
 *   其他情况：无上限（返回 null）
 */
function guardShortChineseName(a: string, b: string): number | null {
  if (a.length !== 2 || b.length !== 2) return null;
  if (a[0] !== b[0]) return 0.30;          // R1: 不同姓
  if (a[1] !== b[1]) return 0.50;          // R2: 同姓，余字不同
  return null;                              // 完全相同 → 由 a===b 先处理
}
```

- [ ] **Step 4: Apply guard in scorePair**

In `scorePair`, add the guard check right after the `if (a === b) return 1.0` line:

```typescript
function scorePair(
  a: string,
  b: string,
  hardBlockSuffixes: Set<string>,
  softBlockSuffixes: Set<string>
): number {
  if (!a || !b) return 0;
  if (a === b)  return 1.0;

  // Fix S2: 短中文名防误合并守卫
  const cap = guardShortChineseName(a, b);
  if (cap !== null) return cap;

  // ... rest of function unchanged
```

- [ ] **Step 5: Run tests to confirm they pass**

```bash
npx vitest run src/server/modules/analysis/services/PersonaResolver.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/server/modules/analysis/services/PersonaResolver.ts \
        src/server/modules/analysis/services/PersonaResolver.test.ts
git commit -m "fix: S2 add short Chinese name guard in scorePair to prevent wrong merges"
```

---

## Task 8: Fix S3 — PostAnalysisMerger Tier 4

**Files:**
- Modify: `src/server/modules/analysis/services/PostAnalysisMerger.ts`
- Modify: `src/server/modules/analysis/services/PostAnalysisMerger.test.ts`

Add Tier 4: same surname + chapter co-occurrence ≥ 50% → confidence 0.80 PENDING.

- [ ] **Step 1: Write the failing test**

In `PostAnalysisMerger.test.ts`, add:

```typescript
it("Tier 4: generates PENDING suggestion for same-surname personas with ≥50% chapter co-occurrence", async () => {
  // Setup: two personas same surname "范", different names, appear in overlapping chapters
  const mockPersonas = [
    { id: "p1", name: "范进",  aliases: [], confidence: 0.8 },
    { id: "p2", name: "范举人", aliases: [], confidence: 0.6 }
  ];
  // p1 appears in chapters [1,2,3], p2 in chapters [2,3,4]
  // overlap = {2,3} = 2, min set size = 3 (p1), ratio = 2/3 = 0.67 ≥ 0.50
  mockPrisma.profile.findMany.mockResolvedValue([
    { personaId: "p1", localName: "范进",   persona: mockPersonas[0] },
    { personaId: "p2", localName: "范举人", persona: mockPersonas[1] }
  ]);
  mockPrisma.mention.findMany.mockResolvedValue([
    { personaId: "p1", chapter: { chapterNo: 1 } },
    { personaId: "p1", chapter: { chapterNo: 2 } },
    { personaId: "p1", chapter: { chapterNo: 3 } },
    { personaId: "p2", chapter: { chapterNo: 2 } },
    { personaId: "p2", chapter: { chapterNo: 3 } },
    { personaId: "p2", chapter: { chapterNo: 4 } }
  ]);
  mockPrisma.mergeSuggestion.findMany.mockResolvedValue([]);
  mockPrisma.mergeSuggestion.create.mockResolvedValue({});

  const result = await runPostAnalysisMerger(mockPrisma, {
    bookId          : "book-1",
    runtimeKnowledge: mockRuntimeKnowledge  // lexiconConfig with surname list
  });

  expect(result.created).toBeGreaterThanOrEqual(1);
  const call = mockPrisma.mergeSuggestion.create.mock.calls.find(
    (c: any[]) => c[0].data.confidence === 0.80
  );
  expect(call).toBeDefined();
  expect(call[0].data.status).toBe("PENDING");
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/server/modules/analysis/services/PostAnalysisMerger.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: FAIL — Tier 4 not yet implemented.

- [ ] **Step 3: Add Tier 4 to PostAnalysisMerger.ts**

After the `personas` array is built (line ~83), add a chapter co-occurrence lookup. Then add Tier 4 after the existing Tier 3 block.

First, load chapter appearances:

```typescript
// Load chapter appearances for Tier 4
const mentionsByPersona = new Map<string, Set<number>>();
if (personas.length >= 2) {
  const allMentions = await prisma.mention.findMany({
    where : { chapter: { bookId } },
    select: { personaId: true, chapter: { select: { chapterNo: true } } }
  });
  for (const m of allMentions) {
    const existing = mentionsByPersona.get(m.personaId) ?? new Set<number>();
    existing.add(m.chapter.chapterNo);
    mentionsByPersona.set(m.personaId, existing);
  }
}
```

Then add Tier 4 block after Tier 3:

```typescript
// ── Tier 4: 同姓 + 章节共现 ≥ 50% ──
// 纯规则，零 LLM 成本；同姓且出现章节高度重叠说明大概率是同一人的不同称谓。
for (let i = 0; i < personas.length; i++) {
  const a = personas[i];
  const surnameA = extractSurname(normalizeName(a.name));
  if (!surnameA) continue;
  const chaptersA = mentionsByPersona.get(a.id) ?? new Set<number>();
  if (chaptersA.size === 0) continue;

  for (let j = i + 1; j < personas.length; j++) {
    const b = personas[j];
    if (isPairExists(a.id, b.id)) continue;

    const surnameB = extractSurname(normalizeName(b.name));
    if (surnameA !== surnameB) continue;

    const chaptersB = mentionsByPersona.get(b.id) ?? new Set<number>();
    if (chaptersB.size === 0) continue;

    let overlap = 0;
    for (const ch of chaptersA) {
      if (chaptersB.has(ch)) overlap++;
    }
    const minSize = Math.min(chaptersA.size, chaptersB.size);
    if (overlap / minSize >= 0.5) {
      candidates.push({
        sourceId  : a.id,
        targetId  : b.id,
        confidence: 0.80,
        reason    : `同姓"${surnameA}"且章节共现率 ${Math.round(overlap / minSize * 100)}%: "${a.name}" / "${b.name}"`,
        tier      : 4
      });
    }
  }
}
```

Add the import for `extractSurname` at the top of the file:
```typescript
import { extractSurname } from "@/server/modules/analysis/config/lexicon";
```

The `extractSurname` call needs a lexiconConfig. Update the function signature to require `runtimeKnowledge` to provide lexiconConfig:

```typescript
// In the extractSurname call, pass lexiconConfig from runtimeKnowledge:
const surnameA = extractSurname(normalizeName(a.name), runtimeKnowledge?.lexiconConfig);
```

- [ ] **Step 4: Run test to confirm it passes**

```bash
npx vitest run src/server/modules/analysis/services/PostAnalysisMerger.test.ts --reporter=verbose 2>&1 | tail -20
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/modules/analysis/services/PostAnalysisMerger.ts \
        src/server/modules/analysis/services/PostAnalysisMerger.test.ts
git commit -m "feat: S3 add Tier 4 to PostAnalysisMerger — same-surname chapter co-occurrence"
```

---

## Task 9: Fix T1 — TwoPass Pass1 Filter

**Files:**
- Modify: `src/server/modules/analysis/pipelines/twopass/TwoPassPipeline.ts`

Pass 1 extracts entity names with no filtering, producing 600+ candidates. Add a post-extraction filter using `FullRuntimeKnowledge` — the same checks PersonaResolver does.

- [ ] **Step 1: Read TwoPassPipeline.ts to understand Pass1 call site**

```bash
grep -n "collectGlobalDictionary\|chapterEntities\|Pass 1\|pass1\|Pass1" \
  /home/mwjz/code/wen-yuan/src/server/modules/analysis/pipelines/twopass/TwoPassPipeline.ts | head -20
```

- [ ] **Step 2: Add filterPass1Candidates function to TwoPassPipeline.ts**

Add this function near the top of the file (after imports):

```typescript
/**
 * Fix T1: Pass 1 候选集过滤
 * 使用 FullRuntimeKnowledge 对 AI 提取的原始名字列表进行前置过滤，
 * 与 PersonaResolver 的过滤层对齐，防止泛称/关系词进入全局候选池。
 */
function filterPass1Candidates(
  rawNames: string[],
  runtimeKnowledge: FullRuntimeKnowledge
): string[] {
  return rawNames.filter((name) => {
    const raw = name.trim();
    if (raw.length < 2 || raw.length > 8)            return false;
    if (/[的之]/.test(raw) && raw.length >= 4)        return false;
    if (runtimeKnowledge.safetyGenericTitles.has(raw)) return false;
    if (runtimeKnowledge.relationalTerms.has(raw))     return false;
    for (const rule of runtimeKnowledge.namePatternRules) {
      if (rule.action === "BLOCK" && rule.compiled.test(raw)) return false;
    }
    // Historical figures: filter completely in Pass1 (no chapter content here)
    if (runtimeKnowledge.historicalFigures.has(raw))   return false;
    return true;
  });
}
```

- [ ] **Step 3: Apply filter after Pass1 extraction**

Find where `chapterEntities` is built from Pass1 AI output (look for the call to `collectGlobalDictionary` or where chapter entity lists are assembled). Before passing them to `buildCandidateGroups`, apply the filter:

```typescript
// After collecting all chapterEntityLists from Pass 1:
const filteredEntityLists = chapterEntityLists.map((cel) => ({
  ...cel,
  entities: cel.entities.filter((e) => {
    const filtered = filterPass1Candidates([e.name, ...e.aliases], runtimeKnowledge);
    return filtered.includes(e.name);   // keep entity if canonical name survives filter
  })
}));

// Use filteredEntityLists instead of chapterEntityLists for Pass2:
const globalDict = collectGlobalDictionary(filteredEntityLists);
```

- [ ] **Step 4: Verify TwoPass pipeline compiles**

```bash
pnpm type-check 2>&1 | grep "twopass"
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/server/modules/analysis/pipelines/twopass/TwoPassPipeline.ts
git commit -m "fix: T1 add Pass1 candidate filter in TwoPass pipeline"
```

---

## Task 10: Fix T2 — Remove Edit Distance from GlobalEntityResolver

**Files:**
- Modify: `src/server/modules/analysis/pipelines/twopass/GlobalEntityResolver.ts`

The Levenshtein edit-distance ≤ 1 condition causes random merges for 2-character Chinese names (any one character different = edit distance 1). Remove it entirely.

- [ ] **Step 1: Remove the edit distance loop from buildCandidateGroups**

In `GlobalEntityResolver.ts`, find the `buildCandidateGroups` function. Remove the entire edit-distance loop block:

```typescript
// DELETE this block (lines ~193-199):
for (let i = 0; i < keys.length; i += 1) {
  for (let j = i + 1; j < keys.length; j += 1) {
    if (editDistance(keys[i], keys[j]) <= EDIT_DISTANCE_THRESHOLD) {
      union(keys[i], keys[j]);
    }
  }
}
```

Also remove the `editDistance` function (lines ~62-82) and the `EDIT_DISTANCE_THRESHOLD` constant (line ~37) since they're no longer used.

- [ ] **Step 2: Verify the same-surname+alias-overlap condition remains intact**

The third union loop (same surname + allNames overlap) must still be present:

```typescript
for (let i = 0; i < keys.length; i += 1) {
  const infoI = dict.get(keys[i])!;
  const surnameI = extractSurname(infoI.canonicalName);
  if (!surnameI) continue;

  for (let j = i + 1; j < keys.length; j += 1) {
    const infoJ = dict.get(keys[j])!;
    const surnameJ = extractSurname(infoJ.canonicalName);
    if (surnameI !== surnameJ) continue;

    let hasOverlap = false;
    for (const nameI of infoI.allNames) {
      if (infoJ.allNames.has(nameI)) { hasOverlap = true; break; }
    }
    if (hasOverlap) union(keys[i], keys[j]);
  }
}
```

- [ ] **Step 3: Verify no TypeScript errors**

```bash
pnpm type-check 2>&1 | grep "GlobalEntityResolver"
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add src/server/modules/analysis/pipelines/twopass/GlobalEntityResolver.ts
git commit -m "fix: T2 remove aggressive edit-distance grouping from GlobalEntityResolver"
```

---

## Task 11: Fix T3 — Narrow LLM Scope in GlobalEntityResolver

**Files:**
- Modify: `src/server/modules/analysis/pipelines/twopass/GlobalEntityResolver.ts`

Currently all candidate groups are sent to LLM. Narrow to only groups where rules are ambiguous.

- [ ] **Step 1: Add pre-filtering before LLM call**

In `GlobalEntityResolver.ts`, find where `resolveCandidateGroupsWithLLM` is called. Before that call, split groups into "rule-determined" and "send-to-LLM":

```typescript
/**
 * Fix T3: 规则可直接确定的组不送 LLM，降低成本。
 * 送 LLM 的条件（同时满足）：
 *   - 同姓 + 有 alias 重叠 + 未被 KB 覆盖
 *   - 组大小 ≤ 5（超过 5 说明可能是泛称漏网）
 */
function partitionGroupsForLlm(
  groups          : EntityCandidateGroup[],
  aliasLookup     : Map<string, string>
): {
  directMerge  : EntityCandidateGroup[];
  sendToLlm    : EntityCandidateGroup[];
  directNoMerge: EntityCandidateGroup[];
} {
  const directMerge   : EntityCandidateGroup[] = [];
  const sendToLlm     : EntityCandidateGroup[] = [];
  const directNoMerge : EntityCandidateGroup[] = [];

  for (const group of groups) {
    // Too large: likely a泛称 leakage
    if (group.members.length > 5) {
      directNoMerge.push(group);
      continue;
    }

    // KB alias covers it → direct merge
    const names = group.members.map((m) => normalizeKey(m.name));
    const allSameCanonical = names.every((n) => {
      const canon = aliasLookup.get(n);
      return canon !== undefined && canon === aliasLookup.get(names[0]);
    });
    if (allSameCanonical && aliasLookup.has(names[0])) {
      directMerge.push(group);
      continue;
    }

    // Normalized names all identical → direct merge
    const uniqueNormalized = new Set(names);
    if (uniqueNormalized.size === 1) {
      directMerge.push(group);
      continue;
    }

    // All same surname but zero alias overlap → direct no-merge
    const allNames = group.members.flatMap((m) => [m.name]);
    const allNamesSet = new Set(allNames.map(normalizeKey));
    const hasAliasOverlap = group.members.some((m) =>
      group.members.some((other) =>
        other !== m && allNamesSet.has(normalizeKey(m.name)) && allNamesSet.has(normalizeKey(other.name))
      )
    );
    // Simple check: same surname but members share no alias names
    const surnames = group.members.map((m) => extractSurname(m.name)).filter(Boolean);
    const allSameSurname = surnames.length === group.members.length &&
      new Set(surnames).size === 1;
    if (allSameSurname && !hasAliasOverlap) {
      directNoMerge.push(group);
      continue;
    }

    // Ambiguous: send to LLM
    sendToLlm.push(group);
  }

  return { directMerge, sendToLlm, directNoMerge };
}
```

- [ ] **Step 2: Apply the partitioning in the resolve flow**

Find where `resolveCandidateGroupsWithLLM(bookTitle, groups, ...)` is called. Replace with:

```typescript
const { directMerge, sendToLlm } = partitionGroupsForLlm(groups, runtimeKnowledge?.aliasLookup ?? new Map());

// Auto-merge rule-determined groups (no LLM)
for (const group of directMerge) {
  // The canonical name is the first member; merge all others into it
  // (existing mergeGroupIntoPersona logic — reuse same code path)
}

// Only send ambiguous groups to LLM
const llmDecisions = await resolveCandidateGroupsWithLLM(bookTitle, sendToLlm, stageContext);
```

- [ ] **Step 3: Verify LLM call count is logged**

Add a log line before the LLM call:

```typescript
console.info("[GlobalEntityResolver] llm.scope.narrowed", JSON.stringify({
  totalGroups  : groups.length,
  directMerge  : directMerge.length,
  sendToLlm    : sendToLlm.length,
  directNoMerge: (groups.length - directMerge.length - sendToLlm.length)
}));
```

- [ ] **Step 4: Verify type-check**

```bash
pnpm type-check 2>&1 | grep "GlobalEntityResolver"
```

Expected: No errors.

- [ ] **Step 5: Run full test suite**

```bash
pnpm test 2>&1 | tail -30
```

Expected: All tests pass, coverage thresholds met.

- [ ] **Step 6: Commit**

```bash
git add src/server/modules/analysis/pipelines/twopass/GlobalEntityResolver.ts
git commit -m "fix: T3 narrow LLM scope in GlobalEntityResolver — only send ambiguous groups"
```

---

## Task 12: Final Verification

- [ ] **Step 1: Full type-check**

```bash
pnpm type-check
```

Expected: Zero errors.

- [ ] **Step 2: Full lint**

```bash
pnpm lint
```

Expected: Zero errors.

- [ ] **Step 3: Full test suite with coverage**

```bash
pnpm test
```

Expected: All tests pass, coverage ≥ 90%.

- [ ] **Step 4: Drop old tables** (if not done in Task 5 Step 10)

```bash
psql "$DATABASE_URL" -c 'DROP TABLE IF EXISTS "extraction_rules"; DROP TABLE IF EXISTS "relational_term_entries";'
```

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete KB refactor + Sequential S1/S2/S3 + TwoPass T1/T2/T3 fixes"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] G1 (clear table responsibilities): Tasks 1-5 rename and split tables
- [x] G2 (unified review fields): Task 1 adds source/reviewStatus/reviewNote to HistoricalFigureEntry and NamePatternRule
- [x] G3 (presetConfig removed): Task 1 Step 1 removes it, Task 2 migrates data
- [x] G4 (Sequential 80-85%): Tasks 6+7+8 (S1+S2+S3)
- [x] G5 (TwoPass 88-92%): Tasks 9+10+11 (T1+T2+T3)
- [x] G6 (both architectures work): Each arch fixed independently

**Known dependencies:**
- Tasks 1→2→3→4→5 must run in order (each depends on Prisma client from previous)
- Tasks 6,7,8 are independent of each other (all depend on Task 5 completing)
- Tasks 9,10,11 are independent of each other and of Tasks 6-8
- Task 12 must be last
