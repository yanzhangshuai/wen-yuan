import { PrismaPg } from "@prisma/adapter-pg";
import argon2 from "argon2";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AppRole, PrismaClient } from "../src/generated/prisma/client.ts";

/**
 * 文件定位（数据初始化层 / 运维脚本层）：
 * - 本文件是 Prisma 官方约定的 seed 脚本入口，用于 `prisma db seed` 时写入“可运行的最小业务基础数据”。
 * - 它不属于 Next.js 的页面或路由文件，不参与请求渲染链路；运行时机是数据库初始化、重建、CI 环境准备阶段。
 *
 * 核心业务职责：
 * 1. 初始化管理员账号（后台登录入口所依赖的首个账号）。
 * 2. 初始化 AI 模型配置列表（后台“模型管理/模型策略”上游依赖）。
 *
 * 上下游关系：
 * - 上游输入：`.env` 中的数据库连接与管理员账号配置。
 * - 下游消费：`/api/auth/login`、后台管理页、分析任务模型选择逻辑都会读取这里落库的数据。
 *
 * 重要约束（业务规则，不是技术限制）：
 * - 管理员账号必须可幂等重建（重复 seed 不产生重复管理员）。
 * - 模型基础清单以“当前代码定义”为准，每次 seed 会覆盖为最新清单，避免历史脏数据干扰验收/开发。
 */
function loadEnvFromDotenv() {
  // Prisma CLI 直跑脚本时通常不会自动加载 dotenv，这里手动兜底，确保本地与 CI 行为一致。
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

    // 仅在进程中不存在该变量时才写入，避免覆盖命令行/CI 显式注入的高优先级环境变量。
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

// 这里采用“启动即失败”的防御策略：
// - seed 阶段若关键配置缺失，继续执行只会写入不完整数据；
// - 直接抛错可以尽早暴露部署/本地环境配置问题，减少后续排查成本。
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

// 经过上面强校验后，再将可选类型收敛为确定值，避免后续业务逻辑出现 `undefined` 分支。
const adminUsernameValue = adminUsername;
const adminEmailValue = adminEmail;
const adminPasswordValue = adminPassword;

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

/**
 * 统一密码散列策略：
 * - 与服务端登录模块保持一致，统一使用 argon2id，保证 seed 账号与真实账号验证流程一致。
 * - 参数与线上一致可以避免“开发环境能登录、生产环境不兼容”的口令格式问题。
 *
 * @param password 管理员明文密码（仅在 seed 运行期间短暂存在于内存）
 * @returns 可安全入库的哈希值（不可逆）
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
    aliasKey : "deepseek-v3-stable",
    name     : "DeepSeek V3",
    modelId  : "deepseek-chat",
    baseUrl  : "https://api.deepseek.com",
    isDefault: false
  },
  {
    provider : "deepseek",
    aliasKey : "deepseek-r1-stable",
    name     : "DeepSeek R1",
    modelId  : "deepseek-reasoner",
    baseUrl  : "https://api.deepseek.com",
    isDefault: false
  },
  {
    provider : "qwen",
    aliasKey : "qwen-max-stable",
    name     : "通义千问 Max",
    modelId  : "qwen-max",
    baseUrl  : "https://dashscope.aliyuncs.com/compatible-mode/v1",
    isDefault: false
  },
  {
    provider : "qwen",
    aliasKey : "qwen-plus-stable",
    name     : "通义千问 Plus",
    modelId  : "qwen-plus",
    baseUrl  : "https://dashscope.aliyuncs.com/compatible-mode/v1",
    isDefault: false
  },
  {
    provider : "doubao",
    aliasKey : "doubao-pro-stable",
    name     : "豆包 Pro",
    modelId  : "ep-your-endpoint-id",
    baseUrl  : "https://ark.cn-beijing.volces.com/api/v3",
    isDefault: false
  },
  {
    provider : "glm",
    aliasKey : "glm-4.6-stable",
    name     : "GLM 4.6",
    modelId  : "glm-4.6",
    baseUrl  : "https://open.bigmodel.cn/api/paas/v4",
    isDefault: false
  },
  {
    provider : "glm",
    aliasKey : "glm-5-stable",
    name     : "GLM 5",
    modelId  : "glm-5",
    baseUrl  : "https://open.bigmodel.cn/api/paas/v4",
    isDefault: false
  },
  {
    provider : "gemini",
    aliasKey : "gemini-flash-stable",
    name     : "Gemini Flash",
    modelId  : "gemini-3.1-flash",
    baseUrl  : "https://generativelanguage.googleapis.com",
    isDefault: false
  }
] as const;

/**
 * 种子主流程（事务化）：
 * 1. 先生成管理员密码哈希；
 * 2. 在一个事务内写入管理员与模型清单；
 * 3. 输出可读日志，方便本地和 CI 诊断。
 *
 * 为什么只初始化“管理员 + 模型”：
 * - 书籍/章节/人物属于业务数据，通常应由测试脚本或人工导入生成；
 * - seed 仅负责“系统可启动”的最小闭环，避免污染开发数据。
 */
async function main() {
  console.log("🌱 开始录入种子数据...");
  const adminPasswordHash = await hashPassword(adminPasswordValue);

  // 多实体写入放进同一事务，确保“管理员与模型清单”要么一起成功，要么一起回滚。
  // 这是运维一致性要求，避免出现只写入一半的系统初始化状态。
  const result = await prisma.$transaction(async (tx) => {
    // upsert 保证幂等：重复执行 seed 时不会新增重复管理员，而是更新同邮箱账号的关键字段。
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

    // 模型清单采用“先清空再全量写入”策略：
    // - 这是业务上的“基准配置重建”语义，而不是增量同步语义；
    // - 可以避免多次 seed 导致重复模型、旧别名残留、默认模型冲突等问题。
    // 风险提示：如果将 seed 用于生产环境，可能覆盖人工维护的模型配置，需谨慎。
    await tx.aiModel.deleteMany();
    await tx.aiModel.createMany({
      data: defaultAiModels.map((item) => ({
        provider : item.provider,
        aliasKey : item.aliasKey,
        name     : item.name,
        modelId  : item.modelId,
        baseUrl  : item.baseUrl,
        apiKey   : null, // 安全边界：seed 不写入明文密钥，避免把密钥放进代码/镜像层。
        isEnabled: false, // 运维边界：默认禁用，要求管理员在后台完成显式启用与验证后再参与任务。
        isDefault: item.isDefault // 默认模型由清单显式定义，避免运行时出现“无默认模型”或“多默认模型”歧义。
      }))
    });

    return {
      // 返回值仅用于日志回显，帮助操作者确认实际写入结果。
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
    // seed 失败必须返回非零退出码，供 CI/CD 与运维脚本识别失败并中止后续步骤。
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    // 无论成功失败都主动断开连接，避免 Node 进程被连接池挂住无法退出。
    await prisma.$disconnect();
  });
