-- 删除 SkillCategory 枚举中的 ALIAS_PACK 值（v4 知识库别名包概念已随 skill 化移除）。
-- 存量 5 条 alias-* 技能重新归类为 HYBRID（人物别名领域知识包）。

-- Step 1: 迁移存量数据
UPDATE "skills" SET "category" = 'HYBRID' WHERE "category" = 'ALIAS_PACK';

-- Step 2: 建新枚举 type（无 ALIAS_PACK）
CREATE TYPE "skill_category_new" AS ENUM ('SURNAME', 'GENERIC_TITLE', 'NAME_PATTERN', 'RELATIONSHIP_TYPE', 'HISTORICAL_FIGURE', 'TASK_INSTRUCTION', 'HYBRID');

-- Step 3: 改列类型（先转 text 再转新 type，规避枚举值不匹配）
ALTER TABLE "skills" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "skills" ALTER COLUMN "category" TYPE "skill_category_new" USING ("category"::text::"skill_category_new");
ALTER TABLE "skills" ALTER COLUMN "category" SET DEFAULT 'HYBRID'::"skill_category_new";

-- Step 4: 删旧 type，重命名新 type
DROP TYPE "skill_category";
ALTER TYPE "skill_category_new" RENAME TO "skill_category";
