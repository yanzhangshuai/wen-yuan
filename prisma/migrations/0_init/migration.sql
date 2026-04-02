-- 全量初始化迁移 / Full Initial Schema Migration
-- Generated from current schema.prisma

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "name_type" AS ENUM ('NAMED', 'TITLE_ONLY');

-- CreateEnum
CREATE TYPE "record_source" AS ENUM ('AI', 'MANUAL');

-- CreateEnum
CREATE TYPE "app_role" AS ENUM ('ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "processing_status" AS ENUM ('DRAFT', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "analysis_job_status" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "alias_type" AS ENUM ('TITLE', 'POSITION', 'KINSHIP', 'NICKNAME', 'COURTESY_NAME');

-- CreateEnum
CREATE TYPE "alias_mapping_status" AS ENUM ('PENDING', 'CONFIRMED', 'LLM_INFERRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "persona_type" AS ENUM ('PERSON', 'LOCATION', 'ORGANIZATION', 'CONCEPT');

-- CreateEnum
CREATE TYPE "bio_category" AS ENUM ('BIRTH', 'EXAM', 'CAREER', 'TRAVEL', 'SOCIAL', 'DEATH', 'EVENT');

-- CreateEnum
CREATE TYPE "chapter_type" AS ENUM ('PRELUDE', 'CHAPTER', 'POSTLUDE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '管理员',
    "password" TEXT NOT NULL,
    "role" "app_role" NOT NULL DEFAULT 'VIEWER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_models" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "base_url" TEXT NOT NULL,
    "api_key" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ai_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "books" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "dynasty" TEXT,
    "description" TEXT,
    "cover_url" TEXT,
    "source_file_key" TEXT,
    "source_file_url" TEXT,
    "source_file_name" TEXT,
    "source_file_mime" TEXT,
    "source_file_size" INTEGER,
    "deleted_at" TIMESTAMPTZ(6),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error_log" TEXT,
    "parse_progress" INTEGER NOT NULL DEFAULT 0,
    "parse_stage" TEXT,
    "ai_model_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapters" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "type" "chapter_type" NOT NULL DEFAULT 'CHAPTER',
    "no" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '回',
    "no_text" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "parse_status" TEXT NOT NULL DEFAULT 'PENDING',
    "is_abstract" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personas" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "persona_type" NOT NULL DEFAULT 'PERSON',
    "gender" TEXT,
    "name_type" "name_type" NOT NULL DEFAULT 'NAMED',
    "record_source" "record_source" NOT NULL DEFAULT 'AI',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hometown" TEXT,
    "birth_year" TEXT,
    "death_year" TEXT,
    "global_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "personas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "persona_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "local_name" TEXT NOT NULL,
    "local_summary" TEXT,
    "official_title" TEXT,
    "local_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "irony_index" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "moral_tier" TEXT,
    "visual_config" JSONB,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biography_records" (
    "id" UUID NOT NULL,
    "persona_id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "chapter_no" INTEGER NOT NULL,
    "category" "bio_category" NOT NULL DEFAULT 'EVENT',
    "title" TEXT,
    "location" TEXT,
    "event" TEXT NOT NULL,
    "virtual_year" TEXT,
    "irony_note" TEXT,
    "record_source" "record_source" NOT NULL DEFAULT 'AI',
    "status" "processing_status" NOT NULL DEFAULT 'DRAFT',
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "biography_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentions" (
    "id" UUID NOT NULL,
    "persona_id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "raw_text" TEXT NOT NULL,
    "summary" TEXT,
    "para_index" INTEGER,
    "record_source" "record_source" NOT NULL DEFAULT 'AI',
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationships" (
    "id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "description" TEXT,
    "evidence" TEXT,
    "record_source" "record_source" NOT NULL DEFAULT 'AI',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "status" "processing_status" NOT NULL DEFAULT 'DRAFT',
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_jobs" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "ai_model_id" UUID,
    "status" "analysis_job_status" NOT NULL DEFAULT 'QUEUED',
    "scope" TEXT NOT NULL DEFAULT 'FULL_BOOK',
    "chapter_start" INTEGER,
    "chapter_end" INTEGER,
    "chapter_indices" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "error_log" TEXT,
    "override_strategy" TEXT,
    "keep_history" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alias_mappings" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "persona_id" UUID,
    "alias" TEXT NOT NULL,
    "resolved_name" TEXT,
    "alias_type" "alias_type" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidence" TEXT,
    "status" "alias_mapping_status" NOT NULL DEFAULT 'PENDING',
    "chapter_start" INTEGER,
    "chapter_end" INTEGER,
    "context_hash" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "alias_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "validation_reports" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "job_id" UUID,
    "scope" TEXT NOT NULL,
    "chapter_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "issues" JSONB NOT NULL,
    "summary" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "validation_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merge_suggestions" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "source_persona_id" UUID NOT NULL,
    "target_persona_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidence_refs" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "merge_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE INDEX "ai_models_provider_enabled_idx" ON "ai_models"("provider", "is_enabled");

-- CreateIndex
CREATE INDEX "books_deleted_at_idx" ON "books"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_book_type_no_key" ON "chapters"("book_id", "type", "no");

-- CreateIndex
CREATE INDEX "persona_name_idx" ON "personas"("name");

-- CreateIndex
CREATE INDEX "persona_deleted_at_idx" ON "personas"("deleted_at");

-- CreateIndex
CREATE INDEX "profiles_book_id_deleted_at_idx" ON "profiles"("book_id", "deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "profile_persona_id_book_id_key" ON "profiles"("persona_id", "book_id");

-- CreateIndex
CREATE INDEX "biography_record_chapter_no_idx" ON "biography_records"("chapter_no");

-- CreateIndex
CREATE INDEX "biography_record_persona_id_idx" ON "biography_records"("persona_id");

-- CreateIndex
CREATE INDEX "biography_record_review_query_idx" ON "biography_records"("status", "record_source", "chapter_id");

-- CreateIndex
CREATE INDEX "mentions_chapter_id_idx" ON "mentions"("chapter_id");

-- CreateIndex
CREATE INDEX "mention_persona_id_chapter_id_idx" ON "mentions"("persona_id", "chapter_id");

-- CreateIndex
CREATE INDEX "mentions_chapter_deleted_at_idx" ON "mentions"("chapter_id", "deleted_at");

-- CreateIndex
CREATE INDEX "relationships_source_id_target_id_idx" ON "relationships"("source_id", "target_id");

-- CreateIndex
CREATE INDEX "relationships_review_query_idx" ON "relationships"("status", "record_source", "chapter_id");

-- CreateIndex
CREATE UNIQUE INDEX "relationships_dedup_key" ON "relationships"("chapter_id", "source_id", "target_id", "type", "record_source");

-- CreateIndex
CREATE INDEX "analysis_jobs_book_created_at_idx" ON "analysis_jobs"("book_id", "created_at");

-- CreateIndex
CREATE INDEX "analysis_jobs_status_created_at_idx" ON "analysis_jobs"("status", "created_at");

-- CreateIndex
CREATE INDEX "alias_book_idx" ON "alias_mappings"("book_id", "alias");

-- CreateIndex
CREATE INDEX "persona_book_idx" ON "alias_mappings"("book_id", "persona_id");

-- CreateIndex
CREATE INDEX "validation_book_idx" ON "validation_reports"("book_id");

-- CreateIndex
CREATE INDEX "validation_book_chapter_idx" ON "validation_reports"("book_id", "chapter_id");

-- CreateIndex
CREATE INDEX "validation_job_idx" ON "validation_reports"("job_id");

-- CreateIndex
CREATE INDEX "merge_suggestions_book_status_idx" ON "merge_suggestions"("book_id", "status");

-- CreateIndex
CREATE INDEX "merge_suggestions_source_persona_idx" ON "merge_suggestions"("source_persona_id");

-- CreateIndex
CREATE INDEX "merge_suggestions_target_persona_idx" ON "merge_suggestions"("target_persona_id");

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_ai_model_id_fkey" FOREIGN KEY ("ai_model_id") REFERENCES "ai_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biography_records" ADD CONSTRAINT "biography_records_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biography_records" ADD CONSTRAINT "biography_records_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_ai_model_id_fkey" FOREIGN KEY ("ai_model_id") REFERENCES "ai_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alias_mappings" ADD CONSTRAINT "alias_mappings_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alias_mappings" ADD CONSTRAINT "alias_mappings_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_reports" ADD CONSTRAINT "validation_reports_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_reports" ADD CONSTRAINT "validation_reports_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "analysis_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_suggestions" ADD CONSTRAINT "merge_suggestions_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_suggestions" ADD CONSTRAINT "merge_suggestions_source_persona_id_fkey" FOREIGN KEY ("source_persona_id") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_suggestions" ADD CONSTRAINT "merge_suggestions_target_persona_id_fkey" FOREIGN KEY ("target_persona_id") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
