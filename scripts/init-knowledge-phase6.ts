/**
 * Phase 6 种子脚本：迁移硬编码数据到新建的 6 张表。
 *
 * 用法：npx tsx scripts/init-knowledge-phase6.ts
 *
 * 数据来源：
 * - 内置姓氏词表 → surname_entries
 * - 泛称分层词表（SAFETY/DEFAULT）→ generic_title_entries
 * - 实体/关系抽取规则词表 → extraction_rules
 * - 8 个 build*Prompt 模板槽 → prompt_templates + prompt_template_versions（创建可直接运行的基线版本）
 */
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
import "dotenv/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PROMPT_TEMPLATE_BASELINES } from "../src/server/modules/knowledge/prompt-template-baselines.ts";

// ─── 姓氏数据 ───────────────────────────────────────────────────────
const COMPOUND_SURNAMES = [
  "欧阳", "司马", "上官", "诸葛", "公孙", "令狐", "皇甫", "尉迟",
  "长孙", "慕容", "夏侯", "轩辕", "端木", "百里", "东方", "南宫", "西门"
];

const SINGLE_SURNAMES = [
  "赵", "钱", "孙", "李", "周", "吴", "郑", "王", "冯", "陈",
  "褚", "卫", "蒋", "沈", "韩", "杨", "朱", "秦", "尤", "许",
  "何", "吕", "施", "张", "孔", "曹", "严", "华", "金", "魏",
  "陶", "姜", "戚", "谢", "邹", "喻", "柏", "水", "窦", "章",
  "云", "苏", "潘", "葛", "奚", "范", "彭", "郎", "鲁", "韦",
  "昌", "马", "苗", "凤", "花", "方", "俞", "任", "袁", "柳",
  "刘", "关", "鲍", "史", "唐", "费", "廉", "岑", "薛", "雷",
  "贺", "倪", "汤", "滕", "殷", "罗", "毕", "郝", "安", "常",
  "乐", "于", "时", "傅", "皮", "卞", "齐", "康", "伍", "余",
  "元", "卜", "顾", "孟", "平", "黄", "穆", "萧", "尹", "姚",
  "邵", "湛", "汪", "祁", "毛", "禹", "狄", "米", "贝", "明",
  "臧", "计", "温", "曾", "简", "饶", "文", "寇", "连", "沙",
  "成", "戴", "谈", "宋", "茅", "庞", "熊", "纪", "舒", "屈",
  "项", "祝", "董", "梁", "杜", "阮", "蓝", "闵", "席", "季",
  "强", "贾", "路", "娄", "危", "江", "童", "颜", "郭", "梅",
  "盛", "林", "刁", "钟", "徐", "邱", "骆", "高", "夏", "蔡",
  "田", "樊", "胡", "凌", "霍", "虞", "万", "支", "柯", "管",
  "卢", "莫", "经", "房", "缪", "干", "解", "应", "宗", "丁",
  "宣", "邓", "郁", "单", "杭", "洪", "包", "诸", "左", "石",
  "崔", "吉", "龚", "程", "邢", "裴", "陆", "荣", "翁", "荀",
  "羊", "惠", "甄", "曲", "封", "储", "靳", "伏"
];

// ─── 泛化称谓数据 ───────────────────────────────────────────────────
const SAFETY_TITLES = [
  "此人", "那人", "来人", "众人", "旁人", "大家", "诸人", "某人", "一人",
  "他", "她", "他们", "她们", "吾", "汝", "彼", "尔",
  "父亲", "母亲", "老父", "老母", "老娘", "娘亲",
  "兄长", "兄弟", "姐姐", "弟弟", "妹妹", "妻子",
  "丫鬟", "丫头", "奴婢", "仆人", "仆役", "家丁", "下人", "小厮", "书童"
];

const DEFAULT_TITLES = [
  "老爷", "夫人", "太太", "老太太", "小姐", "少爷", "公子", "相公", "娘子", "先生",
  "掌柜", "掌柜的", "账房", "管家", "老管家", "门房", "门子",
  "书办", "掌舵", "按察司", "布政司", "都司", "参将", "千总", "把总",
  "员外", "举人", "秀才", "进士", "状元", "老学究"
];

// ─── NER 规则数据 ───────────────────────────────────────────────────
const ENTITY_RULES = [
  "原文中的文字必须精确引用（surfaceForm/rawText），禁止编造或改写。",
  "优先匹配已知人物档案中的标准名(canonicalName)；仅确认全新人物时才创建新 personaName。",
  "泛化称谓（{genericTitles}）禁止作为独立人物名。单独姓氏无法确认具体人物时标记为 generic。",
  "仅提取虚构角色，排除作者、评注者、真实历史人物、批评家。",
  'personaName 使用规范人名，禁止附加"大人""老爷"等泛称后缀。',
  '已知别名须映射回标准名（如"范举人"→ 范进），不得重复创建。',
  "不确定时宁可忽略，避免误建幻觉人物。",
  "同一人物在同一片段中的多种称呼（姓名、官衔、别号）都应识别并映射到同一实体。"
];

const RELATIONSHIP_RULES = [
  "description 写结论，evidence 填原文短句（≤120字）。",
  "不跨段推测，当前片段无证据则不输出该关系。",
  "ironyNote 仅在有直接讽刺/反语证据时填写。",
  "避免自关系（source 与 target 不得相同）。"
];

export interface KnowledgePhase6SeedSummary {
  surnameCount : number;
  titleCount   : number;
  ruleCount    : number;
  templateCount: number;
  versionCount : number;
}

export async function seedKnowledgePhase6(prisma: PrismaClient): Promise<KnowledgePhase6SeedSummary> {
  console.log("Phase 6 种子数据迁移开始...\n");

  // 1. 姓氏
  let surnameCount = 0;
  for (const surname of COMPOUND_SURNAMES) {
    await prisma.surnameRule.upsert({
      where : { surname },
      create: { surname, isCompound: true, priority: 10, source: "IMPORTED" },
      update: {}
    });
    surnameCount++;
  }
  for (const surname of SINGLE_SURNAMES) {
    await prisma.surnameRule.upsert({
      where : { surname },
      create: { surname, isCompound: false, priority: 0, source: "IMPORTED" },
      update: {}
    });
    surnameCount++;
  }
  console.log(`✓ 姓氏库：${surnameCount} 条（复姓 ${COMPOUND_SURNAMES.length}，单姓 ${SINGLE_SURNAMES.length}）`);

  // 2. 泛化称谓
  let titleCount = 0;
  for (const title of SAFETY_TITLES) {
    await prisma.genericTitleRule.upsert({
      where : { title },
      create: { title, tier: "SAFETY", source: "IMPORTED" },
      update: {}
    });
    titleCount++;
  }
  for (const title of DEFAULT_TITLES) {
    await prisma.genericTitleRule.upsert({
      where : { title },
      create: { title, tier: "DEFAULT", source: "IMPORTED" },
      update: {}
    });
    titleCount++;
  }
  console.log(`✓ 泛化称谓库：${titleCount} 条（安全泛称 ${SAFETY_TITLES.length}，默认泛称 ${DEFAULT_TITLES.length}）`);

  // 3. NER 提取规则
  let ruleCount = 0;
  for (let i = 0; i < ENTITY_RULES.length; i++) {
    const existing = await prisma.extractionRule.findFirst({
      where: { ruleType: "ENTITY", content: ENTITY_RULES[i] }
    });
    if (!existing) {
      await prisma.extractionRule.create({
        data: { ruleType: "ENTITY", content: ENTITY_RULES[i], sortOrder: i + 1 }
      });
    }
    ruleCount++;
  }
  for (let i = 0; i < RELATIONSHIP_RULES.length; i++) {
    const existing = await prisma.extractionRule.findFirst({
      where: { ruleType: "RELATIONSHIP", content: RELATIONSHIP_RULES[i] }
    });
    if (!existing) {
      await prisma.extractionRule.create({
        data: { ruleType: "RELATIONSHIP", content: RELATIONSHIP_RULES[i], sortOrder: i + 1 }
      });
    }
    ruleCount++;
  }
  console.log(`✓ NER 规则：${ruleCount} 条（实体 ${ENTITY_RULES.length}，关系 ${RELATIONSHIP_RULES.length}）`);

  // 4. 提示词模板与基线版本
  let templateCount = 0;
  let versionCount = 0;
  for (const slot of PROMPT_TEMPLATE_BASELINES) {
    await prisma.promptTemplate.upsert({
      where : { slug: slot.slug },
      create: {
        slug       : slot.slug,
        name       : slot.name,
        description: slot.description,
        codeRef    : slot.codeRef,
        isActive   : slot.isActive ?? true
      },
      update: {
        name       : slot.name,
        description: slot.description,
        codeRef    : slot.codeRef,
        isActive   : slot.isActive ?? true
      }
    });
    templateCount++;

    const template = await prisma.promptTemplate.findUnique({
      where : { slug: slot.slug },
      select: {
        id      : true,
        versions: {
          orderBy: { versionNo: "desc" },
          take   : 1,
          select : {
            id          : true,
            versionNo   : true,
            systemPrompt: true,
            userPrompt  : true,
            isActive    : true
          }
        }
      }
    });

    if (!template) {
      continue;
    }

    const latest = template.versions[0] ?? null;
    const needsBaselineVersion = !latest || latest.systemPrompt.includes("迁移，请在管理后台填入实际内容") || latest.userPrompt.includes("迁移，请在管理后台填入实际内容");

    if (needsBaselineVersion) {
      await prisma.promptTemplateVersion.create({
        data: {
          templateId  : template.id,
          versionNo   : (latest?.versionNo ?? 0) + 1,
          systemPrompt: slot.systemPrompt,
          userPrompt  : slot.userPrompt,
          changeNote  : latest ? "升级为可执行基线模板" : "种子初始化基线版本",
          isBaseline  : true,
          isActive    : true
        }
      });
      versionCount++;
    } else if (latest && !latest.isActive) {
      await prisma.promptTemplateVersion.update({
        where: { id: latest.id },
        data : { isActive: true }
      });
    }
  }
  console.log(`✓ 提示词模板槽：${templateCount} 个，新增/升级基线版本 ${versionCount} 个`);

  console.log("\nPhase 6 种子数据迁移完成！");

  return {
    surnameCount,
    titleCount,
    ruleCount,
    templateCount,
    versionCount
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
    await seedKnowledgePhase6(prisma);
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
