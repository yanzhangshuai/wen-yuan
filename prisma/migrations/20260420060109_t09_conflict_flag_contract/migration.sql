/*
  Warnings:

  - Added the required column `reason` to the `conflict_flags` table without a default value. This is not possible if the table is not empty.
  - Added the required column `recommended_action_key` to the `conflict_flags` table without a default value. This is not possible if the table is not empty.
  - Added the required column `severity` to the `conflict_flags` table without a default value. This is not possible if the table is not empty.
  - Added the required column `source_stage_key` to the `conflict_flags` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "conflict_severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- DropIndex
DROP INDEX "analysis_runs_active_job_identity_uidx";

-- AlterTable
ALTER TABLE "conflict_flags" ADD COLUMN     "reason" TEXT NOT NULL,
ADD COLUMN     "recommended_action_key" TEXT NOT NULL,
ADD COLUMN     "related_chapter_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "related_persona_candidate_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "severity" "conflict_severity" NOT NULL,
ADD COLUMN     "source_stage_key" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "conflict_flags_severity_idx" ON "conflict_flags"("severity");
