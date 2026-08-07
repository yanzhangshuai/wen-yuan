-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "name_type" AS ENUM ('NAMED', 'TITLE_ONLY');

-- CreateEnum
CREATE TYPE "record_source" AS ENUM ('AI', 'MANUAL', 'DRAFT_AI', 'AUTO_VERIFIED');

-- CreateEnum
CREATE TYPE "app_role" AS ENUM ('ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "processing_status" AS ENUM ('DRAFT', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "analysis_job_status" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "alias_type" AS ENUM ('TITLE', 'POSITION', 'KINSHIP', 'NICKNAME', 'COURTESY_NAME');

-- CreateEnum
CREATE TYPE "alias_status" AS ENUM ('PENDING', 'CONFIRMED', 'LLM_INFERRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "entity_type" AS ENUM ('PERSON', 'LOCATION', 'ORGANIZATION', 'CONCEPT');

-- CreateEnum
CREATE TYPE "fact_type" AS ENUM ('BIOGRAPHY', 'RELATION', 'ITEM_TRANSFER', 'ORGANIZATION_EVENT', 'GENERIC');

-- CreateEnum
CREATE TYPE "event_category" AS ENUM ('BIRTH', 'EXAM', 'CAREER', 'TRAVEL', 'SOCIAL', 'DEATH', 'EVENT');

-- CreateEnum
CREATE TYPE "chapter_type" AS ENUM ('PRELUDE', 'CHAPTER', 'POSTLUDE');

-- CreateEnum
CREATE TYPE "skill_category" AS ENUM ('SURNAME', 'GENERIC_TITLE', 'NAME_PATTERN', 'RELATIONSHIP_TYPE', 'HISTORICAL_FIGURE', 'TASK_INSTRUCTION', 'HYBRID');

-- CreateEnum
CREATE TYPE "skill_source" AS ENUM ('MANUAL', 'GENERATED', 'AI');

-- CreateEnum
CREATE TYPE "skill_status" AS ENUM ('DRAFT', 'ACTIVE', 'DISABLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "agent_run_type" AS ENUM ('PRESCAN', 'IDENTITY', 'EXTRACTION', 'RECONCILE', 'VALIDATION', 'CROSS_VALIDATION', 'SKILL_GENERATION');

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
    "protocol" TEXT NOT NULL DEFAULT 'openai-compatible',
    "name" TEXT NOT NULL,
    "model_id" TEXT NOT NULL,
    "alias_key" TEXT,
    "base_url" TEXT NOT NULL,
    "api_key" TEXT,
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "supports_thinking" BOOLEAN NOT NULL DEFAULT false,
    "supports_web_search" BOOLEAN NOT NULL DEFAULT false,
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
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapter_biography_verifications" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "verified_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "chapter_biography_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entities" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "entity_type" "entity_type" NOT NULL DEFAULT 'PERSON',
    "name_type" "name_type" NOT NULL DEFAULT 'NAMED',
    "record_source" "record_source" NOT NULL DEFAULT 'AI',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "gender" TEXT,
    "hometown" TEXT,
    "global_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT,
    "canonical_entity_id" UUID,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_profiles" (
    "id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "local_name" TEXT NOT NULL,
    "local_summary" TEXT,
    "official_title" TEXT,
    "local_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "irony_index" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "first_appearance_chapter_id" UUID,
    "visual_config" JSONB,
    "status" "processing_status" NOT NULL DEFAULT 'DRAFT',
    "record_source" "record_source" NOT NULL DEFAULT 'AI',
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "entity_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aliases" (
    "id" UUID NOT NULL,
    "entity_id" UUID,
    "book_id" UUID NOT NULL,
    "alias" TEXT NOT NULL,
    "alias_type" "alias_type" NOT NULL,
    "resolved_name" TEXT,
    "evidence" TEXT,
    "chapter_start" INTEGER,
    "chapter_end" INTEGER,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "alias_status" NOT NULL DEFAULT 'PENDING',
    "record_source" "record_source" NOT NULL DEFAULT 'DRAFT_AI',
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentions" (
    "id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "raw_text" TEXT NOT NULL,
    "para_index" INTEGER,
    "record_source" "record_source" NOT NULL DEFAULT 'AI',
    "status" "processing_status" NOT NULL DEFAULT 'DRAFT',
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facts" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "fact_type" "fact_type" NOT NULL DEFAULT 'GENERIC',
    "source_entity_id" UUID,
    "target_entity_id" UUID,
    "relationship_type_code" VARCHAR(120),
    "event_category" "event_category",
    "virtual_year" TEXT,
    "location" TEXT,
    "title" TEXT,
    "attitude_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidence" TEXT NOT NULL,
    "chapter_id" UUID NOT NULL,
    "chapter_no" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "record_source" "record_source" NOT NULL DEFAULT 'DRAFT_AI',
    "status" "processing_status" NOT NULL DEFAULT 'DRAFT',
    "job_id" UUID,
    "agent_run_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "reviewed_by" UUID,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationships" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "source_entity_id" UUID NOT NULL,
    "target_entity_id" UUID NOT NULL,
    "relationship_type_code" VARCHAR(120) NOT NULL,
    "fact_count" INTEGER NOT NULL DEFAULT 0,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "attitude_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "summary" TEXT,
    "first_chapter_id" UUID,
    "first_chapter_no" INTEGER,
    "latest_chapter_id" UUID,
    "latest_chapter_no" INTEGER,
    "status" "processing_status" NOT NULL DEFAULT 'DRAFT',
    "last_aggregated_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skills" (
    "id" UUID NOT NULL,
    "slug" VARCHAR(120) NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "description" TEXT,
    "category" "skill_category" NOT NULL DEFAULT 'HYBRID',
    "scope" TEXT NOT NULL DEFAULT 'GLOBAL',
    "status" "skill_status" NOT NULL DEFAULT 'DRAFT',
    "source" "skill_source" NOT NULL DEFAULT 'MANUAL',
    "generated_from_job_id" UUID,
    "generated_from_book_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_builtin" BOOLEAN NOT NULL DEFAULT false,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "skill_versions" (
    "id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "version_no" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "is_baseline" BOOLEAN NOT NULL DEFAULT false,
    "change_note" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_jobs" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "status" "analysis_job_status" NOT NULL DEFAULT 'QUEUED',
    "scope" TEXT NOT NULL DEFAULT 'FULL_BOOK',
    "chapter_start" INTEGER,
    "chapter_end" INTEGER,
    "chapter_indices" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "error_log" TEXT,
    "override_strategy" TEXT,
    "keep_history" BOOLEAN NOT NULL DEFAULT false,
    "skills_snapshot" JSONB,
    "relationship_types_snapshot" JSONB,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" UUID NOT NULL,
    "job_id" UUID,
    "book_id" UUID,
    "run_type" "agent_run_type" NOT NULL,
    "model_id" UUID,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "usage" JSONB,
    "skills_loaded" JSONB,
    "error_log" TEXT,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_write_audits" (
    "id" UUID NOT NULL,
    "agent_run_id" UUID NOT NULL,
    "step_index" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "object_type" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "allowed" BOOLEAN NOT NULL DEFAULT true,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_write_audits_pkey" PRIMARY KEY ("id")
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
    "source_entity_id" UUID NOT NULL,
    "target_entity_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidence_refs" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ(6),

    CONSTRAINT "merge_suggestions_pkey" PRIMARY KEY ("id")
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

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_is_active_idx" ON "users"("is_active");

-- CreateIndex
CREATE INDEX "ai_models_provider_enabled_idx" ON "ai_models"("provider", "is_enabled");

-- CreateIndex
CREATE UNIQUE INDEX "ai_models_unique_endpoint" ON "ai_models"("provider", "model_id", "base_url");

-- CreateIndex
CREATE UNIQUE INDEX "ai_models_alias_key_uniq" ON "ai_models"("alias_key");

-- CreateIndex
CREATE INDEX "books_deleted_at_idx" ON "books"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_book_type_no_key" ON "chapters"("book_id", "type", "no");

-- CreateIndex
CREATE INDEX "chapter_bio_verifications_book_idx" ON "chapter_biography_verifications"("book_id");

-- CreateIndex
CREATE UNIQUE INDEX "chapter_bio_verifications_book_chapter_key" ON "chapter_biography_verifications"("book_id", "chapter_id");

-- CreateIndex
CREATE INDEX "entities_name_idx" ON "entities"("name");

-- CreateIndex
CREATE INDEX "entities_type_deleted_idx" ON "entities"("entity_type", "deleted_at");

-- CreateIndex
CREATE INDEX "entities_deleted_at_idx" ON "entities"("deleted_at");

-- CreateIndex
CREATE INDEX "entities_name_trgm_idx" ON "entities" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "entities_aliases_idx" ON "entities" USING GIN ("aliases");

-- CreateIndex
CREATE INDEX "entities_global_tags_idx" ON "entities" USING GIN ("global_tags");

-- CreateIndex
CREATE INDEX "entity_profiles_book_deleted_idx" ON "entity_profiles"("book_id", "deleted_at");

-- CreateIndex
CREATE INDEX "entity_profiles_first_appearance_chapter_idx" ON "entity_profiles"("first_appearance_chapter_id");

-- CreateIndex
CREATE UNIQUE INDEX "entity_profiles_entity_book_key" ON "entity_profiles"("entity_id", "book_id");

-- CreateIndex
CREATE INDEX "aliases_book_alias_idx" ON "aliases"("book_id", "alias");

-- CreateIndex
CREATE INDEX "aliases_book_entity_idx" ON "aliases"("book_id", "entity_id");

-- CreateIndex
CREATE INDEX "aliases_status_idx" ON "aliases"("status");

-- CreateIndex
CREATE INDEX "mentions_chapter_idx" ON "mentions"("chapter_id");

-- CreateIndex
CREATE INDEX "mentions_entity_chapter_idx" ON "mentions"("entity_id", "chapter_id");

-- CreateIndex
CREATE INDEX "mentions_status_idx" ON "mentions"("status");

-- CreateIndex
CREATE INDEX "facts_book_chapter_idx" ON "facts"("book_id", "chapter_id");

-- CreateIndex
CREATE INDEX "facts_book_source_idx" ON "facts"("book_id", "source_entity_id");

-- CreateIndex
CREATE INDEX "facts_book_target_idx" ON "facts"("book_id", "target_entity_id");

-- CreateIndex
CREATE INDEX "facts_type_status_idx" ON "facts"("fact_type", "status");

-- CreateIndex
CREATE INDEX "facts_book_reltype_idx" ON "facts"("book_id", "relationship_type_code");

-- CreateIndex
CREATE INDEX "facts_book_category_year_idx" ON "facts"("book_id", "event_category", "virtual_year");

-- CreateIndex
CREATE INDEX "facts_review_query_idx" ON "facts"("status", "record_source", "chapter_id");

-- CreateIndex
CREATE INDEX "facts_payload_idx" ON "facts" USING GIN ("payload");

-- CreateIndex
CREATE INDEX "relationships_book_status_deleted_idx" ON "relationships"("book_id", "status", "deleted_at");

-- CreateIndex
CREATE INDEX "relationships_src_tgt_idx" ON "relationships"("source_entity_id", "target_entity_id");

-- CreateIndex
CREATE INDEX "relationships_reltype_idx" ON "relationships"("relationship_type_code");

-- CreateIndex
CREATE UNIQUE INDEX "relationships_book_src_tgt_type_key" ON "relationships"("book_id", "source_entity_id", "target_entity_id", "relationship_type_code");

-- CreateIndex
CREATE UNIQUE INDEX "skills_slug_key" ON "skills"("slug");

-- CreateIndex
CREATE INDEX "skills_category_status_idx" ON "skills"("category", "status");

-- CreateIndex
CREATE INDEX "skills_status_sort_idx" ON "skills"("status", "sort_order");

-- CreateIndex
CREATE INDEX "skill_versions_active_idx" ON "skill_versions"("skill_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "skill_versions_skill_version_key" ON "skill_versions"("skill_id", "version_no");

-- CreateIndex
CREATE INDEX "analysis_jobs_book_created_idx" ON "analysis_jobs"("book_id", "created_at");

-- CreateIndex
CREATE INDEX "analysis_jobs_status_created_idx" ON "analysis_jobs"("status", "created_at");

-- CreateIndex
CREATE INDEX "agent_runs_book_created_idx" ON "agent_runs"("book_id", "created_at");

-- CreateIndex
CREATE INDEX "agent_runs_job_idx" ON "agent_runs"("job_id");

-- CreateIndex
CREATE INDEX "agent_write_audits_run_idx" ON "agent_write_audits"("agent_run_id");

-- CreateIndex
CREATE INDEX "agent_write_audits_object_idx" ON "agent_write_audits"("object_type", "object_id");

-- CreateIndex
CREATE INDEX "validation_book_idx" ON "validation_reports"("book_id");

-- CreateIndex
CREATE INDEX "validation_book_chapter_idx" ON "validation_reports"("book_id", "chapter_id");

-- CreateIndex
CREATE INDEX "validation_job_idx" ON "validation_reports"("job_id");

-- CreateIndex
CREATE INDEX "merge_suggestions_book_status_idx" ON "merge_suggestions"("book_id", "status");

-- CreateIndex
CREATE INDEX "merge_suggestions_source_idx" ON "merge_suggestions"("source_entity_id");

-- CreateIndex
CREATE INDEX "merge_suggestions_target_idx" ON "merge_suggestions"("target_entity_id");

-- CreateIndex
CREATE INDEX "analysis_phase_logs_job_stage_idx" ON "analysis_phase_logs"("job_id", "stage");

-- CreateIndex
CREATE INDEX "analysis_phase_logs_model_idx" ON "analysis_phase_logs"("model_id");

-- CreateIndex
CREATE INDEX "analysis_phase_logs_created_at_idx" ON "analysis_phase_logs"("created_at");

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_biography_verifications" ADD CONSTRAINT "chapter_biography_verifications_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_biography_verifications" ADD CONSTRAINT "chapter_biography_verifications_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_profiles" ADD CONSTRAINT "entity_profiles_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_profiles" ADD CONSTRAINT "entity_profiles_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_profiles" ADD CONSTRAINT "entity_profiles_first_appearance_chapter_id_fkey" FOREIGN KEY ("first_appearance_chapter_id") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aliases" ADD CONSTRAINT "aliases_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aliases" ADD CONSTRAINT "aliases_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facts" ADD CONSTRAINT "facts_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facts" ADD CONSTRAINT "facts_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facts" ADD CONSTRAINT "facts_source_entity_id_fkey" FOREIGN KEY ("source_entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facts" ADD CONSTRAINT "facts_target_entity_id_fkey" FOREIGN KEY ("target_entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facts" ADD CONSTRAINT "facts_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "analysis_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facts" ADD CONSTRAINT "facts_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_source_entity_id_fkey" FOREIGN KEY ("source_entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_target_entity_id_fkey" FOREIGN KEY ("target_entity_id") REFERENCES "entities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_first_chapter_id_fkey" FOREIGN KEY ("first_chapter_id") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_latest_chapter_id_fkey" FOREIGN KEY ("latest_chapter_id") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_versions" ADD CONSTRAINT "skill_versions_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "skills"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_jobs" ADD CONSTRAINT "analysis_jobs_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_runs" ADD CONSTRAINT "agent_runs_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ai_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_write_audits" ADD CONSTRAINT "agent_write_audits_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_reports" ADD CONSTRAINT "validation_reports_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_reports" ADD CONSTRAINT "validation_reports_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "analysis_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_suggestions" ADD CONSTRAINT "merge_suggestions_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_suggestions" ADD CONSTRAINT "merge_suggestions_source_entity_id_fkey" FOREIGN KEY ("source_entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_suggestions" ADD CONSTRAINT "merge_suggestions_target_entity_id_fkey" FOREIGN KEY ("target_entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_phase_logs" ADD CONSTRAINT "analysis_phase_logs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "analysis_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_phase_logs" ADD CONSTRAINT "analysis_phase_logs_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "ai_models"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_phase_logs" ADD CONSTRAINT "analysis_phase_logs_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

