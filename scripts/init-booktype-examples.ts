/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import "dotenv/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { BOOK_TYPE_EXAMPLE_BASELINES } from "../src/server/modules/knowledge/booktype-example-baselines.ts";

/**
 * 文件定位（运维 / 种子脚本）：
 * - 把 `BOOK_TYPE_EXAMPLE_BASELINES`（内存 baseline）落盘到 `book_type_examples` 表；
 * - 由 `prisma/seed.ts` 在 Phase 7 之后调用；也可独立 `npx tsx scripts/init-booktype-examples.ts` 运行；
 * - 幂等策略：对管理域（active=true 且 label/stage/bookTypeCode 唯一组合）使用"全量替换"语义。
 *
 * 为什么选全量替换：
 * - few-shot baseline 是代码定义的"基准配置"；
 * - 每次 seed 以代码为准，避免积累旧版本、确保一致；
 * - 运行时 Admin UI 若人工新增 active=false 或扩展样例不在 baseline 里的条目，会被保留（我们只删 active=true 的）。
 */

export interface BookTypeExampleSeedSummary {
  deleted : number;
  inserted: number;
}

export async function seedBookTypeExamples(
  prisma: PrismaClient
): Promise<BookTypeExampleSeedSummary> {
  // 幂等：先删后插。仅清理 active=true 的 baseline 行（用户人工录入的不受影响）。
  const deletedRes = await prisma.bookTypeExample.deleteMany({
    where: { active: true }
  });

  const createData = BOOK_TYPE_EXAMPLE_BASELINES.map((baseline) => ({
    bookTypeCode : baseline.bookTypeCode,
    stage        : baseline.stage,
    label        : baseline.label,
    exampleInput : baseline.exampleInput,
    exampleOutput: baseline.exampleOutput,
    note         : baseline.note ?? null,
    priority     : baseline.priority ?? 0,
    active       : true
  }));

  await prisma.bookTypeExample.createMany({
    data: createData
  });

  console.log(
    `✓ BookTypeExample 基线：删除 ${deletedRes.count} 条旧 baseline，写入 ${createData.length} 条新 baseline`
  );

  return {
    deleted : deletedRes.count,
    inserted: createData.length
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
    await seedBookTypeExamples(prisma);
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
