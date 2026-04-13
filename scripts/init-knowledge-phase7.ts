/**
 * Phase 7 种子脚本：迁移 Phase 7 规则与古典人物知识到数据库。
 *
 * 用法：
 *   pnpm ts-node scripts/init-knowledge-phase7.ts
 *
 * 幂等策略：
 * - ExtractionRule: findFirst(ruleType + content + genreKey=null) -> create/update
 * - GenericTitleEntry: upsert(title)
 * - HistoricalFigureEntry: findFirst(name + category) -> create/update
 * - RelationalTermEntry: upsert(term)
 * - NamePatternRule: findFirst(ruleType + pattern + action) -> create/update
 * - KnowledgeEntry: findFirst(packId + canonicalName) -> create/update
 */
import "dotenv/config";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

interface ExtractionRulesSeedData {
  version    : string;
  description: string;
  ruleGroups : Array<{
    ruleType: string;
    contents: string[];
  }>;
}

interface GenericTitlesSeedData {
  version    : string;
  description: string;
  titles     : Array<{
    title   : string;
    tier    : string;
    category: string | null;
  }>;
}

interface HistoricalFiguresSeedData {
  version    : string;
  description: string;
  entries    : Array<{
    name       : string;
    aliases    : string[];
    dynasty    : string | null;
    category   : string;
    description: string | null;
  }>;
}

interface RelationalTermsSeedData {
  version    : string;
  description: string;
  entries    : Array<{
    term    : string;
    category: string;
  }>;
}

interface NamePatternRulesSeedData {
  version    : string;
  description: string;
  entries    : Array<{
    ruleType   : string;
    pattern    : string;
    action     : string;
    description: string | null;
  }>;
}

interface ClassicalCharactersSeedData {
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
  extractionRules   : number;
  genericTitles     : number;
  historicalFigures : number;
  relationalTerms   : number;
  namePatternRules  : number;
  knowledgeEntries  : number;
  knowledgePackCount: number;
}

function readSeedJson<T>(relativePath: string): T {
  const absolutePath = resolve(process.cwd(), relativePath);
  const raw = readFileSync(absolutePath, "utf-8");
  return JSON.parse(raw) as T;
}

function normalizeText(value: string): string {
  return value.trim();
}

function toUniqueList(values: Iterable<string>): string[] {
  return Array.from(new Set(
    Array.from(values)
      .map((item) => item.trim())
      .filter(Boolean)
  ));
}

function assertD1Fix(seed: ClassicalCharactersSeedData): void {
  const rulinGenre = seed.genres.find((item) => item.bookTypeKey === "明清官场");
  if (!rulinGenre) {
    throw new Error("D1 校验失败：classical-characters.seed.json 缺少 明清官场 数据");
  }

  const niuBuyi = rulinGenre.entries.find((item) => item.canonicalName === "牛布衣");
  if (!niuBuyi) {
    throw new Error("D1 校验失败：缺少 牛布衣 条目");
  }
  const niuBuyiAliases = new Set(toUniqueList(niuBuyi.aliases));
  if (niuBuyiAliases.has("牛浦郎") || niuBuyiAliases.has("牛浦")) {
    throw new Error("D1 校验失败：牛布衣 aliases 不得包含 牛浦郎/牛浦");
  }

  const niuPuLang = rulinGenre.entries.find((item) => item.canonicalName === "牛浦郎");
  if (!niuPuLang) {
    throw new Error("D1 校验失败：缺少 牛浦郎 独立条目");
  }

  const niuPuLangAliases = new Set(toUniqueList(niuPuLang.aliases));
  if (!niuPuLangAliases.has("牛浦")) {
    throw new Error("D1 校验失败：牛浦郎 aliases 必须包含 牛浦");
  }
}

async function seedExtractionRules(prisma: PrismaClient, seed: ExtractionRulesSeedData): Promise<number> {
  let count = 0;

  for (const group of seed.ruleGroups) {
    for (let index = 0; index < group.contents.length; index += 1) {
      const content = normalizeText(group.contents[index] ?? "");
      if (!content) continue;

      const existing = await prisma.extractionRule.findFirst({
        where: {
          ruleType: group.ruleType,
          content,
          genreKey: null
        },
        select: { id: true }
      });

      if (existing) {
        await prisma.extractionRule.update({
          where: { id: existing.id },
          data : {
            sortOrder: index + 1,
            isActive : true
          }
        });
      } else {
        await prisma.extractionRule.create({
          data: {
            ruleType : group.ruleType,
            content,
            sortOrder: index + 1,
            isActive : true
          }
        });
      }
      count += 1;
    }
  }

  return count;
}

async function seedGenericTitles(prisma: PrismaClient, seed: GenericTitlesSeedData): Promise<number> {
  let count = 0;

  for (const item of seed.titles) {
    const title = normalizeText(item.title);
    if (!title) continue;

    await prisma.genericTitleEntry.upsert({
      where : { title },
      create: {
        title,
        tier    : item.tier,
        category: item.category ?? undefined,
        source  : "IMPORTED",
        isActive: true
      },
      update: {
        tier    : item.tier,
        category: item.category ?? undefined,
        source  : "IMPORTED",
        isActive: true
      }
    });
    count += 1;
  }

  return count;
}

async function seedHistoricalFigures(prisma: PrismaClient, seed: HistoricalFiguresSeedData): Promise<number> {
  let count = 0;

  for (const item of seed.entries) {
    const name = normalizeText(item.name);
    if (!name) continue;

    const aliases = toUniqueList(item.aliases);
    const existing = await prisma.historicalFigureEntry.findFirst({
      where : { name, category: item.category },
      select: { id: true }
    });

    if (existing) {
      await prisma.historicalFigureEntry.update({
        where: { id: existing.id },
        data : {
          aliases,
          dynasty    : item.dynasty ?? undefined,
          description: item.description ?? undefined,
          isVerified : true
        }
      });
    } else {
      await prisma.historicalFigureEntry.create({
        data: {
          name,
          aliases,
          dynasty    : item.dynasty ?? undefined,
          category   : item.category,
          description: item.description ?? undefined,
          isVerified : true
        }
      });
    }
    count += 1;
  }

  return count;
}

async function seedRelationalTerms(prisma: PrismaClient, seed: RelationalTermsSeedData): Promise<number> {
  let count = 0;

  for (const item of seed.entries) {
    const term = normalizeText(item.term);
    if (!term) continue;

    await prisma.relationalTermEntry.upsert({
      where : { term },
      create: {
        term,
        category  : item.category,
        isVerified: true
      },
      update: {
        category  : item.category,
        isVerified: true
      }
    });
    count += 1;
  }

  return count;
}

async function seedNamePatternRules(prisma: PrismaClient, seed: NamePatternRulesSeedData): Promise<number> {
  let count = 0;

  for (const item of seed.entries) {
    const pattern = normalizeText(item.pattern);
    if (!pattern) continue;

    const existing = await prisma.namePatternRule.findFirst({
      where: {
        ruleType: item.ruleType,
        pattern,
        action  : item.action
      },
      select: { id: true }
    });

    if (existing) {
      await prisma.namePatternRule.update({
        where: { id: existing.id },
        data : {
          description: item.description ?? undefined,
          isVerified : true
        }
      });
    } else {
      await prisma.namePatternRule.create({
        data: {
          ruleType   : item.ruleType,
          pattern,
          action     : item.action,
          description: item.description ?? undefined,
          isVerified : true
        }
      });
    }
    count += 1;
  }

  return count;
}

async function ensureKnowledgePack(
  prisma: PrismaClient,
  input: {
    bookTypeKey : string;
    packName    : string;
    scope       : string;
    sourceDetail: string;
  }
): Promise<string> {
  const bookType = await prisma.bookType.findUnique({
    where : { key: input.bookTypeKey },
    select: { id: true, key: true }
  });
  if (!bookType) {
    throw new Error(`无法找到 bookType: ${input.bookTypeKey}`);
  }

  const existingPack = await prisma.knowledgePack.findFirst({
    where : { bookTypeId: bookType.id, name: input.packName },
    select: { id: true }
  });

  if (existingPack) {
    await prisma.knowledgePack.update({
      where: { id: existingPack.id },
      data : {
        scope      : input.scope,
        isActive   : true,
        description: input.sourceDetail
      }
    });
    return existingPack.id;
  }

  const createdPack = await prisma.knowledgePack.create({
    data: {
      bookTypeId  : bookType.id,
      name        : input.packName,
      scope       : input.scope,
      description : input.sourceDetail,
      isActive    : true,
      version     : 1
    },
    select: { id: true }
  });

  return createdPack.id;
}

async function seedClassicalCharacters(
  prisma: PrismaClient,
  seed: ClassicalCharactersSeedData
): Promise<{ entryCount: number; packCount: number }> {
  let entryCount = 0;
  let packCount = 0;

  for (const genre of seed.genres) {
    const packId = await ensureKnowledgePack(prisma, {
      bookTypeKey : genre.bookTypeKey,
      packName    : genre.packName,
      scope       : genre.scope,
      sourceDetail: genre.sourceDetail
    });
    packCount += 1;

    for (const item of genre.entries) {
      const canonicalName = normalizeText(item.canonicalName);
      if (!canonicalName) continue;

      const aliases = toUniqueList(item.aliases).filter((alias) => alias !== canonicalName);
      const existing = await prisma.knowledgeEntry.findFirst({
        where : { packId, canonicalName },
        select: { id: true }
      });

      if (existing) {
        await prisma.knowledgeEntry.update({
          where: { id: existing.id },
          data : {
            aliases,
            entryType   : "CHARACTER",
            confidence  : 1.0,
            source      : "IMPORTED",
            sourceDetail: genre.sourceDetail,
            reviewStatus: "VERIFIED"
          }
        });
      } else {
        await prisma.knowledgeEntry.create({
          data: {
            packId,
            canonicalName,
            aliases,
            entryType   : "CHARACTER",
            confidence  : 1.0,
            source      : "IMPORTED",
            sourceDetail: genre.sourceDetail,
            reviewStatus: "VERIFIED"
          }
        });
      }
      entryCount += 1;
    }
  }

  return { entryCount, packCount };
}

export async function seedKnowledgePhase7(prisma: PrismaClient): Promise<KnowledgePhase7SeedSummary> {
  console.log("Phase 7 种子迁移开始...\n");

  const extractionRulesSeed = readSeedJson<ExtractionRulesSeedData>("data/knowledge-base/extraction-rules.seed.json");
  const genericTitlesSeed = readSeedJson<GenericTitlesSeedData>("data/knowledge-base/generic-titles.seed.json");
  const historicalFiguresSeed = readSeedJson<HistoricalFiguresSeedData>("data/knowledge-base/historical-figures.seed.json");
  const relationalTermsSeed = readSeedJson<RelationalTermsSeedData>("data/knowledge-base/relational-terms.seed.json");
  const namePatternSeed = readSeedJson<NamePatternRulesSeedData>("data/knowledge-base/name-pattern-rules.seed.json");
  const classicalCharactersSeed = readSeedJson<ClassicalCharactersSeedData>("data/knowledge-base/classical-characters.seed.json");

  assertD1Fix(classicalCharactersSeed);
  console.log(`✓ D1 校验通过：${classicalCharactersSeed.version}`);

  const extractionRules = await seedExtractionRules(prisma, extractionRulesSeed);
  console.log(`✓ ExtractionRule: ${extractionRules}`);

  const genericTitles = await seedGenericTitles(prisma, genericTitlesSeed);
  console.log(`✓ GenericTitleEntry: ${genericTitles}`);

  const historicalFigures = await seedHistoricalFigures(prisma, historicalFiguresSeed);
  console.log(`✓ HistoricalFigureEntry: ${historicalFigures}`);

  const relationalTerms = await seedRelationalTerms(prisma, relationalTermsSeed);
  console.log(`✓ RelationalTermEntry: ${relationalTerms}`);

  const namePatternRules = await seedNamePatternRules(prisma, namePatternSeed);
  console.log(`✓ NamePatternRule: ${namePatternRules}`);

  const classicalResult = await seedClassicalCharacters(prisma, classicalCharactersSeed);
  console.log(`✓ KnowledgePack: ${classicalResult.packCount}`);
  console.log(`✓ KnowledgeEntry: ${classicalResult.entryCount}`);

  console.log("\nPhase 7 种子迁移完成！");

  return {
    extractionRules,
    genericTitles,
    historicalFigures,
    relationalTerms,
    namePatternRules,
    knowledgeEntries  : classicalResult.entryCount,
    knowledgePackCount: classicalResult.packCount
  };
}

function createSeedPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL in .env");
  }

  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({ adapter });
}

async function main() {
  const prisma = createSeedPrismaClient();
  try {
    await seedKnowledgePhase7(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

const isDirectExecution = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
