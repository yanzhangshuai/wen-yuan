import { PrismaPg } from "@prisma/adapter-pg";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient, SkillCategory, SkillStatus } from "../src/generated/prisma/client.ts";
import { serializeSkillFrontmatter } from "../src/server/modules/skills/content-schema.ts";

/**
 * =============================================================================
 * 书型知识迁移：把 book-types.init.json 的旧 knowledgePacks（人物别名包）
 * 迁移为 Skill（knowledge.aliasPack），并挂载到对应书型。
 * 幂等：按 slug upsert。
 * =============================================================================
 */

const connectionString = process.env.DATABASE_URL ?? "postgresql://plotweaver:plotweaver@127.0.0.1:5432/wen_yuan?schema=public";

interface KnowledgePack {
  name   : string;
  entries: Array<{ canonicalName: string; aliases: string[] }>;
}

interface BookTypeSeed {
  key           : string;
  name          : string;
  knowledgePacks?: KnowledgePack[];
}

function loadBookTypes(): BookTypeSeed[] {
  const initPath = resolve(process.cwd(), "data/knowledge-base/book-types.init.json");
  if (!existsSync(initPath)) {
    return [];
  }
  const raw = JSON.parse(readFileSync(initPath, "utf8")) as { bookTypes?: BookTypeSeed[] };
  return Array.isArray(raw.bookTypes) ? raw.bookTypes : [];
}

/** 由书型知识包生成 alias-pack skill 的 MD 内容。 */
function buildAliasPackMd(bookTypeName: string, entries: KnowledgePack["entries"]): string {
  const rows = entries
    .map((entry) => `| ${entry.canonicalName} | ${entry.aliases.join("、")} |`)
    .join("\n");

  return [
    serializeSkillFrontmatter({ kind: "ALIAS_PACK", triggers: { priority: 500 } }),
    "",
    `# ${bookTypeName} 人物别名库`,
    "",
    "> 由 book-types.init.json 的 knowledgePacks 迁移而来，用于实体消歧，避免同一人物被重复建档。",
    "",
    "## 人物别名表",
    "",
    "| 规范名 | 别名 |",
    "|--------|------|",
    rows
  ].join("\n");
}

/** 供 seed.ts 复用：幂等迁移书型知识包为 skill。 */
export async function seedBookTypeSkills(prisma: PrismaClient): Promise<number> {
  const bookTypes = loadBookTypes();
  let createdCount = 0;

  for (const bookType of bookTypes) {
    if (!bookType.key || !bookType.knowledgePacks || bookType.knowledgePacks.length === 0) {
      continue;
    }

    const entries = bookType.knowledgePacks.flatMap((pack) => pack.entries ?? []);
    if (entries.length === 0) {
      continue;
    }

    const slug = `alias-${bookType.key}`;
    const existing = await prisma.skill.findUnique({
      where: { slug },
      select: { id: true }
    });

    if (existing) {
      console.log(`⏭ 书型技能已存在，跳过: ${slug}`);
      continue;
    }

    const bookTypeRow = await prisma.bookType.findUnique({
      where : { key: bookType.key },
      select: { id: true }
    });

    const content = buildAliasPackMd(bookType.name ?? bookType.key, entries);
    const skill = await prisma.skill.create({
      data: {
        slug        : slug,
        name        : `${bookType.name ?? bookType.key} 人物别名库`,
        description : `由旧 knowledgePacks 迁移：${entries.length} 个人物别名映射。`,
        category    : SkillCategory.ALIAS_PACK,
        scope       : "BOOK_TYPE",
        status      : SkillStatus.ACTIVE,
        source      : "MANUAL",
        isBuiltin   : true,
        versions    : {
          create: {
            versionNo : 1,
            content   : content,
            isActive  : true,
            isBaseline: true
          }
        }
      },
      select: { id: true, slug: true }
    });

    if (bookTypeRow) {
      await prisma.bookTypeSkill.upsert({
        where : { bookTypeId_skillId: { bookTypeId: bookTypeRow.id, skillId: skill.id } },
        update: { priority: 500, isEnabled: true },
        create: { bookTypeId: bookTypeRow.id, skillId: skill.id, priority: 500, isEnabled: true }
      });
    }

    createdCount += 1;
    console.log(`✅ 书型技能已创建: ${skill.slug}（${entries.length} 条别名）`);
  }

  return createdCount;
}

async function main() {
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  const count = await seedBookTypeSkills(prisma);
  await prisma.$disconnect();
  console.log(`🎉 书型知识迁移完成，新建 ${count} 个技能`);
}

const isMainModule = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMainModule) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
