/**
 * eval-gate 提取结果导出器
 * =============================================================================
 * 文件定位：`scripts/eval/export-extraction.ts`
 *
 * 职责：把管线已落库的 facts/entities 导出为 `scripts/eval/results/<书>/<章>.json`
 *   （ExtractionChapter 格式），供 `run-eval.ts` 与 goldset 对比算 F1。
 *
 * 用法：
 *   node --experimental-strip-types scripts/eval/export-extraction.ts [bookTitle...]
 *   例：node --experimental-strip-types scripts/eval/export-extraction.ts 儒林外史 歧路灯
 *
 * 文件名对齐：读取 `scripts/goldset/<书>/*.json` 的 chapterNo→file 映射，
 *   导出结果用相同文件名，确保 `run-eval.ts` 的 loadExtraction 精确匹配。
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import type { ExtractionChapter } from "./types.ts";

const connectionString = process.env.DATABASE_URL ?? "postgresql://plotweaver:plotweaver@127.0.0.1:5432/wen_yuan?schema=public";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

const GOLDSET_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "goldset");
const RESULTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "results");

interface ChapterFileMapping {
  chapterNo: number;
  file     : string;
}

/** 读某书 goldset 目录，建立 chapterNo → file 映射（对齐 eval 文件名）。 */
async function loadChapterFileMapping(book: string): Promise<ChapterFileMapping[]> {
  const dir = path.join(GOLDSET_DIR, book);
  const files = await readdir(dir);
  const mapping: ChapterFileMapping[] = [];
  for (const file of files.filter((f) => f.endsWith(".json"))) {
    const raw = await readFile(path.join(dir, file), "utf-8");
    try {
      const parsed = JSON.parse(raw) as { chapterNo: number };
      mapping.push({ chapterNo: parsed.chapterNo, file });
    } catch {
      console.warn(`  ⚠️ 跳过非法 goldset 文件: ${book}/${file}`);
    }
  }
  return mapping;
}

/** 从 DB 导出某书提取结果（ExtractionChapter 按章分组）。 */
async function exportBook(bookTitle: string): Promise<void> {
  const mapping = await loadChapterFileMapping(bookTitle);
  if (mapping.length === 0) {
    console.warn(`  ⚠️ ${bookTitle}: 无 goldset 目录映射，跳过`);
    return;
  }

  const book = await prisma.book.findFirst({ where: { title: bookTitle } });
  if (!book) {
    console.warn(`  ⚠️ ${bookTitle}: 数据库无此书，跳过`);
    return;
  }

  // 本书全部有效实体（含档案），构建 canonical → name/aliases/type
  const profiles = await prisma.entityProfile.findMany({
    where : { bookId: book.id, deletedAt: null },
    select: {
      entity: {
        select: { id: true, name: true, aliases: true, entityType: true }
      }
    }
  });
  const entityById = new Map(profiles.map((p) => [p.entity.id, p.entity]));

  // 本书全部有效事实（DRAFT + VERIFIED，排除 REJECTED）
  const facts = await prisma.fact.findMany({
    where : { bookId: book.id, deletedAt: null, status: { not: "REJECTED" } },
    select: {
      chapterNo           : true,
      factType            : true,
      relationshipTypeCode: true,
      eventCategory       : true,
      sourceEntityId      : true,
      targetEntityId      : true,
      payload             : true,
      sourceEntity        : { select: { name: true } },
      targetEntity        : { select: { name: true } }
    }
  });

  // 按章聚合
  const byChapter = new Map<number, ExtractionChapter>();
  for (const fact of facts) {
    let chapter = byChapter.get(fact.chapterNo);
    if (!chapter) {
      chapter = { book: bookTitle, chapterNo: fact.chapterNo, entities: [], relations: [], bioFacts: [] };
      byChapter.set(fact.chapterNo, chapter);
    }

    if (fact.factType === "RELATION" && fact.relationshipTypeCode && fact.sourceEntity && fact.targetEntity) {
      chapter.relations.push({
        typeCode       : fact.relationshipTypeCode,
        sourceCanonical: fact.sourceEntity.name,
        targetCanonical: fact.targetEntity.name
      });
    } else if (fact.factType === "BIOGRAPHY" && fact.sourceEntity) {
      const payload = fact.payload as Record<string, unknown>;
      chapter.bioFacts.push({
        category        : fact.eventCategory ?? "EVENT",
        subjectCanonical: fact.sourceEntity.name,
        summary         : typeof payload.summary === "string" ? payload.summary : ""
      });
    }
  }

  // 实体列表：该章所有 fact 涉及的实体（canonical + aliases + type）
  for (const chapter of byChapter.values()) {
    const seenEntities = new Map<string, ExtractionChapter["entities"][number]>();
    const collectEntity = (entityId: string | null) => {
      if (!entityId) return;
      const entity = entityById.get(entityId);
      if (!entity || seenEntities.has(entity.name)) return;
      seenEntities.set(entity.name, {
        canonical: entity.name,
        type     : entity.entityType,
        aliases  : entity.aliases ?? []
      });
    };
    for (const rel of chapter.relations) {
      const relFact = facts.find((f) =>
        f.factType === "RELATION" && f.sourceEntity?.name === rel.sourceCanonical &&
        f.targetEntity?.name === rel.targetCanonical && f.chapterNo === chapter.chapterNo
      );
      if (relFact) {
        collectEntity(relFact.sourceEntityId);
        collectEntity(relFact.targetEntityId);
      }
    }
    for (const bio of chapter.bioFacts) {
      const bioFact = facts.find((f) =>
        f.factType === "BIOGRAPHY" && f.sourceEntity?.name === bio.subjectCanonical &&
        f.chapterNo === chapter.chapterNo
      );
      if (bioFact) collectEntity(bioFact.sourceEntityId);
    }
    chapter.entities = Array.from(seenEntities.values());
  }

  // 写入 results/<书>/<与 goldset 同名的文件>
  const outDir = path.join(RESULTS_DIR, bookTitle);
  await mkdir(outDir, { recursive: true });
  let written = 0;
  for (const { chapterNo, file } of mapping) {
    const chapter = byChapter.get(chapterNo);
    // 无提取结果的章：写空 ExtractionChapter（eval 按全漏计，但文件存在避免"缺结果"告警混淆）
    const data = chapter ?? { book: bookTitle, chapterNo, entities: [], relations: [], bioFacts: [] };
    await writeFile(path.join(outDir, file), JSON.stringify(data, null, 2), "utf-8");
    written++;
  }
  console.log(`  ✅ ${bookTitle}: 导出 ${written} 章 → ${outDir}`);
}

async function main() {
  const args = process.argv.slice(2);
  const books = args.length > 0 ? args : ["儒林外史", "歧路灯"];
  for (const book of books) {
    await exportBook(book);
  }
}

void (async () => {
  try {
    await main();
  } finally {
    await prisma.$disconnect();
  }
})();
