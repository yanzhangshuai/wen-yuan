-- DropForeignKey
ALTER TABLE "relationships" DROP CONSTRAINT "relationships_relationship_type_code_fkey";

-- AlterTable
ALTER TABLE "relationship_type_definitions" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "relationships" ALTER COLUMN "relationship_type_code" SET DATA TYPE TEXT;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_relationship_type_code_fkey" FOREIGN KEY ("relationship_type_code") REFERENCES "relationship_type_definitions"("code") ON DELETE SET NULL ON UPDATE CASCADE;
