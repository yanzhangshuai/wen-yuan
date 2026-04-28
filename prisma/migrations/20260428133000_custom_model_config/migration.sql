ALTER TABLE "ai_models"
  ADD COLUMN IF NOT EXISTS "protocol" TEXT NOT NULL DEFAULT 'openai-compatible';

UPDATE "ai_models"
SET "protocol" = 'gemini'
WHERE lower("provider") = 'gemini';

DROP INDEX IF EXISTS "ai_models_alias_key_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "ai_models_unique_endpoint"
  ON "ai_models" ("provider", "model_id", "base_url");

CREATE UNIQUE INDEX IF NOT EXISTS "ai_models_alias_key_uniq"
  ON "ai_models" ("alias_key");
