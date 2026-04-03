-- CreateEnum
CREATE TYPE "model_strategy_scope" AS ENUM ('GLOBAL', 'BOOK', 'JOB');

-- CreateTable
CREATE TABLE "model_strategy_configs" (
    "id" UUID NOT NULL,
    "scope" "model_strategy_scope" NOT NULL,
    "book_id" UUID,
    "job_id" UUID,
    "stages" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "model_strategy_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_phase_logs" (
    "id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "chapter_id" UUID,
    "stage" TEXT NOT NULL,
    "model_id" UUID,
    "model_source" TEXT NOT NULL,
    "is_fallback" BOOLEAN NOT NULL DEFAULT false,
    "prompt_tokens" INTEGER,
    "completion_tokens" INTEGER,
    "duration_ms" INTEGER,
    "status" TEXT NOT NULL,
    "error_message" TEXT,
    "chunk_index" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analysis_phase_logs_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "analysis_jobs" ADD COLUMN "experiment_tag" TEXT;

-- Drop old ai_model relations on books/analysis_jobs
ALTER TABLE "books" DROP CONSTRAINT "books_ai_model_id_fkey";
ALTER TABLE "analysis_jobs" DROP CONSTRAINT "analysis_jobs_ai_model_id_fkey";
ALTER TABLE "books" DROP COLUMN "ai_model_id";
ALTER TABLE "analysis_jobs" DROP COLUMN "ai_model_id";

-- CreateIndex
CREATE UNIQUE INDEX "uq_strategy_book" ON "model_strategy_configs"("scope", "book_id");
CREATE UNIQUE INDEX "uq_strategy_job" ON "model_strategy_configs"("scope", "job_id");
CREATE INDEX "model_strategy_scope_idx" ON "model_strategy_configs"("scope");
CREATE UNIQUE INDEX "uq_strategy_global" ON "model_strategy_configs"("scope") WHERE "scope" = 'GLOBAL';

CREATE INDEX "analysis_phase_logs_job_stage_idx" ON "analysis_phase_logs"("job_id", "stage");
CREATE INDEX "analysis_phase_logs_model_idx" ON "analysis_phase_logs"("model_id");
CREATE INDEX "analysis_phase_logs_created_at_idx" ON "analysis_phase_logs"("created_at");

-- AddForeignKey
ALTER TABLE "model_strategy_configs" ADD CONSTRAINT "model_strategy_configs_book_id_fkey"
  FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "model_strategy_configs" ADD CONSTRAINT "model_strategy_configs_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "analysis_phase_logs" ADD CONSTRAINT "analysis_phase_logs_job_id_fkey"
  FOREIGN KEY ("job_id") REFERENCES "analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "analysis_phase_logs" ADD CONSTRAINT "analysis_phase_logs_chapter_id_fkey"
  FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "analysis_phase_logs" ADD CONSTRAINT "analysis_phase_logs_model_id_fkey"
  FOREIGN KEY ("model_id") REFERENCES "ai_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed one GLOBAL strategy row from current default model.
DO $$
DECLARE
  v_default_model_id UUID;
BEGIN
  SELECT id INTO v_default_model_id
  FROM "ai_models"
  WHERE "is_default" = true
  ORDER BY "updated_at" DESC
  LIMIT 1;

  IF v_default_model_id IS NOT NULL THEN
    INSERT INTO "model_strategy_configs" (
      "id", "scope", "stages", "created_at", "updated_at"
    ) VALUES (
      gen_random_uuid(),
      'GLOBAL',
      jsonb_build_object(
        'ROSTER_DISCOVERY', jsonb_build_object('modelId', v_default_model_id),
        'CHUNK_EXTRACTION', jsonb_build_object('modelId', v_default_model_id),
        'CHAPTER_VALIDATION', jsonb_build_object('modelId', v_default_model_id),
        'TITLE_RESOLUTION', jsonb_build_object('modelId', v_default_model_id),
        'GRAY_ZONE_ARBITRATION', jsonb_build_object('modelId', v_default_model_id),
        'BOOK_VALIDATION', jsonb_build_object('modelId', v_default_model_id),
        'FALLBACK', jsonb_build_object('modelId', v_default_model_id)
      ),
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
