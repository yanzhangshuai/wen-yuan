/*
  Warnings:

  - You are about to drop the `chapter_self_check_reports` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `persona_alias_records` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `self_check_corrections` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "alias_type" AS ENUM ('TITLE', 'POSITION', 'KINSHIP', 'NICKNAME', 'COURTESY_NAME');

-- CreateEnum
CREATE TYPE "alias_mapping_status" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- DropForeignKey
ALTER TABLE "chapter_self_check_reports" DROP CONSTRAINT "chapter_self_check_reports_book_id_fkey";

-- DropForeignKey
ALTER TABLE "chapter_self_check_reports" DROP CONSTRAINT "chapter_self_check_reports_chapter_id_fkey";

-- DropForeignKey
ALTER TABLE "persona_alias_records" DROP CONSTRAINT "persona_alias_records_book_id_fkey";

-- DropForeignKey
ALTER TABLE "persona_alias_records" DROP CONSTRAINT "persona_alias_records_persona_id_fkey";

-- DropForeignKey
ALTER TABLE "self_check_corrections" DROP CONSTRAINT "self_check_corrections_report_id_fkey";

-- DropTable
DROP TABLE "chapter_self_check_reports";

-- DropTable
DROP TABLE "persona_alias_records";

-- DropTable
DROP TABLE "self_check_corrections";

-- DropEnum
DROP TYPE "alias_status";

-- DropEnum
DROP TYPE "correction_status";

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

-- CreateIndex
CREATE INDEX "alias_book_idx" ON "alias_mappings"("book_id", "alias");

-- CreateIndex
CREATE INDEX "persona_book_idx" ON "alias_mappings"("book_id", "persona_id");

-- CreateIndex
CREATE INDEX "validation_book_idx" ON "validation_reports"("book_id");

-- CreateIndex
CREATE INDEX "validation_job_idx" ON "validation_reports"("job_id");

-- AddForeignKey
ALTER TABLE "alias_mappings" ADD CONSTRAINT "alias_mappings_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alias_mappings" ADD CONSTRAINT "alias_mappings_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_reports" ADD CONSTRAINT "validation_reports_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "validation_reports" ADD CONSTRAINT "validation_reports_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "analysis_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
