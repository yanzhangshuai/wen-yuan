/**
 * 知识库初始化脚本：从 JSON 种子文件导入 BookType / AliasPack / AliasEntry。
 *
 * 用法：
 *   npx tsx scripts/init-knowledge-base.ts
 *   npx tsx scripts/init-knowledge-base.ts --file data/knowledge-base/book-types.init.json
 *
 * 幂等性保证：
 * - BookType：按 key upsert，已存在则更新 name / description / sortOrder
 * - AliasPack：按 bookTypeId + name 查重，已存在则跳过（不覆盖条目）
 * - AliasEntry：跟随 AliasPack 创建；若包已存在则整包跳过
 *
 * 与 prisma/seed.ts 的关系：
 * - seed.ts 现在会串联本脚本与 Phase 6 脚本，保证标准 `prisma db seed` 后即可得到完整知识库基础数据
 * - 本脚本仍可独立执行，用于显式重放 JSON 种子或单独补录知识包数据
 */

import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

// --- 类型定义：与 book-types.init.json 结构对齐 ---

export interface InitEntry {
  canonicalName: string;
  aliases      : string[];
}

export interface InitPack {
  name        : string;
  scope       : string;
  description?: string;
  entries     : InitEntry[];
}

export interface InitBookType {
  key         : string;
  name        : string;
  description?: string;
  sortOrder   : number;
  isActive    : boolean;
  aliasPacks  : InitPack[];
}

export interface InitData {
  version  : string;
  bookTypes: InitBookType[];
}

// --- 参数解析 ---

function parseFilePath(): string {
  const fileArgIdx = process.argv.indexOf("--file");
  if (fileArgIdx !== -1 && process.argv[fileArgIdx + 1]) {
    return process.argv[fileArgIdx + 1];
  }
  return "data/knowledge-base/book-types.init.json";
}

export function readKnowledgeBaseInitData(filePath: string): InitData {
  const resolvedFilePath = resolve(process.cwd(), filePath);
  const raw = readFileSync(resolvedFilePath, "utf-8");
  return JSON.parse(raw) as InitData;
}

export interface KnowledgeBaseSeedSummary {
  bookTypeCount: number;
  totalPacks   : number;
  totalEntries : number;
  skippedPacks : number;
}

export async function seedKnowledgeBase(prisma: PrismaClient, data: InitData): Promise<KnowledgeBaseSeedSummary> {
  let totalPacks = 0;
  let totalEntries = 0;
  let skippedPacks = 0;

  console.log(`   Version: ${data.version}, BookTypes: ${data.bookTypes.length}`);

  for (const bt of data.bookTypes) {
    const bookType = await prisma.bookType.upsert({
      where : { key: bt.key },
      create: {
        key        : bt.key,
        name       : bt.name,
        description: bt.description,
        sortOrder  : bt.sortOrder,
        isActive   : bt.isActive
      },
      update: {
        name       : bt.name,
        description: bt.description,
        sortOrder  : bt.sortOrder,
        isActive   : bt.isActive
      }
    });

    const packs = bt.aliasPacks ?? [];
    for (const pack of packs) {
      const existing = await prisma.aliasPack.findFirst({
        where: { bookTypeId: bookType.id, name: pack.name }
      });

      if (existing) {
        console.log(`  ⏩ skip existing pack: ${pack.name}`);
        skippedPacks += 1;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        const aliasPack = await tx.aliasPack.create({
          data: {
            bookTypeId : bookType.id,
            name       : pack.name,
            scope      : pack.scope,
            description: pack.description
          }
        });

        if (pack.entries.length > 0) {
          await tx.aliasEntry.createMany({
            data: pack.entries.map((entry) => ({
              packId       : aliasPack.id,
              canonicalName: entry.canonicalName,
              aliases      : entry.aliases,
              source       : "IMPORTED",
              sourceDetail : `book-types.init.json v${data.version}`,
              reviewStatus : "VERIFIED",
              confidence   : 1.0
            }))
          });
        }

        console.log(`  ✅ created pack: ${pack.name} (${pack.entries.length} entries)`);
        totalPacks += 1;
        totalEntries += pack.entries.length;
      });
    }

    console.log(`✓ BookType: ${bt.key}`);
  }

  console.log("\n========== Summary ==========");
  console.log(`BookTypes:  ${data.bookTypes.length} (upserted)`);
  console.log(`Packs:      ${totalPacks} created, ${skippedPacks} skipped`);
  console.log(`Entries:    ${totalEntries} created`);
  console.log("=============================");

  return {
    bookTypeCount: data.bookTypes.length,
    totalPacks,
    totalEntries,
    skippedPacks
  };
}

export async function seedKnowledgeBaseFromFile(prisma: PrismaClient, filePath: string): Promise<KnowledgeBaseSeedSummary> {
  const data = readKnowledgeBaseInitData(filePath);
  return seedKnowledgeBase(prisma, data);
}

// --- Phase 7 种子类型定义 ---

interface HistoricalFigureSeedData {
  version    : string;
  description: string;
  entries    : Array<{
    name        : string;
    aliases     : string[];
    dynasty?    : string;
    category    : string;
    description?: string;
  }>;
}

interface NamePatternRuleSeedData {
  version    : string;
  description: string;
  entries    : Array<{
    ruleType    : string;
    pattern     : string;
    action      : string;
    description?: string;
  }>;
}

interface RelationalTermSeedData {
  version    : string;
  description: string;
  entries    : Array<{
    term    : string;
    category: string;
  }>;
}

interface ClassicalCharacterSeedData {
  version    : string;
  description: string;
  genres     : Array<{
    bookTypeKey : string;
    packName    : string;
    scope       : string;
    sourceDetail: string;
    entries     : Array<{
      canonicalName: string;
      aliases      : string[];
    }>;
  }>;
}

export interface KnowledgePhase7SeedSummary {
  historicalFigures: number;
  namePatternRules : number;
  relationalTerms  : number;
  classicalPacks   : number;
  classicalEntries : number;
}

export async function seedKnowledgePhase7(prisma: PrismaClient): Promise<KnowledgePhase7SeedSummary> {
  console.log("Phase 7 种子数据导入开始...\n");
  const basePath = resolve(process.cwd(), "data/knowledge-base");

  // 1. Historical Figures
  let historicalFigureCount = 0;
  const hfPath = resolve(basePath, "historical-figures.seed.json");
  const hfData = JSON.parse(readFileSync(hfPath, "utf-8")) as HistoricalFigureSeedData;
  console.log(`  历史人物: ${hfData.entries.length} 条 (${hfData.version})`);
  for (const entry of hfData.entries) {
    const existing = await prisma.historicalFigureEntry.findFirst({
      where: { name: entry.name }
    });
    if (!existing) {
      await prisma.historicalFigureEntry.create({
        data: {
          name        : entry.name,
          aliases     : entry.aliases,
          dynasty     : entry.dynasty ?? null,
          category    : entry.category,
          description : entry.description ?? null,
          reviewStatus: "VERIFIED",
          isActive    : true,
          source      : "IMPORTED"
        }
      });
      historicalFigureCount++;
    }
  }
  console.log(`  ✅ 历史人物: ${historicalFigureCount} created, ${hfData.entries.length - historicalFigureCount} skipped`);

  // 2. Name Pattern Rules
  let namePatternCount = 0;
  const npPath = resolve(basePath, "name-pattern-rules.seed.json");
  const npData = JSON.parse(readFileSync(npPath, "utf-8")) as NamePatternRuleSeedData;
  console.log(`  名字模式规则: ${npData.entries.length} 条 (${npData.version})`);
  for (const rule of npData.entries) {
    const existing = await prisma.namePatternRule.findFirst({
      where: { ruleType: rule.ruleType, pattern: rule.pattern }
    });
    if (!existing) {
      await prisma.namePatternRule.create({
        data: {
          ruleType    : rule.ruleType,
          pattern     : rule.pattern,
          action      : rule.action,
          description : rule.description ?? null,
          reviewStatus: "VERIFIED",
          isActive    : true,
          source      : "IMPORTED"
        }
      });
      namePatternCount++;
    }
  }
  console.log(`  ✅ 名字模式规则: ${namePatternCount} created, ${npData.entries.length - namePatternCount} skipped`);

  // 3. Relational Terms → GenericTitleRule (tier=RELATIONAL)
  let relationalTermCount = 0;
  const rtPath = resolve(basePath, "relational-terms.seed.json");
  const rtData = JSON.parse(readFileSync(rtPath, "utf-8")) as RelationalTermSeedData;
  console.log(`  关系词: ${rtData.entries.length} 条 (${rtData.version})`);
  for (const entry of rtData.entries) {
    await prisma.genericTitleRule.upsert({
      where : { title: entry.term },
      create: { title: entry.term, tier: "RELATIONAL", category: entry.category, source: "IMPORTED" },
      update: {}
    });
    relationalTermCount++;
  }
  console.log(`  ✅ 关系词: ${relationalTermCount} upserted`);

  // 4. Classical Characters → AliasPack + AliasEntry
  let classicalPackCount = 0;
  let classicalEntryCount = 0;
  const ccPath = resolve(basePath, "classical-characters.seed.json");
  const ccData = JSON.parse(readFileSync(ccPath, "utf-8")) as ClassicalCharacterSeedData;
  console.log(`  古典人物: ${ccData.genres.length} 类 (${ccData.version})`);
  for (const genre of ccData.genres) {
    const bookType = await prisma.bookType.findFirst({ where: { key: genre.bookTypeKey } });
    if (!bookType) {
      console.log(`  ⏩ 跳过未知书籍类型: ${genre.bookTypeKey}`);
      continue;
    }

    const existingPack = await prisma.aliasPack.findFirst({
      where: { bookTypeId: bookType.id, name: genre.packName }
    });
    if (existingPack) {
      console.log(`  ⏩ 跳过已有知识包: ${genre.packName}`);
      continue;
    }

    const pack = await prisma.aliasPack.create({
      data: {
        name       : genre.packName,
        scope      : genre.scope,
        bookTypeId : bookType.id,
        description: genre.sourceDetail,
        isActive   : true
      }
    });

    if (genre.entries.length > 0) {
      await prisma.aliasEntry.createMany({
        data: genre.entries.map((entry) => ({
          packId       : pack.id,
          canonicalName: entry.canonicalName,
          aliases      : entry.aliases,
          source       : "IMPORTED",
          reviewStatus : "VERIFIED",
          confidence   : 1.0
        }))
      });
    }

    classicalPackCount++;
    classicalEntryCount += genre.entries.length;
    console.log(`  ✅ 知识包: ${genre.packName} (${genre.entries.length} entries)`);
  }

  console.log("\n========== Phase 7 Summary ==========");
  console.log(`历史人物:   ${historicalFigureCount} created`);
  console.log(`名字模式:   ${namePatternCount} created`);
  console.log(`关系词:     ${relationalTermCount} upserted`);
  console.log(`古典人物包: ${classicalPackCount} created (${classicalEntryCount} entries)`);
  console.log("======================================");

  return {
    historicalFigures: historicalFigureCount,
    namePatternRules : namePatternCount,
    relationalTerms  : relationalTermCount,
    classicalPacks   : classicalPackCount,
    classicalEntries : classicalEntryCount
  };
}

// --- 主逻辑 ---

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL in .env");
  }

  const filePath = resolve(process.cwd(), parseFilePath());
  console.log(`📖 Reading: ${filePath}`);

  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });

  try {
    await seedKnowledgeBaseFromFile(prisma, filePath);
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectExecution = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;

if (isDirectExecution) {
  main().catch((error) => {
    console.error("❌ Init failed:", error);
    process.exit(1);
  });
}
