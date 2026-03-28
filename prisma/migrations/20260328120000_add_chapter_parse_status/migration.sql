-- AlterTable: add parse_status column to chapters for per-chapter analysis progress tracking
ALTER TABLE "chapters" ADD COLUMN "parse_status" VARCHAR(20) NOT NULL DEFAULT 'PENDING';
