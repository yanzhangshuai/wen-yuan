/**
 * 回填脚本：为已完成的 sequential 分析任务生成统一审核输出（review output）。
 *
 * 用法：
 *   npx tsx scripts/backfill-unified-review-output.ts --bookId=<uuid>
 *
 * 场景：
 *   已存在完成的 sequential 分析任务，但 review center 无法展示可审核角色时，
 *   通过本脚本在不重跑分析的情况下补写 review output 及投影数据。
 */

import "dotenv/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { createSequentialReviewOutputAdapter } from "../src/server/modules/analysis/review-output/sequential-review-output.ts";
import {
  createProjectionBuilder,
  createProjectionRepository
} from "../src/server/modules/review/evidence-review/projections/projection-builder.ts";

function parseBookId(): string {
  const arg = process.argv.find(a => a.startsWith("--bookId="));
  const bookId = arg?.slice("--bookId=".length).trim();
  if (!bookId) {
    throw new Error("Usage: npx tsx scripts/backfill-unified-review-output.ts --bookId=<uuid>");
  }
  return bookId;
}

async function main() {
  const bookId = parseBookId();

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing DATABASE_URL in environment");
  }

  const adapter = new PrismaPg({ connectionString });
  const prisma  = new PrismaClient({ adapter });

  try {
    const reviewAdapter = createSequentialReviewOutputAdapter(prisma);
    const result = await reviewAdapter.backfillLatestSucceededSequentialJob({ bookId });

    const projectionResult = await createProjectionBuilder({
      repository: createProjectionRepository(prisma)
    }).rebuildProjection({ kind: "FULL_BOOK", bookId });

    console.info(JSON.stringify({ bookId, result, projectionResult }, null, 2));
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
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
