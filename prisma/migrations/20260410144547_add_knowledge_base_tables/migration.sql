-- AlterTable
ALTER TABLE "books" ADD COLUMN     "book_type_id" UUID;

-- CreateTable
CREATE TABLE "book_types" (
    "id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "preset_config" JSONB,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "book_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_packs" (
    "id" UUID NOT NULL,
    "book_type_id" UUID,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "scope" TEXT NOT NULL DEFAULT 'GENRE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "knowledge_packs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_entries" (
    "id" UUID NOT NULL,
    "pack_id" UUID NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "entry_type" TEXT NOT NULL DEFAULT 'CHARACTER',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "source_detail" TEXT,
    "review_status" TEXT NOT NULL DEFAULT 'PENDING',
    "review_note" TEXT,
    "reviewed_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "knowledge_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "book_knowledge_packs" (
    "id" UUID NOT NULL,
    "book_id" UUID NOT NULL,
    "pack_id" UUID NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "book_knowledge_packs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "book_types_key_key" ON "book_types"("key");

-- CreateIndex
CREATE INDEX "book_types_key_idx" ON "book_types"("key");

-- CreateIndex
CREATE INDEX "book_types_active_sort_idx" ON "book_types"("is_active", "sort_order");

-- CreateIndex
CREATE INDEX "knowledge_packs_book_type_active_idx" ON "knowledge_packs"("book_type_id", "is_active");

-- CreateIndex
CREATE INDEX "knowledge_packs_scope_idx" ON "knowledge_packs"("scope");

-- CreateIndex
CREATE INDEX "knowledge_entries_pack_review_idx" ON "knowledge_entries"("pack_id", "review_status");

-- CreateIndex
CREATE INDEX "knowledge_entries_canonical_name_idx" ON "knowledge_entries"("canonical_name");

-- CreateIndex
CREATE INDEX "book_knowledge_packs_book_id_idx" ON "book_knowledge_packs"("book_id");

-- CreateIndex
CREATE UNIQUE INDEX "book_knowledge_pack_unique" ON "book_knowledge_packs"("book_id", "pack_id");

-- AddForeignKey
ALTER TABLE "books" ADD CONSTRAINT "books_book_type_id_fkey" FOREIGN KEY ("book_type_id") REFERENCES "book_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_packs" ADD CONSTRAINT "knowledge_packs_book_type_id_fkey" FOREIGN KEY ("book_type_id") REFERENCES "book_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "knowledge_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_knowledge_packs" ADD CONSTRAINT "book_knowledge_packs_book_id_fkey" FOREIGN KEY ("book_id") REFERENCES "books"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "book_knowledge_packs" ADD CONSTRAINT "book_knowledge_packs_pack_id_fkey" FOREIGN KEY ("pack_id") REFERENCES "knowledge_packs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
