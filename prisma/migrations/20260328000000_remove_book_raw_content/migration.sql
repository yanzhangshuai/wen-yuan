-- AlterTable
-- 移除 books.raw_content 字段（原始文本现由对象存储 sourceFileKey/sourceFileUrl 承载）
ALTER TABLE "books" DROP COLUMN IF EXISTS "raw_content";
