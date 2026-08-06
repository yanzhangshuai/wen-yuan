/**
 * relationship_types 关系码种子（幂等 upsert）。
 *
 * 规则（v5.1 数据模型）：
 * - 全局 10 类关系码（bookTypeId=null）：父子/母子/兄弟/夫妻/师生/同年/同僚/主仆/朋友/仇敌。
 * - 书型专属码（bookTypeId=明清官场）：座师/房师——科举场景精确码，不污染其他书型。
 * - 新增关系码 = 在此插一行（或管理台维护），无需改代码。
 *
 * 幂等：跑任意多次不产生重复行。
 */
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, RelationDirection } from "../src/generated/prisma/client.ts";

const connectionString = process.env.DATABASE_URL ?? "postgresql://plotweaver:plotweaver@127.0.0.1:5432/wen_yuan?schema=public";

interface RelTypeSeed {
  code: string;
  name: string;
  direction: RelationDirection;
  category: string;
  aliases: string[];
  sortOrder: number;
}

/** 全局关系码（家庭/亲密/等级/社交/敌对/其他 六分类） */
const GLOBAL_REL_TYPES: RelTypeSeed[] = [
  { code: "父子", name: "父子", direction: "INVERSE", category: "家庭", aliases: ["父与子", "父子关系"], sortOrder: 1 },
  { code: "母子", name: "母子", direction: "INVERSE", category: "家庭", aliases: ["母与子", "母子关系"], sortOrder: 2 },
  { code: "兄弟", name: "兄弟", direction: "SYMMETRIC", category: "家庭", aliases: ["兄弟关系", "同胞"], sortOrder: 3 },
  { code: "夫妻", name: "夫妻", direction: "SYMMETRIC", category: "家庭", aliases: ["夫妇", "夫妻关系", "结发"], sortOrder: 4 },
  { code: "师生", name: "师生", direction: "INVERSE", category: "等级", aliases: ["师徒", "门生", "师生关系", "受业"], sortOrder: 5 },
  { code: "同年", name: "同年", direction: "SYMMETRIC", category: "社交", aliases: ["同科", "同榜", "同年", "同案"], sortOrder: 6 },
  { code: "同僚", name: "同僚", direction: "SYMMETRIC", category: "等级", aliases: ["同寅", "同官", "同僚关系"], sortOrder: 7 },
  { code: "主仆", name: "主仆", direction: "INVERSE", category: "等级", aliases: ["主仆关系", "家主"], sortOrder: 8 },
  { code: "朋友", name: "朋友", direction: "SYMMETRIC", category: "社交", aliases: ["好友", "挚友", "相与", "朋友关系"], sortOrder: 9 },
  { code: "仇敌", name: "仇敌", direction: "SYMMETRIC", category: "敌对", aliases: ["仇人", "死敌", "冤家"], sortOrder: 10 },
];

/** 书型专属：明清官场（科举场景精确码） */
const BOOK_TYPE_REL_TYPES: { bookTypeKey: string; types: RelTypeSeed[] } = {
  bookTypeKey: "明清官场",
  types: [
    { code: "座师", name: "座师", direction: "INVERSE", category: "等级", aliases: ["座主", "门生"], sortOrder: 1 },
    { code: "房师", name: "房师", direction: "INVERSE", category: "等级", aliases: ["房师", "房考"], sortOrder: 2 },
  ],
};

/** 幂等 upsert：全局码按 (code, bookTypeId=null) 查找，书型码按 (code, bookTypeId) 查找。
 *  不用 prisma.upsert 复合唯一 where：nullable 字段的复合唯一在 Prisma 中行为不可靠。 */
async function upsertRelType(prisma: PrismaClient, t: RelTypeSeed, bookTypeId: string | null): Promise<void> {
  const existing = await prisma.relationshipType.findFirst({ where: { code: t.code, bookTypeId } });
  const data = { name: t.name, direction: t.direction, category: t.category, aliases: t.aliases, sortOrder: t.sortOrder };
  if (existing) {
    await prisma.relationshipType.update({ where: { id: existing.id }, data });
  } else {
    await prisma.relationshipType.create({ data: { ...t, bookTypeId } });
  }
}

export async function seedRelationshipTypes(prisma: PrismaClient): Promise<number> {
  let count = 0;

  for (const t of GLOBAL_REL_TYPES) {
    await upsertRelType(prisma, t, null);
    count++;
  }

  const bookType = await prisma.bookType.findFirst({ where: { key: BOOK_TYPE_REL_TYPES.bookTypeKey } });
  if (bookType) {
    for (const t of BOOK_TYPE_REL_TYPES.types) {
      await upsertRelType(prisma, t, bookType.id);
      count++;
    }
  } else {
    console.warn(`⚠️ 未找到书型「${BOOK_TYPE_REL_TYPES.bookTypeKey}」，跳过书型专属关系码。`);
  }

  return count;
}

// 直接运行入口：node scripts/seed-relationship-types.ts
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^file:\/\//, ""));
if (isMain) {
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  seedRelationshipTypes(prisma)
    .then((n) => {
      console.log(`✅ relationship_types 种子完成：${n} 条（幂等 upsert）`);
      return prisma.$disconnect();
    })
    .catch(async (e) => {
      console.error("❌ relationship_types 种子失败:", e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
