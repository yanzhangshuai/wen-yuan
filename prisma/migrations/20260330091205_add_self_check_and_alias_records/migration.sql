-- CreateEnum
CREATE TYPE "alias_status" AS ENUM ('CONFIRMED', 'PENDING', 'REJECTED');

-- CreateEnum
CREATE TYPE "correction_status" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'DEFERRED');

-- CreateTable
CREATE TABLE "chapter_self_check_reports" (
    "id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "overall_score" DOUBLE PRECISION NOT NULL,
    "issue_count" INTEGER NOT NULL,
    "issues" JSONB NOT NULL DEFAULT '[]',
    "checked_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chapter_self_check_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "persona_alias_records" (
    "id" UUID NOT NULL,
    "persona_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "surface_form" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "alias_status" NOT NULL DEFAULT 'PENDING',
    "candidate_name" TEXT,
    "inferred_from" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "context_chapters" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "evidence" TEXT NOT NULL DEFAULT '',
    "resolved_at" TIMESTAMPTZ(6),
    "resolved_by" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "persona_alias_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "self_check_corrections" (
    "id" UUID NOT NULL,
    "report_id" UUID NOT NULL,
    "issue_index" INTEGER NOT NULL,
    "issue_type" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "correction_status" NOT NULL DEFAULT 'PENDING',
    "applied_at" TIMESTAMPTZ(6),
    "applied_by" UUID,
    "result" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "self_check_corrections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "self_check_reports_book_checked_idx" ON "chapter_self_check_reports"("book_id", "checked_at");

-- CreateIndex
CREATE INDEX "self_check_reports_chapter_idx" ON "chapter_self_check_reports"("chapter_id");

-- CreateIndex
CREATE INDEX "alias_records_book_status_idx" ON "persona_alias_records"("book_id", "status");

-- CreateIndex
CREATE INDEX "alias_records_persona_book_idx" ON "persona_alias_records"("persona_id", "book_id");

-- CreateIndex
CREATE INDEX "self_check_corrections_report_status_idx" ON "self_check_corrections"("report_id", "status");

-- AddForeignKey
ALTER TABLE "chapter_self_check_reports" ADD CONSTRAINT "chapter_self_check_reports_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chapter_self_check_reports" ADD CONSTRAINT "chapter_self_check_reports_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persona_alias_records" ADD CONSTRAINT "persona_alias_records_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "persona_alias_records" ADD CONSTRAINT "persona_alias_records_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "self_check_corrections" ADD CONSTRAINT "self_check_corrections_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "chapter_self_check_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

