-- AlterTable
ALTER TABLE "ai_models"
  ADD COLUMN "alias_key" TEXT;

-- CreateIndex
CREATE INDEX "ai_models_alias_key_idx" ON "ai_models"("alias_key");

-- Backfill semantic alias keys for existing seeded models.
UPDATE "ai_models"
SET "alias_key" = CASE
  WHEN "provider" = 'deepseek' AND "model_id" IN ('deepseek-chat', 'deepseek-v3.2') THEN 'deepseek-v3-stable'
  WHEN "provider" = 'deepseek' AND "model_id" = 'deepseek-reasoner' THEN 'deepseek-r1-stable'
  WHEN "provider" = 'qwen' AND "model_id" = 'qwen-max' THEN 'qwen-max-stable'
  WHEN "provider" = 'qwen' AND "model_id" = 'qwen-plus' THEN 'qwen-plus-stable'
  WHEN "provider" = 'doubao' AND "model_id" LIKE 'ep-%' THEN 'doubao-pro-stable'
  WHEN "provider" = 'glm' AND "model_id" = 'glm-4.6' THEN 'glm-4.6-stable'
  WHEN "provider" = 'glm' AND "model_id" = 'glm-5' THEN 'glm-5-stable'
  WHEN "provider" = 'gemini' AND "model_id" = 'gemini-3.1-flash' THEN 'gemini-flash-stable'
  ELSE "alias_key"
END
WHERE "alias_key" IS NULL;
