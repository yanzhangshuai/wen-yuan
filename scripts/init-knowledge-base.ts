/**
 * 知识库初始化脚本：从 JSON 种子文件导入 BookType / KnowledgePack / KnowledgeEntry。
 *
 * 用法：
 *   npx tsx scripts/init-knowledge-base.ts
 *   npx tsx scripts/init-knowledge-base.ts --file data/knowledge-base/book-types.init.json
 *
 * 幂等性保证：
 * - BookType：按 key upsert，已存在则更新 name / presetConfig / description / sortOrder
 * - KnowledgePack：按 bookTypeId + name 查重，已存在则跳过（不覆盖条目）
 * - KnowledgeEntry：跟随 KnowledgePack 创建；若包已存在则整包跳过
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
import { type Prisma, PrismaClient } from "../src/generated/prisma/client.ts";

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
  key           : string;
  name          : string;
  description?  : string;
  sortOrder     : number;
  isActive      : boolean;
  presetConfig  : Record<string, unknown> | null;
  knowledgePacks: InitPack[];
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
        key         : bt.key,
        name        : bt.name,
        description : bt.description,
        sortOrder   : bt.sortOrder,
        isActive    : bt.isActive,
        presetConfig: (bt.presetConfig ?? undefined) as Prisma.InputJsonValue | undefined
      },
      update: {
        name        : bt.name,
        description : bt.description,
        sortOrder   : bt.sortOrder,
        isActive    : bt.isActive,
        presetConfig: (bt.presetConfig ?? undefined) as Prisma.InputJsonValue | undefined
      }
    });

    for (const pack of bt.knowledgePacks) {
      const existing = await prisma.knowledgePack.findFirst({
        where: { bookTypeId: bookType.id, name: pack.name }
      });

      if (existing) {
        console.log(`  ⏩ skip existing pack: ${pack.name}`);
        skippedPacks += 1;
        continue;
      }

      await prisma.$transaction(async (tx) => {
        const knowledgePack = await tx.knowledgePack.create({
          data: {
            bookTypeId : bookType.id,
            name       : pack.name,
            scope      : pack.scope,
            description: pack.description
          }
        });

        if (pack.entries.length > 0) {
          await tx.knowledgeEntry.createMany({
            data: pack.entries.map((entry) => ({
              packId       : knowledgePack.id,
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
