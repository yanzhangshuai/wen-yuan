-- 1. 新增 content 列（可空，先回填数据）
ALTER TABLE "skills" ADD COLUMN "content" TEXT;

-- 2. 回填 content：取每个 skill 激活版内容（无激活版取最新版）
UPDATE "skills" s
SET "content" = sub.content
FROM (
  SELECT DISTINCT ON (skill_id) skill_id, content
  FROM "skill_versions"
  ORDER BY skill_id, is_active DESC, version_no DESC
) sub
WHERE sub.skill_id = s.id;

-- 3. 无任何版本的 skill 给占位内容（防御）
UPDATE "skills" SET "content" = '---
kind: HYBRID
---

' WHERE "content" IS NULL;

-- 4. content 非空约束
ALTER TABLE "skills" ALTER COLUMN "content" SET NOT NULL;

-- 5. status 枚举转换：DRAFT/ACTIVE/DISABLED/ARCHIVED -> ENABLED/DISABLED（ACTIVE 映射 ENABLED，其余映射 DISABLED）
ALTER TABLE "skills" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "skills" ALTER COLUMN "status" TYPE TEXT;
UPDATE "skills" SET "status" = CASE WHEN "status" = 'ACTIVE' THEN 'ENABLED' ELSE 'DISABLED' END;
CREATE TYPE "skill_status_new" AS ENUM ('ENABLED', 'DISABLED');
ALTER TABLE "skills" ALTER COLUMN "status" TYPE "skill_status_new" USING ("status"::"skill_status_new");
DROP TYPE "skill_status";
ALTER TYPE "skill_status_new" RENAME TO "skill_status";
ALTER TABLE "skills" ALTER COLUMN "status" SET DEFAULT 'ENABLED';

-- 6. 删除冗余列
ALTER TABLE "skills"
  DROP COLUMN "source",
  DROP COLUMN "is_enabled",
  DROP COLUMN "is_builtin",
  DROP COLUMN "generated_from_job_id",
  DROP COLUMN "generated_from_book_id";

-- 7. 删除版本表与来源枚举
DROP TABLE "skill_versions";
DROP TYPE "skill_source";
