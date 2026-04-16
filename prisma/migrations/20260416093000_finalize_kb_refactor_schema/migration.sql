-- Finalize the KB refactor schema after the main table split/rename migrations.
-- This replaces the earlier out-of-order local migration attempt and keeps the
-- change set replayable on fresh databases.

-- Drop legacy indexes / foreign keys that are no longer part of the final schema.
ALTER TABLE "ner_lexicon_rules" DROP CONSTRAINT IF EXISTS "ner_lexicon_rules_book_type_id_fkey";
ALTER TABLE "prompt_extraction_rules" DROP CONSTRAINT IF EXISTS "prompt_extraction_rules_book_type_id_fkey";
ALTER TABLE "prompt_template_versions" DROP CONSTRAINT IF EXISTS "prompt_template_versions_book_type_id_fkey";

DROP INDEX IF EXISTS "alias_entries_canonical_name_idx";
DROP INDEX IF EXISTS "alias_packs_scope_idx";
DROP INDEX IF EXISTS "prompt_versions_template_created_idx";

-- Remove obsolete columns and align defaults with the Prisma schema.
ALTER TABLE "alias_entries"
  DROP COLUMN IF EXISTS "entry_type",
  DROP COLUMN IF EXISTS "source_detail";

ALTER TABLE "alias_packs"
  ALTER COLUMN "scope" SET DEFAULT 'GLOBAL';

ALTER TABLE "name_pattern_rules"
  ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "ner_lexicon_rules"
  ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "updated_at" DROP DEFAULT;

ALTER TABLE "prompt_extraction_rules"
  ALTER COLUMN "id" DROP DEFAULT,
  ALTER COLUMN "updated_at" DROP DEFAULT;

DROP TABLE IF EXISTS "relational_term_entries";

CREATE INDEX IF NOT EXISTS "alias_packs_scope_is_active_idx"
  ON "alias_packs"("scope", "is_active");

-- Rename constraints to match the current Prisma schema naming.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.alias_entries'::regclass
      AND conname = 'knowledge_entries_pkey'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.alias_entries'::regclass
      AND conname = 'alias_entries_pkey'
  ) THEN
    ALTER TABLE "alias_entries"
      RENAME CONSTRAINT "knowledge_entries_pkey" TO "alias_entries_pkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.alias_packs'::regclass
      AND conname = 'knowledge_packs_pkey'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.alias_packs'::regclass
      AND conname = 'alias_packs_pkey'
  ) THEN
    ALTER TABLE "alias_packs"
      RENAME CONSTRAINT "knowledge_packs_pkey" TO "alias_packs_pkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.book_alias_packs'::regclass
      AND conname = 'book_knowledge_packs_pkey'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.book_alias_packs'::regclass
      AND conname = 'book_alias_packs_pkey'
  ) THEN
    ALTER TABLE "book_alias_packs"
      RENAME CONSTRAINT "book_knowledge_packs_pkey" TO "book_alias_packs_pkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.generic_title_rules'::regclass
      AND conname = 'generic_title_entries_pkey'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.generic_title_rules'::regclass
      AND conname = 'generic_title_rules_pkey'
  ) THEN
    ALTER TABLE "generic_title_rules"
      RENAME CONSTRAINT "generic_title_entries_pkey" TO "generic_title_rules_pkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.surname_rules'::regclass
      AND conname = 'surname_entries_pkey'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.surname_rules'::regclass
      AND conname = 'surname_rules_pkey'
  ) THEN
    ALTER TABLE "surname_rules"
      RENAME CONSTRAINT "surname_entries_pkey" TO "surname_rules_pkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.alias_entries'::regclass
      AND conname = 'knowledge_entries_pack_id_fkey'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.alias_entries'::regclass
      AND conname = 'alias_entries_pack_id_fkey'
  ) THEN
    ALTER TABLE "alias_entries"
      RENAME CONSTRAINT "knowledge_entries_pack_id_fkey" TO "alias_entries_pack_id_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.alias_packs'::regclass
      AND conname = 'knowledge_packs_book_type_id_fkey'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.alias_packs'::regclass
      AND conname = 'alias_packs_book_type_id_fkey'
  ) THEN
    ALTER TABLE "alias_packs"
      RENAME CONSTRAINT "knowledge_packs_book_type_id_fkey" TO "alias_packs_book_type_id_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.book_alias_packs'::regclass
      AND conname = 'book_knowledge_packs_book_id_fkey'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.book_alias_packs'::regclass
      AND conname = 'book_alias_packs_book_id_fkey'
  ) THEN
    ALTER TABLE "book_alias_packs"
      RENAME CONSTRAINT "book_knowledge_packs_book_id_fkey" TO "book_alias_packs_book_id_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.book_alias_packs'::regclass
      AND conname = 'book_knowledge_packs_pack_id_fkey'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.book_alias_packs'::regclass
      AND conname = 'book_alias_packs_pack_id_fkey'
  ) THEN
    ALTER TABLE "book_alias_packs"
      RENAME CONSTRAINT "book_knowledge_packs_pack_id_fkey" TO "book_alias_packs_pack_id_fkey";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.surname_rules'::regclass
      AND conname = 'surname_entries_book_type_id_fkey'
  ) AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.surname_rules'::regclass
      AND conname = 'surname_rules_book_type_id_fkey'
  ) THEN
    ALTER TABLE "surname_rules"
      RENAME CONSTRAINT "surname_entries_book_type_id_fkey" TO "surname_rules_book_type_id_fkey";
  END IF;
END $$;

-- Recreate book_type foreign keys with the final referential actions.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.ner_lexicon_rules'::regclass
      AND conname = 'ner_lexicon_rules_book_type_id_fkey'
  ) THEN
    ALTER TABLE "ner_lexicon_rules"
      ADD CONSTRAINT "ner_lexicon_rules_book_type_id_fkey"
      FOREIGN KEY ("book_type_id") REFERENCES "book_types"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.prompt_template_versions'::regclass
      AND conname = 'prompt_template_versions_book_type_id_fkey'
  ) THEN
    ALTER TABLE "prompt_template_versions"
      ADD CONSTRAINT "prompt_template_versions_book_type_id_fkey"
      FOREIGN KEY ("book_type_id") REFERENCES "book_types"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.prompt_extraction_rules'::regclass
      AND conname = 'prompt_extraction_rules_book_type_id_fkey'
  ) THEN
    ALTER TABLE "prompt_extraction_rules"
      ADD CONSTRAINT "prompt_extraction_rules_book_type_id_fkey"
      FOREIGN KEY ("book_type_id") REFERENCES "book_types"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

-- Rename indexes to match the current Prisma schema naming.
DO $$
BEGIN
  IF to_regclass('public.alias_entries_pack_review_idx') IS NOT NULL
     AND to_regclass('public.alias_entries_pack_id_review_status_idx') IS NULL THEN
    ALTER INDEX "alias_entries_pack_review_idx"
      RENAME TO "alias_entries_pack_id_review_status_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.alias_packs_book_type_active_idx') IS NOT NULL
     AND to_regclass('public.alias_packs_book_type_id_is_active_idx') IS NULL THEN
    ALTER INDEX "alias_packs_book_type_active_idx"
      RENAME TO "alias_packs_book_type_id_is_active_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.book_alias_pack_unique') IS NOT NULL
     AND to_regclass('public.book_alias_packs_book_id_pack_id_key') IS NULL THEN
    ALTER INDEX "book_alias_pack_unique"
      RENAME TO "book_alias_packs_book_id_pack_id_key";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.book_types_active_sort_idx') IS NOT NULL
     AND to_regclass('public.book_types_is_active_sort_order_idx') IS NULL THEN
    ALTER INDEX "book_types_active_sort_idx"
      RENAME TO "book_types_is_active_sort_order_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.generic_title_rules_tier_idx') IS NOT NULL
     AND to_regclass('public.generic_title_rules_tier_is_active_idx') IS NULL THEN
    ALTER INDEX "generic_title_rules_tier_idx"
      RENAME TO "generic_title_rules_tier_is_active_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.historical_figure_entries_category_review_idx') IS NOT NULL
     AND to_regclass('public.historical_figure_entries_category_review_status_idx') IS NULL THEN
    ALTER INDEX "historical_figure_entries_category_review_idx"
      RENAME TO "historical_figure_entries_category_review_status_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.name_pattern_rules_type_review_idx') IS NOT NULL
     AND to_regclass('public.name_pattern_rules_rule_type_review_status_idx') IS NULL THEN
    ALTER INDEX "name_pattern_rules_type_review_idx"
      RENAME TO "name_pattern_rules_rule_type_review_status_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.ner_lexicon_rules_book_type_idx') IS NOT NULL
     AND to_regclass('public.ner_lexicon_rules_book_type_id_idx') IS NULL THEN
    ALTER INDEX "ner_lexicon_rules_book_type_idx"
      RENAME TO "ner_lexicon_rules_book_type_id_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.ner_lexicon_rules_type_active_idx') IS NOT NULL
     AND to_regclass('public.ner_lexicon_rules_rule_type_is_active_sort_order_idx') IS NULL THEN
    ALTER INDEX "ner_lexicon_rules_type_active_idx"
      RENAME TO "ner_lexicon_rules_rule_type_is_active_sort_order_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.prompt_extraction_rules_book_type_idx') IS NOT NULL
     AND to_regclass('public.prompt_extraction_rules_book_type_id_idx') IS NULL THEN
    ALTER INDEX "prompt_extraction_rules_book_type_idx"
      RENAME TO "prompt_extraction_rules_book_type_id_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.prompt_extraction_rules_type_active_idx') IS NOT NULL
     AND to_regclass('public.prompt_extraction_rules_rule_type_is_active_sort_order_idx') IS NULL THEN
    ALTER INDEX "prompt_extraction_rules_type_active_idx"
      RENAME TO "prompt_extraction_rules_rule_type_is_active_sort_order_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.prompt_versions_template_active_idx') IS NOT NULL
     AND to_regclass('public.prompt_template_versions_template_id_is_active_idx') IS NULL THEN
    ALTER INDEX "prompt_versions_template_active_idx"
      RENAME TO "prompt_template_versions_template_id_is_active_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.prompt_versions_template_booktype_idx') IS NOT NULL
     AND to_regclass('public.prompt_template_versions_template_id_book_type_id_idx') IS NULL THEN
    ALTER INDEX "prompt_versions_template_booktype_idx"
      RENAME TO "prompt_template_versions_template_id_book_type_id_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.surname_entries_surname_key') IS NOT NULL
     AND to_regclass('public.surname_rules_surname_key') IS NULL THEN
    ALTER INDEX "surname_entries_surname_key"
      RENAME TO "surname_rules_surname_key";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.surname_rules_active_idx') IS NOT NULL
     AND to_regclass('public.surname_rules_is_active_idx') IS NULL THEN
    ALTER INDEX "surname_rules_active_idx"
      RENAME TO "surname_rules_is_active_idx";
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.surname_rules_compound_priority_idx') IS NOT NULL
     AND to_regclass('public.surname_rules_is_compound_priority_idx') IS NULL THEN
    ALTER INDEX "surname_rules_compound_priority_idx"
      RENAME TO "surname_rules_is_compound_priority_idx";
  END IF;
END $$;
