import { PrismaPg } from "@prisma/adapter-pg";
import argon2 from "argon2";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AppRole, PrismaClient } from "../src/generated/prisma/client.ts";

/**
 * Prisma CLI 直接执行 seed 脚本时不会自动注入 dotenv。
 * 这里手动兜底加载 `.env`，保证本地重建数据库时的行为可预测。
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
 * 与登录模块保持一致，统一使用 argon2id 存储种子管理员密码。
 */
async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    type       : argon2.argon2id,
    memoryCost : 19456,
    timeCost   : 2,
    parallelism: 1
  });
}

const defaultAiModels = [
  {
    provider : "deepseek",
    name     : "DeepSeek V3",
    modelId  : "deepseek-chat",
    baseUrl  : "https://api.deepseek.com",
    isDefault: false
  },
  {
    provider : "deepseek",
    name     : "DeepSeek R1",
    modelId  : "deepseek-reasoner",
    baseUrl  : "https://api.deepseek.com",
    isDefault: false
  },
  {
    provider : "qwen",
    name     : "通义千问 Max",
    modelId  : "qwen-max",
    baseUrl  : "https://dashscope.aliyuncs.com/compatible-mode/v1",
    isDefault: false
  },
  {
    provider : "qwen",
    name     : "通义千问 Plus",
    modelId  : "qwen-plus",
    baseUrl  : "https://dashscope.aliyuncs.com/compatible-mode/v1",
    isDefault: false
  },
  {
    provider : "doubao",
    name     : "豆包 Pro",
    modelId  : "doubao-pro",
    baseUrl  : "https://ark.cn-beijing.volces.com/api/v3",
    isDefault: false
  },
  {
    provider : "gemini",
    name     : "Gemini Flash",
    modelId  : "gemini-3.1-flash",
    baseUrl  : "https://generativelanguage.googleapis.com",
    isDefault: false
  }
] as const;

/**
 * 重建本地开发数据库的基础数据。
 * 当前策略仅初始化管理员与默认模型，不预置书籍/章节/人物相关数据。
 */
async function main() {
  console.log("🌱 开始录入种子数据...");
  const adminPasswordHash = await hashPassword(adminPasswordValue);

  // 多实体写入使用交互式事务，确保任一步失败时整体回滚。
  const result = await prisma.$transaction(async (tx) => {
    await tx.user.upsert({
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
      }
    });

    // 预置模型配置，避免重复执行 seed 产生重复模型项。
    await tx.aiModel.deleteMany();
    await tx.aiModel.createMany({
      data: defaultAiModels.map((item) => ({
        provider : item.provider,
        name     : item.name,
        modelId  : item.modelId,
        baseUrl  : item.baseUrl,
        apiKey   : null,
        isEnabled: false,
        isDefault: item.isDefault
      }))
    });

    return {
      adminUsername: adminUsernameValue,
      modelCount   : defaultAiModels.length
    };
  });

  console.log("✅ 种子数据录入成功！");
  console.log(`- 已预设模型数: ${result.modelCount}`);
  console.log(`- 已初始化管理员: ${result.adminUsername}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
