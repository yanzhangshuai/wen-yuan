import { PrismaPg } from "@prisma/adapter-pg";
import { dump as yamlDump } from "js-yaml";
import { pathToFileURL } from "node:url";
import { PrismaClient, SkillCategory, SkillStatus } from "../src/generated/prisma/client.ts";
import { serializeSkillFrontmatter } from "../src/server/modules/skills/content-schema.ts";

/**
 * =============================================================================
 * Skill 基线种子：替代旧知识表（姓氏/名字模式/泛称/关系类型）的初始技能包。
 * 幂等：按 slug upsert，重复执行不产生重复技能。
 * 每个基线技能创建后置 status=ACTIVE + 首版 isActive=true（全局激活）。
 * =============================================================================
 */

const connectionString = process.env.DATABASE_URL ?? "postgresql://plotweaver:plotweaver@127.0.0.1:5432/wen_yuan?schema=public";

export const BASELINE_SKILLS = [
  {
    slug : "chinese-surname",
    name : "中国姓氏",
    category: SkillCategory.SURNAME,
    description: "常用单姓与复姓表，作为实体识别的姓氏先验。",
    scope: "GLOBAL",
    content: {
      schemaVersion: 1,
      kind         : "SURNAME",
      knowledge    : {
        surnames: {
          singles  : ["赵", "钱", "孙", "李", "周", "吴", "郑", "王", "冯", "陈", "褚", "卫", "蒋", "沈", "韩", "杨", "朱", "秦", "尤", "许", "何", "吕", "施", "张", "孔", "曹", "严", "华", "金", "魏", "陶", "姜", "戚", "谢", "邹", "喻", "柏", "水", "窦", "章", "云", "苏", "潘", "葛", "奚", "范", "彭", "郎", "鲁", "韦", "昌", "马", "苗", "凤", "花", "方", "俞", "任", "袁", "柳", "酆", "鲍", "史", "唐", "费", "廉", "岑", "薛", "雷", "贺", "倪", "汤", "滕", "殷", "罗", "毕", "郝", "邬", "安", "常", "乐", "于", "时", "傅", "皮", "卞", "齐", "康", "伍", "余", "元", "卜", "顾", "孟", "平", "黄", "和", "穆", "萧", "尹", "姚", "邵", "湛", "汪", "祁", "毛", "禹", "狄", "米", "贝", "明", "臧", "计", "伏", "成", "戴", "谈", "宋", "茅", "庞", "熊", "纪", "舒", "屈", "项", "祝", "董", "梁", "杜", "阮", "蓝", "闵", "席", "季", "麻", "强", "贾", "路", "娄", "危", "江", "童", "颜", "郭", "梅", "盛", "林", "刁", "钟", "徐", "邱", "骆", "高", "夏", "蔡", "田", "胡", "凌", "霍", "虞", "万", "支", "柯", "昝", "管", "卢", "莫", "经", "房", "裘", "缪", "干", "解", "应", "宗", "丁", "宣", "贲", "邓", "郁", "单", "杭", "洪", "包", "诸", "左", "石", "崔", "吉", "钮", "龚", "程", "嵇", "邢", "滑", "裴", "陆", "荣", "翁", "荀", "羊", "於", "惠", "甄", "曲", "家", "封", "芮", "羿", "储", "靳", "汲", "邴", "糜", "松", "井", "段", "富", "巫", "乌", "焦", "巴", "弓", "牧", "隗", "山", "谷", "车", "侯", "宓", "蓬", "全", "郗", "班", "仰", "秋", "仲", "伊", "宫", "宁", "仇", "栾", "暴", "甘", "钭", "厉", "戎", "祖", "武", "符", "刘", "景", "詹", "束", "龙", "叶", "幸", "司", "韶", "郜", "黎", "蓟", "薄", "印", "宿", "白", "怀", "蒲", "邰", "从", "鄂", "索", "咸", "籍", "赖", "卓", "蔺", "屠", "蒙", "池", "乔", "阴", "鬱", "胥", "能", "苍", "双", "闻", "莘", "党", "翟", "谭", "贡", "劳", "逄", "姬", "申", "扶", "堵", "冉", "宰", "郦", "雍", "却", "璩", "桑", "桂", "濮", "牛", "寿", "通", "边", "扈", "燕", "冀", "郏", "浦", "尚", "农", "温", "别", "庄", "晏", "柴", "瞿", "阎", "充", "慕", "连", "茹", "习", "宦", "艾", "鱼", "容", "向", "古", "易", "慎", "戈", "廖", "庾", "终", "暨", "居", "衡", "步", "都", "耿", "满", "弘", "匡", "国", "文", "寇", "广", "禄", "阙", "东", "欧", "殳", "沃", "利", "蔚", "越", "夔", "隆", "师", "巩", "厍", "聂", "晁", "勾", "敖", "融", "冷", "訾", "辛", "阚", "那", "简", "饶", "空", "曾", "毋", "沙", "乜", "养", "鞠", "须", "丰", "巢", "关", "蒯", "相", "查", "后", "荆", "红", "游", "竺", "权", "逯", "盖", "益", "桓", "公"],
          compounds: ["司马", "欧阳", "上官", "诸葛", "公孙", "令狐", "皇甫", "尉迟", "长孙", "慕容", "司徒", "司空", "夏侯", "东方", "独孤", "鲜于", "宇文", "呼延", "百里", "东郭", "南门", "羊舌", "微生", "公冶", "太叔", "漆雕", "壤驷", "夹谷", "拓跋"],
          defaultOn: true
        }
      },
      instructions: ["识别实体名时优先校验姓氏；单姓/复姓命中可作为『姓+名』判定的先验。"],
      triggers     : { priority: 999 }
    }
  },
  {
    slug : "chinese-name-pattern",
    name : "中文名字模式",
    category: SkillCategory.NAME_PATTERN,
    description: "中文人名结构规则：长度、描述性短语、关系复合词、硬/软阻断后缀。",
    scope: "GLOBAL",
    content: {
      schemaVersion: 1,
      kind         : "NAME_PATTERN",
      knowledge    : {
        categories: [
          { category: "全名", description: "姓 + 名（王冕/范进），复姓全名（诸葛亮/司马懿）", handling: "作为实体，canonical 取全名" },
          { category: "称谓式", description: "姓/名 + 尊称或官职（范老爷/周学道），字/号（周进字推官）", handling: "同一实体的别称，作 alias" },
          { category: "关系复合词", description: "X之父 / X之妻 / X之兄——描述关系，不指代具体某人", handling: "不建实体" },
          { category: "描述性短语", description: "X老者 / 那少年 / 某公——泛指或不确定指代", handling: "不建实体，除非上下文明确指代某人" }
        ]
      },
      instructions: [
        "提取时结合上下文判断：有名有姓取全名作 canonical；仅称谓/官职代称作为该实体的 alias；关系复合词与描述性短语不建实体。"
      ],
      triggers     : { priority: 998 }
    }
  },
  {
    slug : "classical-generic-titles",
    name : "古典文学泛称",
    category: SkillCategory.GENERIC_TITLE,
    description: "古典文学高频泛称（老爷/先生/夫人等），防止被误识别为具体实体。",
    scope: "GLOBAL",
    content: {
      schemaVersion: 1,
      kind         : "GENERIC_TITLE",
      knowledge    : {
        categories: [
          { category: "尊称", description: "老爷/先生/夫人/太太/相公/公子/小姐/娘子——对人物的敬称", handling: "本书内特指某人时作为其 alias" },
          { category: "官职", description: "大人/学道/知县/尚书/皇上/太后——以官职或身份代称", handling: "同 alias；不独立建实体" },
          { category: "亲属", description: "母亲/父亲/兄长/岳父/兄弟——亲属称谓", handling: "指向关系对象，不独立建实体" }
        ]
      },
      instructions: [
        "泛称/称谓不特指某人时 → 不提取为实体；本书内明确特指某人（如范老爷=范进）→ 作为该实体的 alias，不建新实体。"
      ],
      triggers     : { priority: 997 }
    }
  },
  {
    slug : "classical-relationship-types",
    name : "古典关系类型",
    category: SkillCategory.RELATIONSHIP_TYPE,
    description: "古典文学核心关系类型字典（家庭/教育/官场/社交），关系事实 code 必须取自本字典。",
    scope: "GLOBAL",
    content: {
      schemaVersion: 1,
      kind         : "RELATIONSHIP_TYPE",
      knowledge    : {
        relationshipTypes: [
          { code: "父子", name: "父子", group: "家庭", directionMode: "INVERSE", sourceRoleLabel: "父", targetRoleLabel: "子", edgeLabel: "父子", aliases: ["父与子"], examples: ["严监生是严大位的父亲"], sortOrder: 1, sentiment: "positive" },
          { code: "母子", name: "母子", group: "家庭", directionMode: "INVERSE", sourceRoleLabel: "母", targetRoleLabel: "子", edgeLabel: "母子", aliases: [], examples: [], sortOrder: 2, sentiment: "positive" },
          { code: "兄弟", name: "兄弟", group: "家庭", directionMode: "SYMMETRIC", edgeLabel: "兄弟", aliases: ["手足", "弟兄"], examples: ["娄三公子与娄四公子是兄弟"], sortOrder: 3, sentiment: "positive" },
          { code: "夫妻", name: "夫妻", group: "家庭", directionMode: "SYMMETRIC", edgeLabel: "夫妻", aliases: ["夫妇", "两口子"], examples: [], sortOrder: 4, sentiment: "positive" },
          { code: "师生", name: "师生", group: "教育", directionMode: "INVERSE", sourceRoleLabel: "师", targetRoleLabel: "生", edgeLabel: "师生", aliases: ["受业", "门生", "座师"], examples: ["范进拜周学道为座师"], sortOrder: 10, sentiment: "positive" },
          { code: "同年", name: "同年", group: "科举", directionMode: "SYMMETRIC", edgeLabel: "同年", aliases: ["同科"], examples: ["汤奉与范进同年"], sortOrder: 11, sentiment: "neutral" },
          { code: "同僚", name: "同僚", group: "官场", directionMode: "SYMMETRIC", edgeLabel: "同僚", aliases: ["同寅"], examples: [], sortOrder: 20, sentiment: "neutral" },
          { code: "主仆", name: "主仆", group: "社会", directionMode: "INVERSE", sourceRoleLabel: "主", targetRoleLabel: "仆", edgeLabel: "主仆", aliases: ["主家", "仆人"], examples: [], sortOrder: 21, sentiment: "neutral" },
          { code: "朋友", name: "朋友", group: "社交", directionMode: "SYMMETRIC", edgeLabel: "朋友", aliases: ["好友", "故交"], examples: [], sortOrder: 30, sentiment: "positive" },
          { code: "仇敌", name: "仇敌", group: "敌对", directionMode: "SYMMETRIC", edgeLabel: "仇敌", aliases: ["仇家", "死对头"], examples: [], sortOrder: 40, sentiment: "negative" }
        ]
      },
      instructions: ["关系事实的 relationshipTypeCode 必须取自本字典；口语化关系先经 alias 映射到规范 code。"],
      triggers     : { priority: 996 }
    }
  }
] as const;

/** 把基线 content 对象组装为 MD 文档（frontmatter 元数据 + 正文指令 + 知识 YAML 块）。 */
function buildBaselineMarkdown(content: {
  kind        : string;
  knowledge  ?: unknown;
  instructions?: string[];
  triggers   ?: { priority?: number; bookTypeKeys?: string[]; taskTypes?: string[] };
}): string {
  const parts: string[] = [serializeSkillFrontmatter({
    kind    : content.kind,
    triggers: {
      priority     : content.triggers?.priority ?? 0,
      bookTypeKeys : content.triggers?.bookTypeKeys,
      taskTypes    : content.triggers?.taskTypes
    }
  })];

  if (content.instructions && content.instructions.length > 0) {
    parts.push("", "## 指令");
    parts.push(...content.instructions.map((item) => `- ${item}`));
  }

  if (content.knowledge) {
    parts.push("", "## 知识", "");
    parts.push("```yaml");
    parts.push(yamlDump(content.knowledge, { lineWidth: -1 }).trimEnd());
    parts.push("```");
  }

  return parts.join("\n");
}

/** 供 seed.ts 复用：幂等写入基线技能（存在则新增激活版本，应用最新语义内容）。 */
export async function seedSkillBaselines(prisma: PrismaClient): Promise<number> {
  let touchedCount = 0;
  for (const baseline of BASELINE_SKILLS) {
    const newContent = buildBaselineMarkdown(baseline.content as never);
    const existing = await prisma.skill.findUnique({
      where: { slug: baseline.slug },
      select: { id: true, versions: { where: { isActive: true }, select: { id: true, content: true, versionNo: true }, take: 1 } }
    });

    if (!existing) {
      await prisma.skill.create({
        data: {
          slug        : baseline.slug,
          name        : baseline.name,
          description : baseline.description,
          category    : baseline.category,
          scope       : baseline.scope,
          status      : SkillStatus.ACTIVE,
          source      : "MANUAL",
          isBuiltin   : true,
          versions    : {
            create: {
              versionNo : 1,
              content   : newContent,
              isActive  : true,
              isBaseline: true
            }
          }
        },
        select: { id: true, slug: true }
      });
      console.log(`✅ 技能已创建: ${baseline.slug}`);
      touchedCount += 1;
      continue;
    }

    // 已存在：内容相同则跳过；不同则新增激活版本（旧版失活，保留历史）
    const active = existing.versions[0];
    if (active && active.content === newContent) {
      console.log(`⏭ 技能无变化，跳过: ${baseline.slug}`);
      continue;
    }

    const nextVersion = (active?.versionNo ?? 0) + 1;
    await prisma.$transaction(async (tx) => {
      await tx.skillVersion.updateMany({
        where: { skillId: existing.id, isActive: true },
        data : { isActive: false }
      });
      await tx.skillVersion.create({
        data: {
          skillId  : existing.id,
          versionNo: nextVersion,
          content  : newContent,
          isActive : true,
          isBaseline: true,
          changeNote: "v5 语义化重写：机械规则 → AI 阅读的语义知识"
        }
      });
    });
    console.log(`🔄 技能已更新: ${baseline.slug} → v${nextVersion}`);
    touchedCount += 1;
  }

  return touchedCount;
}

/** 独立 CLI 入口（也可被 seed.ts 复用）。 */
async function main() {
  const adapter = new PrismaPg({ connectionString });
  const prisma = new PrismaClient({ adapter });
  const count = await seedSkillBaselines(prisma);
  await prisma.$disconnect();
  console.log(`🎉 skill 基线种子完成，新建 ${count} 个`);
}

// 主模块守卫：仅直接运行时执行 CLI 入口；被 seed.ts 导入时不触发。
const isMainModule = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMainModule) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
