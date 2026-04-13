/*
  Warnings:

  - You are about to drop the column `genre` on the `books` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "books" DROP COLUMN "genre";

-- AlterTable
ALTER TABLE "generic_title_entries" ADD COLUMN     "category" VARCHAR(30),
ADD COLUMN     "exempt_in_books" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "historical_figure_entries" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "dynasty" VARCHAR(50),
    "category" VARCHAR(30) NOT NULL,
    "description" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "historical_figure_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relational_term_entries" (
    "id" UUID NOT NULL,
    "term" VARCHAR(20) NOT NULL,
    "category" VARCHAR(30) NOT NULL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "relational_term_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "name_pattern_rules" (
    "id" UUID NOT NULL,
    "rule_type" VARCHAR(30) NOT NULL,
    "pattern" VARCHAR(200) NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "description" TEXT,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "name_pattern_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "historical_figure_entries_name_idx" ON "historical_figure_entries"("name");

-- CreateIndex
CREATE INDEX "historical_figure_entries_category_verified_idx" ON "historical_figure_entries"("category", "is_verified");

-- CreateIndex
CREATE UNIQUE INDEX "relational_term_entries_term_key" ON "relational_term_entries"("term");

-- CreateIndex
CREATE INDEX "relational_term_entries_category_verified_idx" ON "relational_term_entries"("category", "is_verified");

-- CreateIndex
CREATE INDEX "name_pattern_rules_type_verified_idx" ON "name_pattern_rules"("rule_type", "is_verified");
