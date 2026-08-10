-- DropIndex
DROP INDEX "skills_status_sort_idx";

-- AlterTable
ALTER TABLE "skills" DROP COLUMN "sort_order";

-- CreateIndex
CREATE INDEX "skills_status_idx" ON "skills"("status");
