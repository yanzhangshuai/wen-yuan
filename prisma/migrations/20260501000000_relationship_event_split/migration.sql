-- 1) Extend the mapped PostgreSQL enum used by Prisma RecordSource.
ALTER TYPE "record_source" ADD VALUE IF NOT EXISTS 'DRAFT_AI';

-- 2) Remove old relationship constraints and clear incompatible row data.
DROP INDEX IF EXISTS "relationships_dedup_key";
DROP INDEX IF EXISTS "relationships_review_query_idx";

ALTER TABLE "relationships" DROP CONSTRAINT IF EXISTS "relationships_chapter_id_fkey";
ALTER TABLE "relationships" DROP CONSTRAINT IF EXISTS "relationships_relationship_type_code_fkey";

DELETE FROM "relationships";

-- 3) Convert relationships from chapter-level edges to book-level pairs.
ALTER TABLE "relationships"
  DROP COLUMN IF EXISTS "chapter_id",
  DROP COLUMN IF EXISTS "type",
  DROP COLUMN IF EXISTS "weight",
  DROP COLUMN IF EXISTS "description",
  DROP COLUMN IF EXISTS "evidence",
  DROP COLUMN IF EXISTS "confidence";

ALTER TABLE "relationships"
  ADD COLUMN IF NOT EXISTS "book_id" UUID NOT NULL,
  ALTER COLUMN "relationship_type_code" SET NOT NULL,
  ALTER COLUMN "relationship_type_code" SET DATA TYPE VARCHAR(120),
  ALTER COLUMN "record_source" SET DEFAULT 'DRAFT_AI',
  ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "relationships"
  ADD CONSTRAINT "relationships_book_id_fkey"
  FOREIGN KEY ("book_id")
  REFERENCES "books"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "relationships"
  ADD CONSTRAINT "relationships_relationship_type_code_fkey"
  FOREIGN KEY ("relationship_type_code")
  REFERENCES "relationship_type_definitions"("code")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

-- Prisma cannot model the partial unique predicate, but the database contract
-- must ignore soft-deleted rows so recreated relationships can reuse the pair.
CREATE UNIQUE INDEX "relationships_book_pair_type_key"
  ON "relationships"("book_id", "source_id", "target_id", "relationship_type_code")
  WHERE "deleted_at" IS NULL;

CREATE INDEX IF NOT EXISTS "relationships_book_status_deleted_idx"
  ON "relationships"("book_id", "status", "deleted_at");

-- 4) Store chapter-level relationship evidence as separate events.
CREATE TABLE IF NOT EXISTS "relationship_events" (
  "id" UUID NOT NULL,
  "relationship_id" UUID NOT NULL,
  "book_id" UUID NOT NULL,
  "chapter_id" UUID NOT NULL,
  "chapter_no" INTEGER NOT NULL,
  "source_id" UUID NOT NULL,
  "target_id" UUID NOT NULL,
  "summary" TEXT NOT NULL,
  "evidence" TEXT,
  "attitude_tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "para_index" INTEGER,
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
  "record_source" "record_source" NOT NULL DEFAULT 'DRAFT_AI',
  "status" "processing_status" NOT NULL DEFAULT 'DRAFT',
  "deleted_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "relationship_events_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "relationship_events"
  ADD CONSTRAINT "relationship_events_relationship_id_fkey"
  FOREIGN KEY ("relationship_id")
  REFERENCES "relationships"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "relationship_events"
  ADD CONSTRAINT "relationship_events_book_id_fkey"
  FOREIGN KEY ("book_id")
  REFERENCES "books"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "relationship_events"
  ADD CONSTRAINT "relationship_events_chapter_id_fkey"
  FOREIGN KEY ("chapter_id")
  REFERENCES "chapters"("id")
  ON DELETE CASCADE
  ON UPDATE CASCADE;

ALTER TABLE "relationship_events"
  ADD CONSTRAINT "relationship_events_source_id_fkey"
  FOREIGN KEY ("source_id")
  REFERENCES "personas"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

ALTER TABLE "relationship_events"
  ADD CONSTRAINT "relationship_events_target_id_fkey"
  FOREIGN KEY ("target_id")
  REFERENCES "personas"("id")
  ON DELETE RESTRICT
  ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "relationship_events_relationship_chapter_idx"
  ON "relationship_events"("relationship_id", "chapter_no");

CREATE INDEX IF NOT EXISTS "relationship_events_book_chapter_idx"
  ON "relationship_events"("book_id", "chapter_id");

CREATE INDEX IF NOT EXISTS "relationship_events_book_status_deleted_idx"
  ON "relationship_events"("book_id", "status", "deleted_at");
