-- AlterTable
ALTER TABLE "analysis_runs" ADD COLUMN     "completion_tokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "estimated_cost_micros" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "job_id" UUID,
ADD COLUMN     "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "total_tokens" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "analysis_stage_runs" ADD COLUMN     "chapter_end_no" INTEGER,
ADD COLUMN     "chapter_start_no" INTEGER,
ADD COLUMN     "completion_tokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "error_class" TEXT,
ADD COLUMN     "estimated_cost_micros" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "failure_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "input_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "output_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "prompt_tokens" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "skipped_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "total_tokens" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "llm_raw_outputs" ADD COLUMN     "discard_reason" TEXT,
ADD COLUMN     "estimated_cost_micros" BIGINT,
ADD COLUMN     "parse_error" TEXT,
ADD COLUMN     "schema_error" TEXT,
ADD COLUMN     "total_tokens" INTEGER;

-- CreateIndex
CREATE INDEX "analysis_runs_job_created_at_idx" ON "analysis_runs"("job_id", "created_at");

-- CreateIndex
CREATE INDEX "analysis_stage_runs_status_stage_idx" ON "analysis_stage_runs"("status", "stage_key");
