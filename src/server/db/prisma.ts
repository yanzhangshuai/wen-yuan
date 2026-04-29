import { PrismaPg } from "@prisma/adapter-pg";
import { Prisma, PrismaClient } from "@/generated/prisma/client";

/**
 * 文件定位（数据库访问基础设施）：
 * - 文件路径：`src/server/db/prisma.ts`
 * - 所属层次：服务端数据访问层（DAL）底座。
 *
 * 核心职责：
 * - 创建并导出全局唯一 PrismaClient 实例；
 * - 连接 PostgreSQL（通过 Prisma PG Adapter）；
 * - 在开发环境复用连接，避免热重载导致连接数暴涨。
 *
 * 运行环境：
 * - 仅应在 Node.js 服务端使用，不可在浏览器端导入。
 *
 * 上下游关系：
 * - 上游输入：环境变量 `DATABASE_URL`；
 * - 下游输出：`prisma` 客户端实例，供各 server module 执行数据库读写。
 *
 * 维护注意：
 * - `DATABASE_URL` 缺失时启动即失败是刻意的“快速失败”策略，避免运行时隐性故障；
 * - `globalThis.prisma` 复用是开发态稳定性方案，不是业务逻辑。
 */

/**
 * 扩展全局对象类型声明：
 * - 在开发环境把 PrismaClient 挂到 `globalThis`，实现模块热更新复用。
 */
declare global {
  var prisma: PrismaClient | undefined;
}

/** 数据库连接串（来自部署环境变量）。 */
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  // 防御式失败：无连接串时直接抛错，避免后续所有数据操作都在运行时逐个报错。
  throw new Error("Missing Prisma connection env: DATABASE_URL");
}

// PG Adapter：将 PrismaClient 绑定到 PostgreSQL 连接适配器。
const adapter = new PrismaPg({ connectionString });

function toDelegateName(modelName: string): string {
  return modelName.charAt(0).toLowerCase() + modelName.slice(1);
}

function hasCurrentPrismaDelegates(client: PrismaClient | undefined): client is PrismaClient {
  if (!client) return false;

  return Object.values(Prisma.ModelName).every(modelName => {
    const delegate = (client as unknown as Record<string, unknown>)[toDelegateName(modelName)];
    return typeof delegate === "object" && delegate !== null;
  });
}

const cachedPrisma = globalThis.prisma;

export const prisma = hasCurrentPrismaDelegates(cachedPrisma)
  ? cachedPrisma
  : new PrismaClient({
    adapter,
    // 开发环境输出 query 日志便于排查；生产只保留 error 降低噪声与性能开销。
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  // 仅开发态缓存实例：避免 HMR 反复 new PrismaClient 触发“too many connections”。
  globalThis.prisma = prisma;
}
