import { PrismaPg } from "@prisma/adapter-pg";
import argon2 from "argon2";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AppRole, PrismaClient } from "../src/generated/prisma/client.ts";
import { seedSkillBaselines } from "../scripts/seed-skill-baselines.ts";

/**
 * 文件定位（数据初始化层 / 运维脚本层）：
 * - Prisma 官方约定的 seed 入口，用于 `prisma db seed` 时写入最小业务基础数据。
 * - 版本 v3：旧知识表已删除，知识扩展改为 Skill 技能包。
 *
 * 核心业务职责：
 * 1. 初始化管理员账号（后台登录入口所依赖的首个账号）；
 * 2. 初始化书籍类型（book_types）；
 * 3. 初始化 Skill 基线技能包（姓氏/名字模式/泛称/关系类型）。
 *
 * 重要约束：
 * - 管理员账号必须可幂等重建（重复 seed 不产生重复管理员）。
 * - AI 模型配置由管理后台维护，seed 不修改 ai_models。
 */
function loadEnvFromDotenv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;

  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }
}

loadEnvFromDotenv();

const connectionString = process.env.DATABASE_URL;
const adminUsername = process.env.ADMIN_USERNAME;
const adminEmail = process.env.ADMIN_EMAIL;
const adminName = process.env.ADMIN_NAME ?? "管理员";
const adminPassword = process.env.ADMIN_PASSWORD;

if (!connectionString) {
  throw new Error("Missing DATABASE_URL in .env");
}

if (!adminUsername) {
  throw new Error("Missing ADMIN_USERNAME in .env");
}

if (!adminEmail) {
  throw new Error("Missing ADMIN_EMAIL in .env");
}

if (!adminPassword) {
  throw new Error("Missing ADMIN_PASSWORD in .env");
}

const adminUsernameValue = adminUsername;
const adminEmailValue = adminEmail;
const adminPasswordValue = adminPassword;

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

/**
 * 统一密码散列策略：与服务端登录模块保持一致，统一使用 argon2id。
 */
async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type       : argon2.argon2id,
    memoryCost : 19456,
    timeCost   : 2,
    parallelism: 1
  });
}

/**
 * 种子主流程：
 * 1. 管理员账号（幂等 upsert）；
 * 2. Skill 基线技能包。
 *
 * v5 阶段 1：book_types / book_type_skills 表已删，不再 seed 书籍类型。
 */
async function main() {
  console.log("🌱 开始录入种子数据...");
  const adminPasswordHash = await hashPassword(adminPasswordValue);

  const result = await prisma.user.upsert({
    where : { email: adminEmailValue },
    update: {
      username: adminUsernameValue,
      email   : adminEmailValue,
      name    : adminName,
      password: adminPasswordHash,
      role    : AppRole.ADMIN
    },
    create: {
      username: adminUsernameValue,
      email   : adminEmailValue,
      name    : adminName,
      password: adminPasswordHash,
      role    : AppRole.ADMIN
    },
    select: { username: true }
  });

  const skillCount = await seedSkillBaselines(prisma);

  console.log("✅ 种子数据录入成功！");
  console.log(`- 已初始化管理员: ${result.username}`);
  console.log(`- 已初始化 Skill 基线: ${skillCount} 个`);
  console.log("- 模型配置由管理后台维护，seed 未修改 ai_models");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
