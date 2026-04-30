ALTER TABLE "profiles"
  ADD COLUMN IF NOT EXISTS "first_appearance_chapter_id" UUID;

CREATE INDEX IF NOT EXISTS "profiles_first_appearance_chapter_idx"
  ON "profiles"("first_appearance_chapter_id");

ALTER TABLE "profiles"
  ADD CONSTRAINT "profiles_first_appearance_chapter_id_fkey"
  FOREIGN KEY ("first_appearance_chapter_id")
  REFERENCES "chapters"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
