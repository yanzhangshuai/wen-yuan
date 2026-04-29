ALTER TABLE "chapter_biography_verifications"
  ALTER COLUMN "id" SET DEFAULT gen_random_uuid(),
  ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;
