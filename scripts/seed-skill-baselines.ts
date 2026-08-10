import { PrismaPg } from "@prisma/adapter-pg";
import { load as yamlLoad } from "js-yaml";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { PrismaClient, SkillStatus } from "../src/generated/prisma/client.ts";

/**
 * Skill 基线种子：读取 scripts/skills/*.md（skill = MD 文档，content 直存），
 * 解析 frontmatter 元数据 + 正文，幂等 upsert（存在则覆盖 content）。
 *
 * MD 文件即最终内容：人类可编辑、可 diff、无 JS→MD 转换层。
 */

const connectionString = process.env.DATABASE_URL ?? "postgresql://plotweaver:plotweaver@127.0.0.1:5432/wen_yuan?schema=public";
const SKILLS_DIR = resolve(process.cwd(), "scripts/skills");

/** 关系码契约（与 content-schema.ts 的 relationshipCodeSchema 对齐）。 */
const relationshipCodeSchema = z.object({
  code     : z.string(),
  direction: z.enum(["INVERSE", "SYMMETRIC"]),
  category : z.string(),
  aliases  : z.array(z.string()).default([])
});

/** .md frontmatter 元数据（seed 文件专用）。 */
const skillMdFrontmatterSchema = z.object({
  slug             : z.string(),
  name             : z.string(),
  description      : z.string(),
  scope            : z.enum(["GLOBAL", "BOOK_TYPE"]).default("GLOBAL"),
  relationshipCodes: z.array(relationshipCodeSchema).optional()
});

interface ParsedSkillMd {
  slug       : string;
  name       : string;
  description: string;
  scope      : string;
  content    : string; // 完整 MD（frontmatter + 正文）
}

/** 提取 YAML frontmatter 并解析。 */
function extractFrontmatter(md: string): { frontmatter: unknown; body: string } {
  if (!md.startsWith("---")) return { frontmatter: {}, body: md.trim() };
  const end = md.indexOf("\n---", 4);
  if (end === -1) return { frontmatter: {}, body: md.trim() };
  const fm = md.slice(3, end).trim();
  return { frontmatter: yamlLoad(fm), body: md.slice(end + 4).trim() };
}

function readSkillMdFiles(): ParsedSkillMd[] {
  const files = ["chinese-surname", "chinese-name-pattern", "classical-generic-titles", "classical-relationship-types", "chinese-deictic-junk"];
  const parsed: ParsedSkillMd[] = [];
  for (const name of files) {
    const path = resolve(SKILLS_DIR, `${name}.md`);
    const raw = readFileSync(path, "utf-8");
    const { frontmatter } = extractFrontmatter(raw);
    const meta = skillMdFrontmatterSchema.safeParse(frontmatter);
    if (!meta.success) {
      throw new Error(`skill MD frontmatter 非法: ${name}.md — ${JSON.stringify(meta.error.issues)}`);
    }
    parsed.push({ ...meta.data, content: raw.trim() });
  }
  return parsed;
}

/** 供 seed.ts 复用：幂等写入基线技能（存在则覆盖 content）。 */
export async function seedSkillBaselines(prisma: PrismaClient): Promise<number> {
  const skills = readSkillMdFiles();
  let touchedCount = 0;

  for (const skill of skills) {
    const existing = await prisma.skill.findUnique({
      where : { slug: skill.slug },
      select: { id: true, content: true }
    });

    if (!existing) {
      await prisma.skill.create({
        data: {
          slug       : skill.slug,
          name       : skill.name,
          description: skill.description,
          scope      : skill.scope,
          status     : SkillStatus.ENABLED,
          content    : skill.content
        },
        select: { id: true, slug: true }
      });
      console.log(`✅ 技能已创建: ${skill.slug}`);
      touchedCount += 1;
      continue;
    }

    if (existing.content === skill.content) {
      console.log(`⏭ 技能无变化，跳过: ${skill.slug}`);
      continue;
    }

    await prisma.skill.update({
      where: { id: existing.id },
      data : {
        name       : skill.name,
        description: skill.description,
        scope      : skill.scope,
        content    : skill.content
      }
    });
    console.log(`🔄 技能已更新: ${skill.slug}`);
    touchedCount += 1;
  }

  return touchedCount;
}

/** 独立 CLI 入口（也可被 seed.ts 复用）。 */
async function main() {
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  const count = await seedSkillBaselines(prisma);
  await prisma.$disconnect();
  console.log(`🎉 skill 基线种子完成，新建/更新 ${count} 个`);
}

// 主模块守卫：仅直接运行时执行 CLI 入口；被 seed.ts 导入时不触发。
const isMainModule = process.argv[1] ? import.meta.url === pathToFileURL(process.argv[1]).href : false;

if (isMainModule) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
