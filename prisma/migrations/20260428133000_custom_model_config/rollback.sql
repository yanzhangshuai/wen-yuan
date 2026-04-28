DROP INDEX IF EXISTS "ai_models_alias_key_uniq";

DROP INDEX IF EXISTS "ai_models_unique_endpoint";

CREATE INDEX IF NOT EXISTS "ai_models_alias_key_idx"
  ON "ai_models" ("alias_key");

ALTER TABLE "ai_models"
  DROP COLUMN IF EXISTS "protocol";
