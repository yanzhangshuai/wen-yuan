-- DropIndex
DROP INDEX "ai_models_alias_key_uniq";

-- AlterTable
ALTER TABLE "ai_models" DROP COLUMN "alias_key";

-- AlterTable
ALTER TABLE "analysis_jobs" ADD COLUMN     "current_stage" TEXT;

