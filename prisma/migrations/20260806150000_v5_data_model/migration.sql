-- CreateEnum
CREATE TYPE "relation_direction" AS ENUM ('INVERSE', 'SYMMETRIC');

-- AlterEnum
BEGIN;
CREATE TYPE "agent_run_type_new" AS ENUM ('PRESCAN', 'IDENTITY', 'EXTRACTION', 'RECONCILE', 'VALIDATION', 'CROSS_VALIDATION', 'SKILL_GENERATION');
ALTER TABLE "agent_runs" ALTER COLUMN "run_type" TYPE "agent_run_type_new" USING ("run_type"::text::"agent_run_type_new");
ALTER TYPE "agent_run_type" RENAME TO "agent_run_type_old";
ALTER TYPE "agent_run_type_new" RENAME TO "agent_run_type";
DROP TYPE "public"."agent_run_type_old";
COMMIT;

-- AlterEnum
ALTER TYPE "record_source" ADD VALUE 'AUTO_VERIFIED';

-- DropForeignKey
ALTER TABLE "agent_steps" DROP CONSTRAINT "agent_steps_agent_run_id_fkey";

-- DropIndex

-- AlterTable
ALTER TABLE "analysis_jobs" ADD COLUMN     "relationship_types_snapshot" JSONB;

-- DropTable
DROP TABLE "agent_steps";

-- DropEnum
DROP TYPE "agent_step_kind";

-- CreateTable
CREATE TABLE "relationship_types" (
    "id" UUID NOT NULL,
    "code" VARCHAR(60) NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "direction" "relation_direction" NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "book_type_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "relationship_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "relationship_types_booktype_active_idx" ON "relationship_types"("book_type_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "relationship_types_code_booktype_key" ON "relationship_types"("code", "book_type_id");

-- AddForeignKey
ALTER TABLE "relationship_types" ADD CONSTRAINT "relationship_types_book_type_id_fkey" FOREIGN KEY ("book_type_id") REFERENCES "book_types"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Prisma 无法建模的 HNSW 索引（pgvector），原生 SQL 管理，幂等重建
CREATE INDEX IF NOT EXISTS "text_chunks_embedding_idx" ON "text_chunks" USING hnsw ("embedding" vector_cosine_ops);
