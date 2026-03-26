-- AlterTable
ALTER TABLE "analysis_jobs" ADD COLUMN     "keep_history" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "override_strategy" TEXT;

-- AlterTable
ALTER TABLE "books" ADD COLUMN     "deleted_at" TIMESTAMPTZ(6);

-- AlterTable
ALTER TABLE "mentions" ADD COLUMN     "record_source" "record_source" NOT NULL DEFAULT 'AI';

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
CREATE INDEX "merge_suggestions_book_status_idx" ON "merge_suggestions"("book_id", "status");

-- CreateIndex
CREATE INDEX "merge_suggestions_source_persona_idx" ON "merge_suggestions"("source_persona_id");

-- CreateIndex
CREATE INDEX "merge_suggestions_target_persona_idx" ON "merge_suggestions"("target_persona_id");

-- CreateIndex
CREATE INDEX "books_deleted_at_idx" ON "books"("deleted_at");

-- AddForeignKey
ALTER TABLE "merge_suggestions" ADD CONSTRAINT "merge_suggestions_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_suggestions" ADD CONSTRAINT "merge_suggestions_source_persona_id_fkey" FOREIGN KEY ("source_persona_id") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merge_suggestions" ADD CONSTRAINT "merge_suggestions_target_persona_id_fkey" FOREIGN KEY ("target_persona_id") REFERENCES "personas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
