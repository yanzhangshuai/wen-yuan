import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * 文件定位：
 * - `prisma.config.ts` 是 Prisma CLI 的项目级配置入口。
 * - 在执行 `prisma generate / migrate / db push` 等命令时由 Prisma 读取。
 *
 * 在本项目中的职责：
 * - 统一声明 schema 与 migration 目录，避免多环境命令使用不一致路径；
 * - 从环境变量读取数据库连接串，保证本地/测试/生产可按环境切换。
 *
 * 运行环境：
 * - 仅在 Node.js（CLI）侧执行，不参与浏览器端打包。
 */
export default defineConfig({
  // Prisma 数据模型定义文件：决定客户端类型与数据库结构映射。
  schema    : "prisma/schema.prisma",
  migrations: {
    // 迁移文件目录：记录数据库结构演进历史，支撑可回放部署。
    path: "prisma/migrations",
    // 标准 Prisma seed 入口，保证 `pnpm prisma db seed` 能直接执行项目种子脚本。
    seed: "tsx prisma/seed.ts"
  },
  datasource: {
    // 必须从环境变量读取连接串，避免把敏感信息硬编码进仓库。
    // 若环境变量缺失，Prisma 会在命令执行阶段报错并中止。
    url: env("DATABASE_URL")
  }
});
