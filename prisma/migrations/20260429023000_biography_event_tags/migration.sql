ALTER TABLE "biography_records"
  ADD COLUMN IF NOT EXISTS "event_tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "biography_records"
SET "event_tags" = ARRAY[]::TEXT[]
WHERE "event_tags" IS NULL;

ALTER TABLE "biography_records"
  ALTER COLUMN "event_tags" SET DEFAULT ARRAY[]::TEXT[],
  ALTER COLUMN "event_tags" SET NOT NULL;
