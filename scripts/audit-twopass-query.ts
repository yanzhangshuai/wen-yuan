import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const connStr = process.env.DATABASE_URL;
if (!connStr) throw new Error("Missing DATABASE_URL");
const adapter = new PrismaPg({ connectionString: connStr });
const prisma = new PrismaClient({ adapter });
const BOOK_ID = "f98248ac-3e91-4066-a2e1-71cc57acdd9c";

async function main() {
  // 1. Book info
  const book = await prisma.book.findUnique({
    where : { id: BOOK_ID },
    select: { title: true, author: true, status: true, parseProgress: true, bookTypeId: true }
  });
  console.log("=== BOOK ===");
  console.log(JSON.stringify(book, null, 2));

  // 2. Analysis jobs
  const jobs = await prisma.analysisJob.findMany({
    where  : { bookId: BOOK_ID },
    orderBy: { createdAt: "desc" },
    take   : 5,
    select : { id: true, architecture: true, status: true, scope: true, createdAt: true }
  });
  console.log("\n=== ANALYSIS JOBS ===");
  console.log(JSON.stringify(jobs, null, 2));

  // 3. Profile + Persona stats
  const profiles = await prisma.profile.findMany({
    where  : { bookId: BOOK_ID, deletedAt: null },
    include: { persona: { select: { id: true, name: true, aliases: true, nameType: true, confidence: true, gender: true } } }
  });
  console.log("\n=== PROFILE COUNT ===", profiles.length);

  // 4. NAME TYPE + GENDER stats
  const typeStats: Record<string, number> = {};
  const genderStats: Record<string, number> = {};
  const confBuckets: Record<string, number> = {};
  for (const p of profiles) {
    typeStats[p.persona.nameType] = (typeStats[p.persona.nameType] || 0) + 1;
    genderStats[p.persona.gender || "null"] = (genderStats[p.persona.gender || "null"] || 0) + 1;
    const bucket = p.persona.confidence < 0.4 ? "<0.4" : p.persona.confidence < 0.6 ? "0.4-0.6" : p.persona.confidence < 0.8 ? "0.6-0.8" : ">=0.8";
    confBuckets[bucket] = (confBuckets[bucket] || 0) + 1;
  }
  console.log("\n=== NAME TYPE STATS ===", JSON.stringify(typeStats));
  console.log("=== GENDER STATS ===", JSON.stringify(genderStats));
  console.log("=== CONFIDENCE BUCKETS ===", JSON.stringify(confBuckets));

  // 5. Find duplicate names
  const nameMap = new Map<string, typeof profiles>();
  for (const p of profiles) {
    const key = p.persona.name.toLowerCase();
    if (!nameMap.has(key)) nameMap.set(key, []);
    nameMap.get(key)!.push(p);
  }
  const duplicates = Array.from(nameMap.entries()).filter(([, v]) => v.length > 1);
  console.log("\n=== DUPLICATE NAMES ===", duplicates.length);
  for (const [name, items] of duplicates) {
    console.log(`  "${name}": ${items.length} profiles, IDs: ${items.map(i => i.persona.id.slice(0, 8)).join(", ")}`);
  }

  // 6. Shared aliases
  const aliasToPersonas = new Map<string, Array<{ personaId: string; name: string }>>();
  for (const p of profiles) {
    for (const alias of p.persona.aliases) {
      const key = alias.trim().toLowerCase();
      if (!aliasToPersonas.has(key)) aliasToPersonas.set(key, []);
      aliasToPersonas.get(key)!.push({ personaId: p.persona.id, name: p.persona.name });
    }
  }
  const sharedAliases = Array.from(aliasToPersonas.entries())
    .filter(([, v]) => new Set(v.map(x => x.personaId)).size > 1)
    .sort((a, b) => b[1].length - a[1].length);
  console.log("\n=== SHARED ALIASES (top 50) ===", sharedAliases.length, "total");
  for (const [alias, personas] of sharedAliases.slice(0, 50)) {
    const unique = [...new Map(personas.map(p => [p.personaId, p])).values()];
    console.log(`  "${alias}": ${unique.map(p => `${p.name}`).join(" | ")}`);
  }

  // 7. Alias mapping stats
  const aliasMappingCount = await prisma.aliasMapping.count({ where: { bookId: BOOK_ID } });
  const aliasMappingByStatus = await prisma.aliasMapping.groupBy({
    by    : ["status"],
    where : { bookId: BOOK_ID },
    _count: true
  });
  console.log("\n=== ALIAS MAPPINGS ===", aliasMappingCount);
  console.log(JSON.stringify(aliasMappingByStatus, null, 2));

  // 8. Merge suggestion stats
  const mergeSuggestionCount = await prisma.mergeSuggestion.count({ where: { bookId: BOOK_ID } });
  console.log("\n=== MERGE SUGGESTIONS ===", mergeSuggestionCount);

  // 9. ERROR PATTERN: Generic titles / relational terms as personas
  const suspectGeneric = profiles.filter(p => {
    const n = p.persona.name;
    return /^(管家|邻居|老爹|大爷|先生|客人|老太太|家人|差人|长随|书办|典史|门斗|店邻|伙计|嫖客|朝奉|舵工|丫鬟|番子|番酋|猎户|斋公|幕客|走堂的|看茶的|卖草的|樵夫)$/.test(n)
      || /^(和尚|道士|道人|老师父|贫僧|小和尚|僧宫老爷|知客|首座|火工道人)$/.test(n)
      || /^(总督|总兵|府尹|府尊|守备|参将|宗师|学师|祭酒|盐捕分府)$/.test(n)
      || /^(皇帝|万岁爷|太老师|太保公|先祖)$/.test(n)
      || /^.+的$/.test(n) // ends in "的"
      || /^(姑老爷|姑爷|母舅|表兄|女婿|小儿|奴才|浑家|二哥|六哥|老侄|小子)$/.test(n)
      || /^(右邻|左邻|邻居老爹|店家|养娘|使女|老妇人|小妮子|细姑娘)$/.test(n);
  });
  console.log("\n=== SUSPECT GENERIC/RELATIONAL PERSONAS ===", suspectGeneric.length);
  for (const p of suspectGeneric) {
    console.log(`  name="${p.persona.name}" aliases=[${p.persona.aliases.join(", ")}] conf=${p.persona.confidence}`);
  }

  // 10. ERROR PATTERN: Historical/literary figures mixed in 
  const suspectHistorical = profiles.filter(p => {
    const n = p.persona.name;
    return /^(朱元璋|建文皇帝|永乐皇帝|嘉靖皇帝|万历皇帝|宋高宗|仁宗皇帝|秦穆公|汉哀帝)$/.test(n)
      || /^(曾子|孟子|孔夫子|夫子|屈原|苏轼|东坡|李太白|董仲舒|公孙弘|于谦|王守仁)$/.test(n)
      || /^(刘基|高启|何景明|朱淑贞|苏若兰|李清照|解缙|谢茂秦|王守溪|梁灏)$/.test(n)
      || /^(纯阳老祖|关圣帝君|文昌帝君|魁星老爷|周公|吴泰伯|尧舜|春申君|信陵君|泄柳|段干木|红娘)$/.test(n)
      || /^(赵王|淮阴|鄂君|张王|洪武|董贤|郭噗|丁仙)$/.test(n)
      || /^(罗邺|方干|胡居仁|薛宣|吴景|周宪|甘露僧|萧浩|牛瑶|景木蕙|陈春|韦阐|庄洁|严大位|娄奉|冯瑶|蘧祜)$/.test(n);
  });
  console.log("\n=== SUSPECT HISTORICAL/LITERARY FIGURES ===", suspectHistorical.length);
  for (const p of suspectHistorical) {
    console.log(`  name="${p.persona.name}" aliases=[${p.persona.aliases.join(", ")}] conf=${p.persona.confidence}`);
  }

  // 11. ERROR PATTERN: Family/house names as personas
  const suspectFamilyHouse = profiles.filter(p => {
    const n = p.persona.name;
    return /^(方府|彭府|虞家|方家|彭家|冯家|尤家|吴家|贾家)$/.test(n)
      || /^.+家$/.test(n) && n.length <= 3
      || /^(娄氏弟兄|两位都督|温州姓张的|三房里叔子)$/.test(n);
  });
  console.log("\n=== SUSPECT FAMILY/HOUSE NAMES ===", suspectFamilyHouse.length);
  for (const p of suspectFamilyHouse) {
    console.log(`  name="${p.persona.name}" aliases=[${p.persona.aliases.join(", ")}] conf=${p.persona.confidence}`);
  }

  // 12. ERROR PATTERN: Descriptive phrases as persona names
  const suspectDescriptive = profiles.filter(p => {
    const n = p.persona.name;
    return n.length > 5 && (/的/.test(n) || /老朋友/.test(n) || /之/.test(n) || /其余/.test(n) || /公婆/.test(n))
      || /^(报子上的老爷们|卖人参的|卖菱小孩|卖纸的客人|挑粪桶的|写寿文秀才|又疑又聋的老妪|死砍头短命的奴才)$/.test(n)
      || /^(王玉辉老朋友|王玉辉其余女儿|王玉辉大女儿|王玉辉老妻|邓质夫母亲|邓质夫父亲|三姑娘公婆|匡超人阿舅|匡超人丈母|匡超人浑家)$/.test(n)
      || /^(虞育德之祖父|虞育德之母|虞华轩叔祖母|虞华轩堂弟|陈和甫丈人|祁太公孙女|杜府殿元公)$/.test(n)
      || /^(安民的官|看祠的人|盐店管事先生|文瀚楼店主人|高要县汤公|无为州州尊|应天府尹)$/.test(n)
      || /^(老朋友儿子|小儿子|钱麻子老婆|王家女儿|邹吉甫妻|庄征君娘子|胡姓财主|广东妇人)$/.test(n);
  });
  console.log("\n=== SUSPECT DESCRIPTIVE PHRASES ===", suspectDescriptive.length);
  for (const p of suspectDescriptive) {
    console.log(`  name="${p.persona.name}" aliases=[${p.persona.aliases.join(", ")}] conf=${p.persona.confidence}`);
  }

  // 13. ERROR PATTERN: Same person split into multiple entities
  // Check specific known splits from user data
  const splitCandidates = [
    { names: ["迟衡山", "迟均", "迟相公", "衡山先生"], label: "迟衡山" },
    { names: ["虞育德", "虞者爷", "虞老先生", "虞博士"], label: "虞育德" },
    { names: ["杜慎卿", "慎卿先生", "慎卿相公", "慎卿", "杜老爷", "杜倩"], label: "杜慎卿/杜倩" },
    { names: ["张静斋", "张乡绅", "张静齐"], label: "张静斋" },
    { names: ["向鼎", "向知县", "向太爷", "向观察"], label: "向鼎" },
    { names: ["周进", "周老爷"], label: "周进" },
    { names: ["牛布衣", "牛玉圃", "牛浦", "牛浦郎", "浦郎", "侄孙", "牛姑爷"], label: "牛家" },
    { names: ["景兰江", "景本意", "景本蕙", "景木蕙"], label: "景兰江" },
    { names: ["严贡生", "严监生", "严致中", "严大先生", "严世兄"], label: "严家兄弟" },
    { names: ["娄三公子", "娄琫", "表兄", "娄四公子", "娄瓒", "娄太爷", "娄氏弟兄", "娄大相公"], label: "娄家" },
    { names: ["匡超人", "匡迥", "匡爷", "匡兄", "二相公"], label: "匡超人" },
    { names: ["鲍文卿", "鲍老爷", "鲍廷玺", "小儿子", "女婿", "姑老爷"], label: "鲍家" },
    { names: ["蘧駪夫", "蘧来旬", "验夫", "蘧小少爷", "蘧公孙", "蘧太爷", "蘧姑老爷", "小公子", "姑爷", "蘧驼夫"], label: "蘧家" },
    { names: ["季苇萧", "季兄", "季老爷", "季年兄", "季萑"], label: "季苇萧" },
    { names: ["庄绍光", "庄先生", "庄表叔", "庄濯江", "庄非熊"], label: "庄家" },
    { names: ["余有达", "余有重", "二哥", "余殷", "余敷", "余夔"], label: "余家" },
    { names: ["武书", "武先生"], label: "武书" },
    { names: ["臧三爷", "臧茶", "臧歧", "臧蓼斋"], label: "臧家" },
    { names: ["张铁臂", "张二爷", "张相公"], label: "张俊民/张铁臂" },
    { names: ["郭力", "郭老爷", "郭孝子", "郭孝子父"], label: "郭家" },
    { names: ["邓质夫", "老侄", "邓老爷"], label: "邓质夫" },
    { names: ["陈礼", "和甫", "陈先生", "陈和尚"], label: "陈和甫" },
    { names: ["汤镇台", "汤大老爷", "汤六老爷", "汤大爷", "汤二爷", "汤二公子", "汤相公"], label: "汤家" },
    { names: ["萧云仙", "萧柏泉", "萧昊轩", "萧二老爹", "萧金铉"], label: "萧家" },
    { names: ["王蕴", "王玉辉"], label: "王玉辉" },
    { names: ["苗镇台", "苗而秀"], label: "苗" },
    { names: ["李老爷", "李大人"], label: "李" },
    { names: ["徐咏", "九老爷", "徐九老爷", "徐二公子"], label: "徐家" },
    { names: ["金次福", "母舅", "金修义"], label: "金家" }
  ];

  console.log("\n=== ENTITY SPLIT CHECK ===");
  for (const { names, label } of splitCandidates) {
    const found = profiles.filter(p =>
      names.some(n => p.persona.name === n || p.persona.name.includes(n))
    );
    if (found.length > 1) {
      console.log(`  [${label}] ${found.length} entities:`);
      for (const p of found) {
        console.log(`    "${p.persona.name}" localName="${p.localName}" aliases=[${p.persona.aliases.slice(0, 5).join(",")}${p.persona.aliases.length > 5 ? "..." : ""}] conf=${p.persona.confidence}`);
      }
    }
  }

  // 14. Mention counts per persona (top 20 and bottom 20)
  const mentionCounts = await prisma.mention.groupBy({
    by     : ["personaId"],
    where  : { chapter: { bookId: BOOK_ID } },
    _count : { id: true },
    orderBy: { _count: { personaId: "desc" } },
    take   : 20
  });
  console.log("\n=== TOP 20 PERSONAS BY MENTION COUNT ===");
  for (const mc of mentionCounts) {
    const p = profiles.find(pr => pr.persona.id === mc.personaId);
    console.log(`  ${p?.persona.name || "?"} (${mc.personaId.slice(0, 8)}): ${mc._count.id} mentions`);
  }

  // Personas with 0 or 1 mention  
  const allMentionCounts = await prisma.mention.groupBy({
    by    : ["personaId"],
    where : { chapter: { bookId: BOOK_ID } },
    _count: { id: true }
  });
  const mentionMap = new Map(allMentionCounts.map(mc => [mc.personaId, mc._count.id]));
  const lowMentionPersonas = profiles.filter(p => (mentionMap.get(p.persona.id) || 0) <= 1);
  console.log(`\n=== PERSONAS WITH <=1 MENTION === ${lowMentionPersonas.length}`);
  for (const p of lowMentionPersonas.slice(0, 30)) {
    console.log(`  "${p.persona.name}" mentions=${mentionMap.get(p.persona.id) || 0} conf=${p.persona.confidence}`);
  }

  // 15. Chapter count
  const chapterCount = await prisma.chapter.count({ where: { bookId: BOOK_ID } });
  console.log(`\n=== CHAPTERS === ${chapterCount}`);

  // 16. Phase logs for the latest job
  if (jobs.length > 0) {
    const latestJob = jobs[0];
    const phaseLogs = await prisma.analysisPhaseLog.findMany({
      where  : { jobId: latestJob.id },
      orderBy: { createdAt: "asc" },
      take   : 10,
      select : { stage: true, status: true, errorMessage: true, createdAt: true }
    });
    console.log(`\n=== PHASE LOGS (job ${latestJob.id.slice(0,8)}) ===`);
    for (const pl of phaseLogs) {
      console.log(`  ${pl.stage} | ${pl.status} | ${pl.errorMessage?.slice(0, 100) || ""}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
