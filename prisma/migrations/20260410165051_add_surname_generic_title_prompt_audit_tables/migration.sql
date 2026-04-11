-- CreateTable
CREATE TABLE "surname_entries" (
    "id" UUID NOT NULL,
    "surname" TEXT NOT NULL,
    "is_compound" BOOLEAN NOT NULL DEFAULT false,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "book_type_id" UUID,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "surname_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generic_title_entries" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "tier" TEXT NOT NULL DEFAULT 'DEFAULT',
    "exempt_in_genres" JSONB,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "generic_title_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_templates" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "code_ref" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "active_version_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "prompt_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prompt_template_versions" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "system_prompt" TEXT NOT NULL,
    "user_prompt" TEXT NOT NULL,
    "genre_key" TEXT,
    "change_note" TEXT,
    "created_by" TEXT,
    "is_baseline" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prompt_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "extraction_rules" (
    "id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "rule_type" TEXT NOT NULL DEFAULT 'ENTITY',
    "content" TEXT NOT NULL,
    "genre_key" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "change_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "extraction_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_audit_logs" (
    "id" UUID NOT NULL,
    "object_type" TEXT NOT NULL,
    "object_id" TEXT NOT NULL,
    "object_name" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "operator_id" TEXT,
    "operator_note" TEXT,
    "related_book_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "knowledge_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "surname_entries_surname_key" ON "surname_entries"("surname");

-- CreateIndex
CREATE INDEX "surname_compound_priority_idx" ON "surname_entries"("is_compound", "priority");

-- CreateIndex
CREATE INDEX "surname_active_idx" ON "surname_entries"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "generic_title_entries_title_key" ON "generic_title_entries"("title");

-- CreateIndex
CREATE INDEX "generic_titles_tier_idx" ON "generic_title_entries"("tier", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_slug_key" ON "prompt_templates"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "prompt_templates_active_version_id_key" ON "prompt_templates"("active_version_id");

-- CreateIndex
CREATE INDEX "prompt_versions_template_created_idx" ON "prompt_template_versions"("template_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "prompt_version_unique" ON "prompt_template_versions"("template_id", "versionNo");

-- CreateIndex
CREATE INDEX "extraction_rules_type_active_idx" ON "extraction_rules"("rule_type", "is_active", "sort_order");

-- CreateIndex
CREATE INDEX "extraction_rules_genre_idx" ON "extraction_rules"("genre_key");

-- CreateIndex
CREATE INDEX "audit_log_object_idx" ON "knowledge_audit_logs"("object_type", "object_id");

-- CreateIndex
CREATE INDEX "audit_log_created_idx" ON "knowledge_audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "audit_log_operator_idx" ON "knowledge_audit_logs"("operator_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "surname_entries" ADD CONSTRAINT "surname_entries_book_type_id_fkey" FOREIGN KEY ("book_type_id") REFERENCES "book_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_template_versions" ADD CONSTRAINT "prompt_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "prompt_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
