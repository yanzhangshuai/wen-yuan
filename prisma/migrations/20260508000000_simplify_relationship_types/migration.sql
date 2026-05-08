-- DropTable
DROP TABLE IF EXISTS "relationship_events" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "unknown_relationship_type_drafts" CASCADE;

-- DropTable
DROP TABLE IF EXISTS "unknown_relationship_type_occurrences" CASCADE;

-- AlterTable
ALTER TABLE "relationships"
  ADD COLUMN "chapter_id" UUID,
  ADD COLUMN "chapter_no" INTEGER,
  ADD COLUMN "evidence" TEXT,
  ADD COLUMN "summary" TEXT,
  ADD COLUMN "attitude_tags" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "relationships_book_chapter_idx" ON "relationships"("book_id", "chapter_id");

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE SET NULL ON UPDATE CASCADE;
