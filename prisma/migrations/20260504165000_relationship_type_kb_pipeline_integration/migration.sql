ALTER TABLE "relationship_type_definitions"
  ADD COLUMN IF NOT EXISTS "book_type_id" UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'relationship_type_definitions_book_type_id_fkey'
  ) THEN
    ALTER TABLE "relationship_type_definitions"
      ADD CONSTRAINT "relationship_type_definitions_book_type_id_fkey"
      FOREIGN KEY ("book_type_id")
      REFERENCES "book_types"("id")
      ON DELETE SET NULL
      ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "rt_def_book_type_status_sort_idx"
  ON "relationship_type_definitions"("book_type_id", "status", "sort_order");

CREATE TABLE IF NOT EXISTS "unknown_relationship_type_drafts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "book_id" UUID NOT NULL,
  "first_chapter_id" UUID NOT NULL,
  "first_job_id" UUID,
  "signature" VARCHAR(200) NOT NULL,
  "proposed_name" VARCHAR(80) NOT NULL,
  "proposed_group" VARCHAR(40) NOT NULL,
  "proposed_direction_mode" VARCHAR(20) NOT NULL,
  "proposed_source_role_label" VARCHAR(80),
  "proposed_target_role_label" VARCHAR(80),
  "occurrence_count" INTEGER NOT NULL DEFAULT 1,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "rejection_reason" TEXT,
  "approved_type_code" VARCHAR(120),
  "merged_into_draft_id" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "unknown_relationship_type_drafts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "unknown_relationship_type_occurrences" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "draft_id" UUID NOT NULL,
  "book_id" UUID NOT NULL,
  "chapter_id" UUID NOT NULL,
  "job_id" UUID,
  "source_name" TEXT NOT NULL,
  "target_name" TEXT NOT NULL,
  "source_persona_id" UUID,
  "target_persona_id" UUID,
  "evidence" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "unknown_relationship_type_occurrences_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unknown_rel_draft_book_signature_key') THEN
    ALTER TABLE "unknown_relationship_type_drafts"
      ADD CONSTRAINT "unknown_rel_draft_book_signature_key"
      UNIQUE ("book_id", "signature");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unknown_rel_occurrence_unique_key') THEN
    ALTER TABLE "unknown_relationship_type_occurrences"
      ADD CONSTRAINT "unknown_rel_occurrence_unique_key"
      UNIQUE ("draft_id", "chapter_id", "source_name", "target_name");
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unknown_relationship_type_drafts_book_id_fkey') THEN
    ALTER TABLE "unknown_relationship_type_drafts"
      ADD CONSTRAINT "unknown_relationship_type_drafts_book_id_fkey"
      FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unknown_relationship_type_drafts_first_chapter_id_fkey') THEN
    ALTER TABLE "unknown_relationship_type_drafts"
      ADD CONSTRAINT "unknown_relationship_type_drafts_first_chapter_id_fkey"
      FOREIGN KEY ("first_chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unknown_relationship_type_drafts_first_job_id_fkey') THEN
    ALTER TABLE "unknown_relationship_type_drafts"
      ADD CONSTRAINT "unknown_relationship_type_drafts_first_job_id_fkey"
      FOREIGN KEY ("first_job_id") REFERENCES "analysis_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unknown_relationship_type_drafts_merged_into_draft_id_fkey') THEN
    ALTER TABLE "unknown_relationship_type_drafts"
      ADD CONSTRAINT "unknown_relationship_type_drafts_merged_into_draft_id_fkey"
      FOREIGN KEY ("merged_into_draft_id") REFERENCES "unknown_relationship_type_drafts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unknown_relationship_type_occurrences_draft_id_fkey') THEN
    ALTER TABLE "unknown_relationship_type_occurrences"
      ADD CONSTRAINT "unknown_relationship_type_occurrences_draft_id_fkey"
      FOREIGN KEY ("draft_id") REFERENCES "unknown_relationship_type_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unknown_relationship_type_occurrences_book_id_fkey') THEN
    ALTER TABLE "unknown_relationship_type_occurrences"
      ADD CONSTRAINT "unknown_relationship_type_occurrences_book_id_fkey"
      FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unknown_relationship_type_occurrences_chapter_id_fkey') THEN
    ALTER TABLE "unknown_relationship_type_occurrences"
      ADD CONSTRAINT "unknown_relationship_type_occurrences_chapter_id_fkey"
      FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unknown_relationship_type_occurrences_job_id_fkey') THEN
    ALTER TABLE "unknown_relationship_type_occurrences"
      ADD CONSTRAINT "unknown_relationship_type_occurrences_job_id_fkey"
      FOREIGN KEY ("job_id") REFERENCES "analysis_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unknown_relationship_type_occurrences_source_persona_id_fkey') THEN
    ALTER TABLE "unknown_relationship_type_occurrences"
      ADD CONSTRAINT "unknown_relationship_type_occurrences_source_persona_id_fkey"
      FOREIGN KEY ("source_persona_id") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unknown_relationship_type_occurrences_target_persona_id_fkey') THEN
    ALTER TABLE "unknown_relationship_type_occurrences"
      ADD CONSTRAINT "unknown_relationship_type_occurrences_target_persona_id_fkey"
      FOREIGN KEY ("target_persona_id") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "unknown_rel_draft_book_status_idx"
  ON "unknown_relationship_type_drafts"("book_id", "status");

CREATE INDEX IF NOT EXISTS "unknown_rel_draft_approved_code_idx"
  ON "unknown_relationship_type_drafts"("approved_type_code");

CREATE INDEX IF NOT EXISTS "unknown_rel_occurrence_book_chapter_idx"
  ON "unknown_relationship_type_occurrences"("book_id", "chapter_id");
