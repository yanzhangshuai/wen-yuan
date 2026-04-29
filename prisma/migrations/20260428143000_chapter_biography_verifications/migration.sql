CREATE TABLE IF NOT EXISTS "chapter_biography_verifications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "book_id" UUID NOT NULL,
  "chapter_id" UUID NOT NULL,
  "verified_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "verified_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "chapter_biography_verifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "chapter_bio_verifications_book_chapter_key"
  ON "chapter_biography_verifications"("book_id", "chapter_id");

CREATE INDEX IF NOT EXISTS "chapter_bio_verifications_book_idx"
  ON "chapter_biography_verifications"("book_id");

DO $$ BEGIN
  ALTER TABLE "chapter_biography_verifications"
    ADD CONSTRAINT "chapter_biography_verifications_book_id_fkey"
    FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "chapter_biography_verifications"
    ADD CONSTRAINT "chapter_biography_verifications_chapter_id_fkey"
    FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
