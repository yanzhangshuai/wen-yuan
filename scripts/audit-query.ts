import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

const connStr = process.env.DATABASE_URL;
if (!connStr) throw new Error("Missing DATABASE_URL");
const adapter = new PrismaPg({ connectionString: connStr });
const prisma = new PrismaClient({ adapter });
const BOOK_ID = "402f2282-1a27-4aa4-bf5b-726f0bb1b28a";

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
    take   : 3,
    select : { id: true, architecture: true, status: true, scope: true, createdAt: true }
  });
  console.log("\n=== ANALYSIS JOBS ===");
  console.log(JSON.stringify(jobs, null, 2));

  // 3. Persona stats
  const profiles = await prisma.profile.findMany({
    where  : { bookId: BOOK_ID, deletedAt: null },
    include: { persona: { select: { id: true, name: true, aliases: true, nameType: true, confidence: true, gender: true } } }
  });
  console.log("\n=== PROFILE COUNT ===", profiles.length);

  // 4. Find duplicates - personas with same name
  const nameMap = new Map<string, typeof profiles>();
  for (const p of profiles) {
    const key = p.persona.name.toLowerCase();
    if (!nameMap.has(key)) nameMap.set(key, []);
    nameMap.get(key)!.push(p);
  }
  const duplicates = Array.from(nameMap.entries()).filter(([, v]) => v.length > 1);
  console.log("\n=== DUPLICATE NAMES (same persona.name) ===", duplicates.length);
  for (const [name, items] of duplicates) {
    console.log(`  "${name}": ${items.length} profiles, personas: ${items.map(i => i.persona.id).join(", ")}`);
  }

  // 5. Find personas with overlapping aliases
  const aliasToPersonas = new Map<string, Array<{ personaId: string; name: string }>>();
  for (const p of profiles) {
    for (const alias of p.persona.aliases) {
      const key = alias.trim().toLowerCase();
      if (!aliasToPersonas.has(key)) aliasToPersonas.set(key, []);
      aliasToPersonas.get(key)!.push({ personaId: p.persona.id, name: p.persona.name });
    }
  }
  const sharedAliases = Array.from(aliasToPersonas.entries())
    .filter(([, v]) => {
      const uniqueIds = new Set(v.map(x => x.personaId));
      return uniqueIds.size > 1;
    });
  console.log("\n=== SHARED ALIASES (same alias, different personas) ===", sharedAliases.length);
  for (const [alias, personas] of sharedAliases.slice(0, 30)) {
    const unique = [...new Map(personas.map(p => [p.personaId, p])).values()];
    console.log(`  alias="${alias}": ${unique.map(p => `${p.name}(${p.personaId.slice(0,8)})`).join(" vs ")}`);
  }

  // 6. Sample problematic patterns from user's data
  // Find "张静斋" vs "张乡绅" issue
  const zhangProfiles = profiles.filter(p =>
    p.persona.name.includes("张") && (p.persona.name.includes("静斋") || p.persona.name.includes("乡绅"))
  );
  console.log("\n=== 张静斋/张乡绅 ===");
  for (const p of zhangProfiles) {
    console.log(`  ${p.persona.name} [${p.persona.id.slice(0,8)}] aliases: ${p.persona.aliases.join(", ")}`);
  }

  // Find "鲍文卿" vs "鲍廷玺" issue (user data shows localName mixup)
  const baoProfiles = profiles.filter(p =>
    p.persona.name.includes("鲍") || p.persona.aliases.some(a => a.includes("鲍"))
  );
  console.log("\n=== 鲍 family ===");
  for (const p of baoProfiles) {
    console.log(`  name=${p.persona.name} localName=${p.localName} [${p.persona.id.slice(0,8)}] aliases: ${p.persona.aliases.join(", ")}`);
  }

  // 7. Count merge suggestions
  const mergeSuggestionCount = await prisma.mergeSuggestion.count({
    where: { bookId: BOOK_ID }
  });
  console.log("\n=== MERGE SUGGESTIONS ===", mergeSuggestionCount);

  // 8. Alias mappings stats
  const aliasMappingCount = await prisma.aliasMapping.count({
    where: { bookId: BOOK_ID }
  });
  const aliasMappingByStatus = await prisma.aliasMapping.groupBy({
    by    : ["status"],
    where : { bookId: BOOK_ID },
    _count: true
  });
  console.log("\n=== ALIAS MAPPINGS ===", aliasMappingCount);
  console.log(JSON.stringify(aliasMappingByStatus, null, 2));

  // 9. Check specific problematic cases from user data
  // 陈礼 vs 和甫 (both mapped to 陈和甫)
  const chenProfiles = profiles.filter(p =>
    p.persona.name.includes("陈") && (p.persona.name.includes("和甫") || p.persona.name.includes("陈礼"))
  );
  console.log("\n=== 陈礼/陈和甫/和甫 ===");
  for (const p of chenProfiles) {
    console.log(`  name=${p.persona.name} localName=${p.localName} [${p.persona.id.slice(0,8)}] aliases: ${p.persona.aliases.join(", ")}`);
  }

  // 向鼎 mapped to 董知县
  const xiangProfiles = profiles.filter(p =>
    p.persona.name.includes("向") || p.persona.aliases.some(a => a.includes("向鼎"))
  );
  console.log("\n=== 向鼎/董知县 ===");
  for (const p of xiangProfiles) {
    console.log(`  name=${p.persona.name} localName=${p.localName} [${p.persona.id.slice(0,8)}] aliases: ${p.persona.aliases.join(", ")}`);
  }

  // 严贡生 appears twice  
  const yanProfiles = profiles.filter(p =>
    p.persona.name.includes("严") && (p.persona.name.includes("贡生") || p.persona.name.includes("致中"))
  );
  console.log("\n=== 严贡生/严致中 ===");
  for (const p of yanProfiles) {
    console.log(`  name=${p.persona.name} localName=${p.localName} [${p.persona.id.slice(0,8)}] aliases: ${p.persona.aliases.join(", ")}`);
  }

  // 娄三公子 aliases contains 娄四公子 (wrong merge)
  const louProfiles = profiles.filter(p =>
    p.persona.name.includes("娄") || p.persona.aliases.some(a => a.includes("娄"))
  );
  console.log("\n=== 娄 family ===");
  for (const p of louProfiles) {
    console.log(`  name=${p.persona.name} localName=${p.localName} [${p.persona.id.slice(0,8)}] aliases: ${p.persona.aliases.join(", ")}`);
  }

  // 管家 mapped to 尤胡子 (massive alias pollution)
  const guanjiaProfiles = profiles.filter(p =>
    p.persona.name.includes("管家") || p.persona.aliases.some(a => a.includes("管家"))
  );
  console.log("\n=== 管家 ===");
  for (const p of guanjiaProfiles) {
    console.log(`  name=${p.persona.name} localName=${p.localName} [${p.persona.id.slice(0,8)}] aliases: ${p.persona.aliases.join(", ")}`);
  }

  // 邻居 mapped to 张国重
  const linjiProfiles = profiles.filter(p =>
    p.persona.name.includes("邻居") || p.persona.aliases.some(a => a.includes("邻居"))
  );
  console.log("\n=== 邻居 ===");
  for (const p of linjiProfiles) {
    console.log(`  name=${p.persona.name} localName=${p.localName} [${p.persona.id.slice(0,8)}] aliases: ${p.persona.aliases.join(", ")}`);
  }

  // Persona type stats
  const typeStats = profiles.reduce((acc, p) => {
    acc[p.persona.nameType] = (acc[p.persona.nameType] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log("\n=== NAME TYPE STATS ===", JSON.stringify(typeStats));

  // Gender stats
  const genderStats = profiles.reduce((acc, p) => {
    const g = p.persona.gender || "null";
    acc[g] = (acc[g] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  console.log("=== GENDER STATS ===", JSON.stringify(genderStats));

  // 10. Look at 景兰江 (appears in two rows in user data)
  const jingProfiles = profiles.filter(p =>
    p.persona.name.includes("景") || p.persona.aliases.some(a => a.includes("景兰江"))
  );
  console.log("\n=== 景兰江 ===");
  for (const p of jingProfiles) {
    console.log(`  name=${p.persona.name} localName=${p.localName} [${p.persona.id.slice(0,8)}] aliases: ${p.persona.aliases.join(", ")}`);
  }

  // 卢德 appears twice
  const luProfiles = profiles.filter(p =>
    p.persona.name === "卢德" || p.persona.aliases.some(a => a === "卢德")
  );
  console.log("\n=== 卢德 ===");
  for (const p of luProfiles) {
    console.log(`  name=${p.persona.name} localName=${p.localName} [${p.persona.id.slice(0,8)}] aliases: ${p.persona.aliases.join(", ")}`);
  }

  // 杜倩 mapped to 杜慎卿 (wrong person)
  const duProfiles = profiles.filter(p =>
    p.persona.name.includes("杜") && (p.persona.name.includes("倩") || p.persona.name.includes("慎卿"))
  );
  console.log("\n=== 杜倩/杜慎卿 ===");
  for (const p of duProfiles) {
    console.log(`  name=${p.persona.name} localName=${p.localName} [${p.persona.id.slice(0,8)}] aliases: ${p.persona.aliases.join(", ")}`);
  }

  // 匡太公 mapped to 郑老爹
  const kuangProfiles = profiles.filter(p =>
    p.persona.name.includes("匡太公") || p.persona.aliases.some(a => a.includes("匡太公"))
  );
  console.log("\n=== 匡太公/郑老爹 ===");
  for (const p of kuangProfiles) {
    console.log(`  name=${p.persona.name} localName=${p.localName} [${p.persona.id.slice(0,8)}] aliases: ${p.persona.aliases.join(", ")}`);
  }

  await prisma.$disconnect();
}

main();
