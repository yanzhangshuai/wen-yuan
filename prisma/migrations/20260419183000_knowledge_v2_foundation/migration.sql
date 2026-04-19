-- CreateEnum
CREATE TYPE "knowledge_scope_type" AS ENUM ('GLOBAL', 'BOOK_TYPE', 'BOOK', 'RUN');

-- CreateEnum
CREATE TYPE "knowledge_review_state" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED', 'DISABLED');

-- CreateEnum
CREATE TYPE "knowledge_source" AS ENUM ('SYSTEM_PRESET', 'MANUAL_ENTRY', 'CLAIM_PROMOTION', 'IMPORTED', 'LEGACY_SEED');

-- CreateTable
CREATE TABLE "knowledge_items" (
    "id" UUID NOT NULL,
    "scope_type" "knowledge_scope_type" NOT NULL,
    "scope_id" TEXT,
    "knowledge_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "source" "knowledge_source" NOT NULL,
    "review_state" "knowledge_review_state" NOT NULL DEFAULT 'PENDING',
    "confidence" DOUBLE PRECISION,
    "effective_from" JSONB,
    "effective_to" JSONB,
    "promoted_from_claim_id" UUID,
    "promoted_from_claim_family" TEXT,
    "supersedes_knowledge_id" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_user_id" UUID,
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "knowledge_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_items_type_scope_idx" ON "knowledge_items"("knowledge_type", "scope_type", "scope_id");

-- CreateIndex
CREATE INDEX "knowledge_items_review_scope_idx" ON "knowledge_items"("review_state", "scope_type", "scope_id");

-- CreateIndex
CREATE INDEX "knowledge_items_promoted_claim_idx" ON "knowledge_items"("promoted_from_claim_id");

-- CreateIndex
CREATE INDEX "knowledge_items_supersedes_idx" ON "knowledge_items"("supersedes_knowledge_id");

-- AddForeignKey
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_supersedes_knowledge_id_fkey" FOREIGN KEY ("supersedes_knowledge_id") REFERENCES "knowledge_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "knowledge_items"
  ADD CONSTRAINT "knowledge_items_scope_id_check"
  CHECK (
    ("scope_type" = 'GLOBAL' AND "scope_id" IS NULL)
    OR ("scope_type" <> 'GLOBAL' AND "scope_id" IS NOT NULL)
  );
