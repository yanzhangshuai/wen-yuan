-- CreateTable
CREATE TABLE "extraction_rules" (
    "id" UUID NOT NULL,
    "rule_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "book_type_id" UUID,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "change_note" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "extraction_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "extraction_rules_rule_type_is_active_sort_order_idx" ON "extraction_rules"("rule_type", "is_active", "sort_order");

-- CreateIndex
CREATE INDEX "extraction_rules_book_type_id_idx" ON "extraction_rules"("book_type_id");

-- AddForeignKey
ALTER TABLE "extraction_rules" ADD CONSTRAINT "extraction_rules_book_type_id_fkey" FOREIGN KEY ("book_type_id") REFERENCES "book_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DataMigration: 从 ner_lexicon_rules 迁移数据
INSERT INTO "extraction_rules" ("id", "rule_type", "content", "book_type_id", "sort_order", "is_active", "source", "change_note", "created_at", "updated_at")
SELECT "id", "rule_type", "content", "book_type_id", "sort_order", "is_active", "source", "change_note", "created_at", "updated_at"
FROM "ner_lexicon_rules"
ON CONFLICT DO NOTHING;

-- DataMigration: 从 prompt_extraction_rules 迁移数据
INSERT INTO "extraction_rules" ("id", "rule_type", "content", "book_type_id", "sort_order", "is_active", "source", "change_note", "created_at", "updated_at")
SELECT "id", "rule_type", "content", "book_type_id", "sort_order", "is_active", "source", "change_note", "created_at", "updated_at"
FROM "prompt_extraction_rules"
ON CONFLICT DO NOTHING;
