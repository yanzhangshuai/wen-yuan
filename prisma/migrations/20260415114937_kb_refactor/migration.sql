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
ALTER INDEX IF EXISTS "book_knowledge_pack_unique"      RENAME TO "book_alias_pack_unique";
ALTER INDEX IF EXISTS "book_knowledge_packs_book_id_idx" RENAME TO "book_alias_packs_book_id_idx";

-- Rename indexes on surname_rules
ALTER INDEX IF EXISTS "surname_compound_priority_idx" RENAME TO "surname_rules_compound_priority_idx";
ALTER INDEX IF EXISTS "surname_active_idx"             RENAME TO "surname_rules_active_idx";

-- Rename indexes on generic_title_rules
ALTER INDEX IF EXISTS "generic_titles_tier_idx" RENAME TO "generic_title_rules_tier_idx";

-- Rename unique constraint on generic_title_rules
ALTER INDEX IF EXISTS "generic_title_entries_title_key" RENAME TO "generic_title_rules_title_key";

-- =====================================================================
-- Phase 2: Field changes on existing tables
-- =====================================================================

-- book_types: drop preset_config
ALTER TABLE "book_types" DROP COLUMN IF EXISTS "preset_config";

-- generic_title_rules: add exempt_in_book_type_ids (text[]), drop exempt_in_genres (jsonb)
ALTER TABLE "generic_title_rules" ADD COLUMN IF NOT EXISTS "exempt_in_book_type_ids" TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE "generic_title_rules" DROP COLUMN IF EXISTS "exempt_in_genres";

-- historical_figure_entries: swap is_verified for review_status/source/review_note/reviewed_at/is_active/updated_at
ALTER TABLE "historical_figure_entries" ADD COLUMN IF NOT EXISTS "source"        TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "historical_figure_entries" ADD COLUMN IF NOT EXISTS "review_status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "historical_figure_entries" ADD COLUMN IF NOT EXISTS "review_note"   TEXT;
ALTER TABLE "historical_figure_entries" ADD COLUMN IF NOT EXISTS "reviewed_at"   TIMESTAMPTZ(6);
ALTER TABLE "historical_figure_entries" ADD COLUMN IF NOT EXISTS "is_active"     BOOLEAN NOT NULL DEFAULT true;
-- Migrate is_verified → review_status
UPDATE "historical_figure_entries" SET "review_status" = 'VERIFIED' WHERE "is_verified" = true;
ALTER TABLE "historical_figure_entries" DROP COLUMN IF EXISTS "is_verified";
DROP INDEX IF EXISTS "historical_figure_entries_category_verified_idx";
CREATE INDEX IF NOT EXISTS "historical_figure_entries_category_review_idx" ON "historical_figure_entries"("category", "review_status");

-- name_pattern_rules: same swap, plus add updated_at
ALTER TABLE "name_pattern_rules" ADD COLUMN IF NOT EXISTS "source"        TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "name_pattern_rules" ADD COLUMN IF NOT EXISTS "review_status" TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "name_pattern_rules" ADD COLUMN IF NOT EXISTS "review_note"   TEXT;
ALTER TABLE "name_pattern_rules" ADD COLUMN IF NOT EXISTS "is_active"     BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "name_pattern_rules" ADD COLUMN IF NOT EXISTS "updated_at"    TIMESTAMPTZ(6) NOT NULL DEFAULT now();
UPDATE "name_pattern_rules" SET "review_status" = 'VERIFIED' WHERE "is_verified" = true;
ALTER TABLE "name_pattern_rules" DROP COLUMN IF EXISTS "is_verified";
DROP INDEX IF EXISTS "name_pattern_rules_type_verified_idx";
CREATE INDEX IF NOT EXISTS "name_pattern_rules_type_review_idx" ON "name_pattern_rules"("rule_type", "review_status");

-- =====================================================================
-- Phase 3: New tables
-- =====================================================================

CREATE TABLE IF NOT EXISTS "ner_lexicon_rules" (
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
CREATE INDEX IF NOT EXISTS "ner_lexicon_rules_type_active_idx" ON "ner_lexicon_rules"("rule_type", "is_active", "sort_order");
CREATE INDEX IF NOT EXISTS "ner_lexicon_rules_book_type_idx"   ON "ner_lexicon_rules"("book_type_id");

CREATE TABLE IF NOT EXISTS "prompt_extraction_rules" (
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
CREATE INDEX IF NOT EXISTS "prompt_extraction_rules_type_active_idx" ON "prompt_extraction_rules"("rule_type", "is_active", "sort_order");
CREATE INDEX IF NOT EXISTS "prompt_extraction_rules_book_type_idx"   ON "prompt_extraction_rules"("book_type_id");

-- =====================================================================
-- Phase 4: PromptTemplate / PromptTemplateVersion changes
-- =====================================================================

-- PromptTemplateVersion: rename versionNo → version_no
ALTER TABLE "prompt_template_versions" RENAME COLUMN "versionNo" TO "version_no";

-- Drop old unique constraint on (template_id, versionNo) and recreate with new name
ALTER INDEX IF EXISTS "prompt_version_unique" RENAME TO "prompt_template_versions_template_id_version_no_key";

-- PromptTemplateVersion: add book_type_id, is_active; drop genre_key
ALTER TABLE "prompt_template_versions" ADD COLUMN IF NOT EXISTS "book_type_id" UUID;
ALTER TABLE "prompt_template_versions" ADD COLUMN IF NOT EXISTS "is_active"    BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "prompt_template_versions" ADD CONSTRAINT "prompt_template_versions_book_type_id_fkey"
  FOREIGN KEY ("book_type_id") REFERENCES "book_types"("id") ON DELETE SET NULL
  NOT VALID;

-- Migrate genre_key → book_type_id
UPDATE "prompt_template_versions" ptv
SET "book_type_id" = bt.id
FROM "book_types" bt
WHERE ptv.genre_key = bt.key AND ptv.genre_key IS NOT NULL;

-- Migrate active_version_id → is_active on versions
UPDATE "prompt_template_versions" ptv
SET "is_active" = true
FROM "prompt_templates" pt
WHERE pt."active_version_id" = ptv.id;

ALTER TABLE "prompt_template_versions" DROP COLUMN IF EXISTS "genre_key";
ALTER TABLE "prompt_templates"         DROP COLUMN IF EXISTS "active_version_id";

CREATE INDEX IF NOT EXISTS "prompt_versions_template_active_idx"   ON "prompt_template_versions"("template_id", "is_active");
CREATE INDEX IF NOT EXISTS "prompt_versions_template_booktype_idx" ON "prompt_template_versions"("template_id", "book_type_id");

-- =====================================================================
-- Phase 5: Migrate data from extraction_rules to new tables
-- =====================================================================

INSERT INTO "ner_lexicon_rules" ("id", "rule_type", "content", "book_type_id", "sort_order", "is_active", "change_note", "created_at", "updated_at")
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
WHERE er.rule_type IN ('HARD_BLOCK_SUFFIX','SOFT_BLOCK_SUFFIX','TITLE_STEM','POSITION_STEM');

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

-- Add alias_entries canonical_name index (already exists as alias_entries_canonical_name_idx above via rename)
