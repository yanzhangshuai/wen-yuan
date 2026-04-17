-- Migrate legacy twopass rows to threestage; flip default to threestage.
UPDATE "analysis_jobs" SET "architecture" = 'threestage' WHERE "architecture" = 'twopass';
ALTER TABLE "analysis_jobs" ALTER COLUMN "architecture" SET DEFAULT 'threestage';
