import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../../src/generated/prisma/client.ts";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("Missing DATABASE_URL");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

async function main() {
  const expectedAdminUsername = process.env.ADMIN_USERNAME;
  const expectedModelNames = [
    "DeepSeek V3",
    "DeepSeek R1",
    "通义千问 Max",
    "通义千问 Plus",
    "豆包 Pro",
    "Gemini Flash",
  ];

  const [adminCount, adminByUsername, modelCount, models] = await Promise.all([
    prisma.user.count({ where: { role: "ADMIN" } }),
    expectedAdminUsername
      ? prisma.user.findFirst({ where: { role: "ADMIN", username: expectedAdminUsername } })
      : Promise.resolve(null),
    prisma.aiModel.count(),
    prisma.aiModel.findMany({
      select: {
        name: true,
        isEnabled: true,
        isDefault: true,
      },
    }),
  ]);

  const modelNames = models.map((model) => model.name).sort();
  const missingModelNames = expectedModelNames.filter((name) => !modelNames.includes(name));
  const nonDisabledOrDefault = models.filter((model) => model.isEnabled || model.isDefault);

  console.log("adminCount=" + adminCount);
  console.log("adminUsernameExpected=" + (expectedAdminUsername ?? "<missing env>"));
  console.log("adminUsernameFound=" + (adminByUsername?.username ?? "<none>"));
  console.log("adminPasswordHashed=" + String(adminByUsername?.password?.startsWith("$argon2id$") ?? false));
  console.log("modelCount=" + modelCount);
  console.log("modelNames=" + modelNames.join(","));
  console.log("missingModelNames=" + missingModelNames.join(","));
  console.log("modelsEnabledOrDefaultCount=" + nonDisabledOrDefault.length);

  if (
    !expectedAdminUsername
    || adminCount < 1
    || !adminByUsername
    || !adminByUsername.password.startsWith("$argon2id$")
    || modelCount < 6
    || missingModelNames.length > 0
    || nonDisabledOrDefault.length > 0
  ) {
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
