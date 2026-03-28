-- AlterTable: add chapter_indices column to analysis_jobs
ALTER TABLE "analysis_jobs" ADD COLUMN "chapter_indices" integer[] NOT NULL DEFAULT '{}';
