-- AlterTable: skill_versions.content 由 JSONB 改为 TEXT（存储 MD 文档）
ALTER TABLE "skill_versions" ALTER COLUMN "content" SET DATA TYPE TEXT USING "content"::text;
