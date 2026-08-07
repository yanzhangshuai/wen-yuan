-- DropForeignKey
ALTER TABLE "book_type_skills" DROP CONSTRAINT "book_type_skills_book_type_id_fkey";

-- DropForeignKey
ALTER TABLE "book_type_skills" DROP CONSTRAINT "book_type_skills_skill_id_fkey";

-- DropForeignKey
ALTER TABLE "books" DROP CONSTRAINT "books_book_type_id_fkey";

-- DropForeignKey
ALTER TABLE "fact_evidences" DROP CONSTRAINT "fact_evidences_chapter_id_fkey";

-- DropForeignKey
ALTER TABLE "fact_evidences" DROP CONSTRAINT "fact_evidences_fact_id_fkey";

-- DropForeignKey
ALTER TABLE "model_strategy_configs" DROP CONSTRAINT "model_strategy_configs_book_id_fkey";

-- DropForeignKey
ALTER TABLE "model_strategy_configs" DROP CONSTRAINT "model_strategy_configs_job_id_fkey";

-- DropForeignKey
ALTER TABLE "relationship_types" DROP CONSTRAINT "relationship_types_book_type_id_fkey";

-- DropForeignKey
ALTER TABLE "skill_versions" DROP CONSTRAINT "skill_versions_book_type_id_fkey";

-- DropForeignKey
ALTER TABLE "text_chunks" DROP CONSTRAINT "text_chunks_book_id_fkey";

-- DropForeignKey
ALTER TABLE "text_chunks" DROP CONSTRAINT "text_chunks_chapter_id_fkey";

-- DropIndex
DROP INDEX "skill_versions_book_type_idx";

-- AlterTable
ALTER TABLE "ai_models" DROP COLUMN "supports_tools";

-- AlterTable
ALTER TABLE "aliases" DROP COLUMN "context_hash";

-- AlterTable
ALTER TABLE "analysis_jobs" DROP COLUMN "architecture",
DROP COLUMN "experiment_tag";

-- AlterTable
ALTER TABLE "books" DROP COLUMN "book_type_id",
DROP COLUMN "parse_progress",
DROP COLUMN "parse_stage";

-- AlterTable
ALTER TABLE "chapters" DROP COLUMN "is_abstract";

-- AlterTable
ALTER TABLE "entities" DROP COLUMN "birth_year",
DROP COLUMN "death_year";

-- AlterTable
ALTER TABLE "entity_profiles" DROP COLUMN "moral_tier";

-- AlterTable
ALTER TABLE "facts" DROP COLUMN "para_index";

-- AlterTable
ALTER TABLE "mentions" DROP COLUMN "summary";

-- AlterTable
ALTER TABLE "skill_versions" DROP COLUMN "book_type_id";

-- AlterTable
ALTER TABLE "skills" ADD COLUMN     "is_enabled" BOOLEAN NOT NULL DEFAULT true;

-- DropTable
DROP TABLE "book_type_skills";

-- DropTable
DROP TABLE "book_types";

-- DropTable
DROP TABLE "fact_evidences";

-- DropTable
DROP TABLE "model_strategy_configs";

-- DropTable
DROP TABLE "relationship_types";

-- DropTable
DROP TABLE "text_chunks";

-- DropEnum
DROP TYPE "model_strategy_scope";

-- DropEnum
DROP TYPE "relation_direction";

-- CreateTable
CREATE TABLE "feature_models" (
    "featureKey" VARCHAR(60) NOT NULL,
    "model_id" UUID NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feature_models_pkey" PRIMARY KEY ("featureKey")
);

-- CreateIndex
CREATE INDEX "feature_models_model_idx" ON "feature_models"("model_id");

-- AddForeignKey
ALTER TABLE "feature_models" ADD CONSTRAINT "feature_models_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ai_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

