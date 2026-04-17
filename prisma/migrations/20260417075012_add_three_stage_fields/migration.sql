-- CreateEnum
CREATE TYPE "narrative_lens" AS ENUM ('SELF', 'IMPERSONATING', 'QUOTED', 'REPORTED', 'HISTORICAL');

-- CreateEnum
CREATE TYPE "identity_claim" AS ENUM ('SELF', 'IMPERSONATING', 'QUOTED', 'REPORTED', 'HISTORICAL', 'UNSURE');

-- CreateEnum
CREATE TYPE "book_type_code" AS ENUM ('CLASSICAL_NOVEL', 'HEROIC_NOVEL', 'HISTORICAL_NOVEL', 'MYTHOLOGICAL_NOVEL', 'GENERIC');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "alias_type" ADD VALUE 'NAMED';
ALTER TYPE "alias_type" ADD VALUE 'IMPERSONATED_IDENTITY';
ALTER TYPE "alias_type" ADD VALUE 'MISIDENTIFIED_AS';
ALTER TYPE "alias_type" ADD VALUE 'UNSURE';

-- AlterTable
ALTER TABLE "biography_records" ADD COLUMN     "narrative_lens" "narrative_lens" NOT NULL DEFAULT 'SELF',
ADD COLUMN     "narrative_region_type" TEXT NOT NULL DEFAULT 'NARRATIVE';

-- AlterTable
ALTER TABLE "books" ADD COLUMN     "type_code" "book_type_code" NOT NULL DEFAULT 'GENERIC';

-- AlterTable
ALTER TABLE "merge_suggestions" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'STAGE_B_AUTO';

-- AlterTable
ALTER TABLE "personas" ADD COLUMN     "current_location" TEXT,
ADD COLUMN     "death_chapter_no" INTEGER,
ADD COLUMN     "distinct_chapters" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "effective_biography_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "mention_count" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "preprocessor_confidence" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'CANDIDATE';

-- CreateTable
CREATE TABLE "persona_mentions" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "chapter_no" INTEGER NOT NULL,
    "job_id" UUID,
    "surface_form" TEXT NOT NULL,
    "alias_type_hint" "alias_type" NOT NULL,
    "identity_claim" "identity_claim" NOT NULL DEFAULT 'UNSURE',
    "suspected_resolves_to" TEXT,
    "narrative_region_type" TEXT NOT NULL DEFAULT 'NARRATIVE',
    "action_verb" TEXT,
    "raw_span" TEXT NOT NULL,
    "span_start" INTEGER,
    "span_end" INTEGER,
    "scene_context_hint" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "promoted_persona_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "persona_mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapter_preprocess_results" (
    "id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "job_id" UUID,
    "narrative_ratio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "poem_ratio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dialogue_ratio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "commentary_ratio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unclassified_ratio" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "confidence" TEXT NOT NULL DEFAULT 'HIGH',
    "death_markers" JSONB,
    "regions" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chapter_preprocess_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_template_variants" (
    "id" UUID NOT NULL,
    "template_slug" TEXT NOT NULL,
    "book_type_code" "book_type_code" NOT NULL,
    "special_rules" TEXT NOT NULL,
    "few_shots_json" JSONB,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "prompt_template_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_type_examples" (
    "id" UUID NOT NULL,
    "book_type_code" "book_type_code" NOT NULL,
    "stage" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "example_input" TEXT NOT NULL,
    "example_output" TEXT NOT NULL,
    "note" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_type_examples_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "persona_mention_book_surface_idx" ON "persona_mentions"("book_id", "surface_form");

-- CreateIndex
CREATE INDEX "persona_mention_book_chapter_idx" ON "persona_mentions"("book_id", "chapter_no");

-- CreateIndex
CREATE INDEX "persona_mention_book_persona_idx" ON "persona_mentions"("book_id", "promoted_persona_id");

-- CreateIndex
CREATE INDEX "persona_mention_job_idx" ON "persona_mentions"("job_id");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_preprocess_results_chapter_id_key" ON "chapter_preprocess_results"("chapter_id");

-- CreateIndex
CREATE INDEX "chapter_preprocess_job_idx" ON "chapter_preprocess_results"("job_id");

-- CreateIndex
CREATE INDEX "prompt_template_variant_type_idx" ON "prompt_template_variants"("book_type_code");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_template_variant_slug_type_key" ON "prompt_template_variants"("template_slug", "book_type_code");

-- CreateIndex
CREATE INDEX "book_type_example_lookup_idx" ON "book_type_examples"("book_type_code", "stage", "priority");

-- CreateIndex
CREATE INDEX "biography_record_lens_persona_idx" ON "biography_records"("narrative_lens", "persona_id");

-- AddForeignKey
ALTER TABLE "persona_mentions" ADD CONSTRAINT "persona_mentions_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persona_mentions" ADD CONSTRAINT "persona_mentions_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persona_mentions" ADD CONSTRAINT "persona_mentions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "analysis_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persona_mentions" ADD CONSTRAINT "persona_mentions_promoted_persona_id_fkey" FOREIGN KEY ("promoted_persona_id") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_preprocess_results" ADD CONSTRAINT "chapter_preprocess_results_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_preprocess_results" ADD CONSTRAINT "chapter_preprocess_results_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "analysis_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- 数据回填：为《儒林外史》书籍置入 CLASSICAL_NOVEL 类型代码
-- 触发需求：T01 DoD —— 书籍 id=7d822600-9107-4711-95b5-e87b3e768125
-- 幂等性：仅当目标书籍存在且当前值为默认 GENERIC 时更新。
-- ---------------------------------------------------------------------------
UPDATE "books"
   SET "type_code" = 'CLASSICAL_NOVEL'
 WHERE "id" = '7d822600-9107-4711-95b5-e87b3e768125'
   AND "type_code" = 'GENERIC';
