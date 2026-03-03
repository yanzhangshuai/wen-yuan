-- CreateEnum
CREATE TYPE "processing_status" AS ENUM ('DRAFT', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "persona_type" AS ENUM ('PERSON', 'LOCATION', 'ORGANIZATION', 'CONCEPT');

-- CreateEnum
CREATE TYPE "bio_category" AS ENUM ('BIRTH', 'EXAM', 'CAREER', 'TRAVEL', 'SOCIAL', 'DEATH', 'EVENT');

-- CreateEnum
CREATE TYPE "chapter_type" AS ENUM ('PRELUDE', 'CHAPTER', 'POSTLUDE');

-- CreateTable
CREATE TABLE "books" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "dynasty" TEXT,
    "description" TEXT,
    "cover_url" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error_log" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chapters" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "type" "chapter_type" NOT NULL DEFAULT 'CHAPTER',
    "no" INTEGER NOT NULL,
    "unit" TEXT NOT NULL DEFAULT '回',
    "no_text" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_abstract" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "chapters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personas" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "persona_type" NOT NULL DEFAULT 'PERSON',
    "gender" TEXT,
    "birth_year" TEXT,
    "death_year" TEXT,
    "global_tags" TEXT[],
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "personas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "profiles" (
    "id" UUID NOT NULL,
    "persona_id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "local_name" TEXT NOT NULL,
    "local_summary" TEXT,
    "irony_index" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "moral_tier" TEXT,
    "visual_config" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "biography_records" (
    "id" UUID NOT NULL,
    "persona_id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "chapter_no" INTEGER NOT NULL,
    "category" "bio_category" NOT NULL DEFAULT 'EVENT',
    "title" TEXT,
    "location" TEXT,
    "event" TEXT NOT NULL,
    "virtual_year" TEXT,
    "irony_note" TEXT,
    "status" "processing_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "biography_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mentions" (
    "id" UUID NOT NULL,
    "persona_id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "raw_text" TEXT NOT NULL,
    "summary" TEXT,
    "para_index" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mentions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relationships" (
    "id" UUID NOT NULL,
    "chapter_id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "target_id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "description" TEXT,
    "status" "processing_status" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "relationships_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "chapter_book_type_no_key" ON "chapters"("book_id", "type", "no");

-- CreateIndex
CREATE INDEX "persona_name_idx" ON "personas"("name");

-- CreateIndex
CREATE UNIQUE INDEX "profile_persona_id_book_id_key" ON "profiles"("persona_id", "book_id");

-- CreateIndex
CREATE INDEX "biography_record_chapter_no_idx" ON "biography_records"("chapter_no");

-- CreateIndex
CREATE INDEX "biography_record_persona_id_idx" ON "biography_records"("persona_id");

-- CreateIndex
CREATE INDEX "mentions_chapter_id_idx" ON "mentions"("chapter_id");

-- CreateIndex
CREATE INDEX "mention_persona_id_chapter_id_idx" ON "mentions"("persona_id", "chapter_id");

-- CreateIndex
CREATE INDEX "relationships_source_id_target_id_idx" ON "relationships"("source_id", "target_id");

-- AddForeignKey
ALTER TABLE "chapters" ADD CONSTRAINT "chapters_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biography_records" ADD CONSTRAINT "biography_records_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "biography_records" ADD CONSTRAINT "biography_records_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_persona_id_fkey" FOREIGN KEY ("persona_id") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_chapter_id_fkey" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relationships" ADD CONSTRAINT "relationships_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "personas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
