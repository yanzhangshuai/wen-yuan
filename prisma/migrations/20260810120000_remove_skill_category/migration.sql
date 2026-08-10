-- DropIndex
DROP INDEX "skills_category_status_idx";

-- AlterTable
ALTER TABLE "skills" DROP COLUMN "category";

-- DropEnum
DROP TYPE "skill_category";
