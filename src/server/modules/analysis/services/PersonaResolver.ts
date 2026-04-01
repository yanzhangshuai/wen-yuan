import type { PrismaClient } from "@/generated/prisma/client";
import { NameType, PersonaType } from "@/generated/prisma/enums";
import type { AliasRegistryService } from "@/server/modules/analysis/services/AliasRegistryService";
import { ANALYSIS_PIPELINE_CONFIG } from "@/server/modules/analysis/config/pipeline";

/**
 * 功能：泛化称谓集合——无法唯一指向某一具体人物的称谓，直接标记为幻觉，阻止创建伪实体。
 * 精确匹配（大小写不敏感）。
 * 输入：无。
 * 输出：无（Set 常量）。
 * 异常：无。
 * 副作用：无。
 */
export const GENERIC_TITLES = new Set([
  // 基本称谓
  "老爷", "夫人", "太太", "老太太", "小姐", "少爷", "公子", "相公", "娘子", "先生",
  // 职位泛称
  "掌柜", "掌柜的", "账房", "管家", "老管家", "门房", "门子",
  "小厮", "书童", "丫鬟", "丫头", "奴婢", "仆人", "仆役", "家丁", "下人",
  // 纯职务称呼（不含姓氏前缀时无定指）
  "书办", "掌舵", "按察司", "布政司", "都司", "参将", "千总", "把总",
  // 社会身份泛称（单独出现时无定指）
  "员外", "举人", "秀才", "进士", "状元", "老学究",
  // 人称代词/方位性代词
  "此人", "那人", "来人", "众人", "旁人", "大家", "诸人", "某人", "一人",
  "他", "她", "他们", "她们", "吾", "汝", "彼", "尔",
  // 亲属泛称（无专名前缀时）
  "父亲", "母亲", "老父", "老母", "老娘", "娘亲",
  "兄长", "兄弟", "姐姐", "弟弟", "妹妹", "妻子"
]);

/**
 * 亲属关系后缀词：若较短名 + 关系词恰好构成较长字符串，视为不同人物，阻止子串合并。
 * 例："蘧公孙" 不应与 "蘧公孙父亲" 合并，"何美之" 不应与 "何美之太太" 合并。
 */
const RELATIONAL_SUFFIXES = new Set([
  "父亲", "母亲", "太太", "夫人", "儿子", "女儿",
  "兄弟", "兄长", "弟弟", "姐姐", "妹妹",
  "老爹", "老娘", "之妻", "之子", "之父", "之母",
  "大人", "将军", "老爷", "先生", "娘子"
]);

const TITLE_PATTERN = /(皇帝|太后|太祖|太宗|吴王|国公|侯|伯|王)$/;
const POSITION_PATTERN = /(丞相|太守|知府|知县|将军|尚书|侍郎|巡抚|总督|学道|老爷|先生)$/;

function inferAliasType(name: string): "TITLE" | "POSITION" | "NICKNAME" {
  if (TITLE_PATTERN.test(name)) {
    return "TITLE";
  }

  if (POSITION_PATTERN.test(name)) {
    return "POSITION";
  }

  return "NICKNAME";
}

/**
 * 功能：定义实体对齐输入参数。
 * 输入：无。
 * 输出：类型约束 ResolveInput。
 * 异常：无。
 * 副作用：无。
 */
interface ResolveInput {
  bookId         : string;
  extractedName  : string;
  chapterContent : string;
  chapterNo?     : number;
  /**
   * Phase 1 名册预解析映射：surfaceForm → personaId（已知实体）| "GENERIC"（泛化称谓）。
   * 存在时优先用于快速解析，跳过相似度计算。
   */
  rosterMap?     : Map<string, string>;
  /**
   * Phase 1 标记为 TITLE_ONLY 的新建称号集合（surfaceForm）。
   * 存在时，在 Step 5 创建 persona 时写入 nameType = TITLE_ONLY。
   */
  titleOnlyNames?: Set<string>;
}

/**
 * 功能：定义实体对齐结果。
 * 输入：无。
 * 输出：类型约束 ResolveResult。
 * 异常：无。
 * 副作用：无。
 */
export interface ResolveResult {
  status      : "resolved" | "created" | "hallucinated";
  personaId?  : string;
  confidence  : number;
  matchedName?: string;
  reason?     : string;
}

type TxLike = Pick<
  PrismaClient,
  "persona" | "profile" | "aliasMapping"
>;

/**
 * 功能：定义候选实体结构（供相似度打分使用）。
 * 输入：无。
 * 输出：类型约束 CandidatePersona。
 * 异常：无。
 * 副作用：无。
 */
interface CandidatePersona {
  id     : string;
  name   : string;
  aliases: string[];
}

/**
 * 功能：创建实体对齐服务，将 AI 抽取姓名对齐到已有 Persona。
 * 输入：prisma - 数据库客户端（可注入，便于测试）。
 * 输出：包含 resolve 方法的服务对象。
 * 异常：数据库操作失败时抛错。
 * 副作用：可能新增 persona/profile，或 upsert profile。
 */
export function createPersonaResolver(
  prisma: PrismaClient,
  aliasRegistry?: AliasRegistryService
) {
  async function loadCandidates(client: TxLike, bookId: string, extracted: string): Promise<CandidatePersona[]> {
    // 第一层：精确/半精确召回（名字、别名、书内称呼）。
    const directMatches = await client.persona.findMany({
      where: {
        OR: [
          { name: { contains: extracted, mode: "insensitive" } },
          { aliases: { has: extracted } },
          {
            profiles: {
              some: {
                bookId,
                localName: { contains: extracted, mode: "insensitive" }
              }
            }
          }
        ]
      },
      include: {
        profiles: {
          where : { bookId },
          select: { localName: true }
        }
      },
      take: 40
    });

    if (directMatches.length > 0) {
      return directMatches.map((item) => ({
        id     : item.id,
        name   : item.name,
        aliases: Array.from(new Set([
          ...item.aliases,
          ...item.profiles.map((profile) => profile.localName)
        ]))
      }));
    }

    // 第二层回退：召回当前书已出现的全部 persona，再由相似度筛选。
    const fallbackBookMatches = await client.persona.findMany({
      where: {
        profiles: {
          some: { bookId }
        }
      },
      include: {
        profiles: {
          where : { bookId },
          select: { localName: true }
        }
      },
      take: 200
    });

    return fallbackBookMatches.map((item) => ({
      id     : item.id,
      name   : item.name,
      aliases: Array.from(new Set([
        ...item.aliases,
        ...item.profiles.map((profile) => profile.localName)
      ]))
    }));
  }

  /**
   * 功能：将 AI 抽取姓名对齐到已有 Persona，必要时创建新 Persona。
   * 输入：input - 抽取姓名与章节信息；tx - 可选事务客户端。
   * 输出：ResolveResult（resolved/created/hallucinated）。
   * 异常：数据库操作失败时抛错。
   * 副作用：可能新增 persona/profile，或 upsert profile。
   */
  async function resolve(input: ResolveInput, tx?: TxLike): Promise<ResolveResult> {
    const client = tx ?? prisma;
    const extracted = normalizeName(input.extractedName);

    // Step 0: 空名字直接标记为幻觉，避免写入脏数据。
    if (!extracted) {
      return {
        status    : "hallucinated",
        confidence: 0,
        reason    : "empty_name"
      };
    }

    // Step 0.5: 名字归一化后长度 < 2 → 大概率是姓氏碎片或单字噪声，直接过滤。
    if (extracted.length < 2) {
      return {
        status    : "hallucinated",
        confidence: 0,
        reason    : "name_too_short"
      };
    }

    // Step 1: 泛化称谓硬过滤——精确匹配 GENERIC_TITLES 集合。
    if (GENERIC_TITLES.has(input.extractedName.trim())) {
      return {
        status    : "hallucinated",
        confidence: 1.0,
        reason    : "generic_title"
      };
    }

    // Step 2: Phase 1 名册快速路径——优先使用预解析的 rosterMap。
    if (input.rosterMap) {
      const rosterValue = input.rosterMap.get(input.extractedName.trim());
      if (rosterValue === "GENERIC") {
        return {
          status    : "hallucinated",
          confidence: 1.0,
          reason    : "generic_title"
        };
      }
      if (rosterValue) {
        // personaId 已由 Phase 1 AI 确认 → 直接 upsert profile，无需相似度计算。
        await client.profile.upsert({
          where : { personaId_bookId: { personaId: rosterValue, bookId: input.bookId } },
          update: { localName: input.extractedName },
          create: { personaId: rosterValue, bookId: input.bookId, localName: input.extractedName }
        });
        return {
          status    : "resolved",
          personaId : rosterValue,
          confidence: 0.97
        };
      }
    }

    // Step 2.5: 别名注册表查询——检查 AliasRegistry 中是否有已确认映射。
    if (aliasRegistry && input.chapterNo !== undefined) {
      const aliasResult = await aliasRegistry.lookupAlias(input.bookId, input.extractedName.trim(), input.chapterNo);
      if (aliasResult && aliasResult.confidence >= ANALYSIS_PIPELINE_CONFIG.aliasRegistryMinConfidence && aliasResult.personaId) {
        await client.profile.upsert({
          where : { personaId_bookId: { personaId: aliasResult.personaId, bookId: input.bookId } },
          update: { localName: input.extractedName },
          create: { personaId: aliasResult.personaId, bookId: input.bookId, localName: input.extractedName }
        });

        return {
          status     : "resolved",
          personaId  : aliasResult.personaId,
          confidence : aliasResult.confidence,
          matchedName: aliasResult.resolvedName ?? undefined
        };
      }
    }

    const candidates = await loadCandidates(client, input.bookId, extracted);

    const scored = candidates
      .map((candidate) => ({
        candidate,
        score: multiSignalScore(extracted, candidate)
      }))
      .sort((a, b) => b.score - a.score);

    const winner = scored[0];

    // Step 3: 多信号评分达阈值则合并到已有 Persona。
    if (winner && winner.score >= ANALYSIS_PIPELINE_CONFIG.personaResolveMinScore) {
      // 确保该 persona 在当前书有 profile（幂等 upsert），同时更新 localName 以保留最新称谓。
      await client.profile.upsert({
        where: {
          personaId_bookId: {
            personaId: winner.candidate.id,
            bookId   : input.bookId
          }
        },
        update: { localName: input.extractedName },
        create: {
          personaId: winner.candidate.id,
          bookId   : input.bookId,
          localName: input.extractedName
        }
      });

      // 将本次抽取称谓补齐到 aliases（去重后追加），提升后续章节别名召回率。
      const normalizedExtracted = input.extractedName.trim().toLowerCase();
      const aliasExists = winner.candidate.aliases.some(
        (a) => a.trim().toLowerCase() === normalizedExtracted
      );
      if (!aliasExists && winner.candidate.name.trim().toLowerCase() !== normalizedExtracted) {
        await client.persona.update({
          where: { id: winner.candidate.id },
          data : { aliases: { push: input.extractedName } }
        });
      }

      return {
        status     : "resolved",
        personaId  : winner.candidate.id,
        confidence : winner.score,
        matchedName: winner.candidate.name
      };
    }

    // Step 4: 名字不在原文中出现，倾向判断为模型幻觉。
    if (!containsNormalizedName(input.chapterContent, input.extractedName)) {
      return {
        status     : "hallucinated",
        confidence : winner?.score ?? 0,
        matchedName: winner?.candidate.name,
        reason     : "name_not_in_chapter"
      };
    }

    // Step 5: 低置信且确实在原文出现，才创建新 Persona。
    // 将解析置信度持久化到 DB，低于 0.5 时表明创建该实体把握不足，供 UI 优先审核。
    const nameType = input.titleOnlyNames?.has(input.extractedName.trim())
      ? NameType.TITLE_ONLY
      : NameType.NAMED;
    const created = await client.persona.create({
      data: {
        name      : input.extractedName,
        type      : PersonaType.PERSON,
        nameType,
        aliases   : [input.extractedName],
        confidence: winner?.score ?? 0.35
      }
    });

    await client.profile.create({
      data: {
        personaId: created.id,
        bookId   : input.bookId,
        localName: input.extractedName
      }
    });

    if (aliasRegistry && (nameType === NameType.TITLE_ONLY || POSITION_PATTERN.test(input.extractedName) || TITLE_PATTERN.test(input.extractedName))) {
      const aliasType = nameType === NameType.TITLE_ONLY ? "TITLE" : inferAliasType(input.extractedName);
      const mappingStatus = (winner?.score ?? 0.35) >= 0.9 ? "CONFIRMED" : "PENDING";
      await aliasRegistry.registerAlias({
        bookId      : input.bookId,
        personaId   : created.id,
        alias       : input.extractedName,
        resolvedName: nameType === NameType.TITLE_ONLY ? undefined : created.name,
        aliasType,
        confidence  : winner?.score ?? 0.35,
        evidence    : "来自章节解析自动注册",
        chapterStart: input.chapterNo,
        status      : mappingStatus
      }, client);
    }

    return {
      status     : "created",
      personaId  : created.id,
      confidence : winner?.score ?? 0.35,
      matchedName: created.name
    };
  }

  return { resolve };
}

/**
 * 功能：多信号候选评分——综合精确匹配、子串包含、Levenshtein 与字符 Jaccard 等信号。
 * 输入：extractedName - 归一化后的抽取姓名；candidate - 候选实体。
 * 输出：0~1 匹配分值，越大越相似。
 * 异常：无。
 * 副作用：无。
 */
function multiSignalScore(extractedName: string, candidate: CandidatePersona): number {
  const allNames = [
    normalizeName(candidate.name),
    ...candidate.aliases.map(normalizeName)
  ].filter(Boolean);

  if (allNames.length === 0) return 0;
  return Math.max(...allNames.map((n) => scorePair(extractedName, n)));
}

/**
 * 功能：对两个已归一化字符串计算多信号相似度。
 * 输入：a、b - 已归一化字符串。
 * 输出：0~1 相似度。
 * 异常：无。
 * 副作用：无。
 */
function scorePair(a: string, b: string): number {
  if (!a || !b) return 0;

  // 1. 精确匹配
  if (a === b) return 1.0;

  const minLen = Math.min(a.length, b.length);
  const maxLen = Math.max(a.length, b.length);

  // 2. 双向子串包含（双方均 ≥ 2 字符，避免单字噪声）
  // 排除"姓名 + 亲属后缀"模式，避免将不同人物（如"蘧公孙"与"蘧公孙父亲"）错误合并。
  if (minLen >= 2) {
    if (a.includes(b)) {
      const tail = a.slice(a.indexOf(b) + b.length);
      if (tail && RELATIONAL_SUFFIXES.has(tail)) return 0;
      return 0.60 + 0.37 * (b.length / a.length);
    }
    if (b.includes(a)) {
      const tail = b.slice(b.indexOf(a) + a.length);
      if (tail && RELATIONAL_SUFFIXES.has(tail)) return 0;
      return 0.60 + 0.37 * (a.length / b.length);
    }
  }

  // 3. 较长字符串（≥ 6 字符）：Levenshtein 可靠
  // 4~5 字节中文名（如"娄三公子"vs"娄四公子"）仅差一字即得 0.75，误判风险过高。
  // 提升阈值至 ≥ 6，短名统一走 Jaccard，避免兄弟角色被错误合并。
  if (maxLen >= 6) {
    return 1 - levenshteinDistance(a, b) / maxLen;
  }

  // 4. 短字符串（< 4 字符）：字符级 Jaccard
  // Levenshtein 对 2~3 字汉语人名不可靠（"范进" vs "范举" = 0.5，误判风险高）
  const setA = new Set(a);
  const setB = new Set(b);
  let intersectionSize = 0;
  for (const c of setA) {
    if (setB.has(c)) intersectionSize++;
  }
  const unionSize = setA.size + setB.size - intersectionSize;
  return unionSize > 0 ? intersectionSize / unionSize : 0;
}

/**
 * 功能：对姓名做归一化，降低格式噪声。
 * 输入：name - 原始姓名字符串。
 * 输出：去除空白与常见标点后的标准化字符串。
 * 异常：无。
 * 副作用：无。
 */
function normalizeName(name: string): string {
  // 清理中文标点、空格、连接符并统一小写，降低格式噪声影响。
  return name.replace(/[\s·•,，。！？\-—]/g, "").toLowerCase();
}

/**
 * 功能：在归一化后判断"候选名字是否出现在原文"。
 * 输入：chapterContent - 章节原文；candidateName - 候选人名/称谓。
 * 输出：是否命中。
 * 异常：无。
 * 副作用：无。
 */
function containsNormalizedName(chapterContent: string, candidateName: string): boolean {
  const normalizedCandidate = normalizeName(candidateName);
  if (!normalizedCandidate) {
    return false;
  }

  return normalizeName(chapterContent).includes(normalizedCandidate);
}

/**
 * 功能：计算 Levenshtein 编辑距离。
 * 输入：a、b - 待比较字符串。
 * 输出：最小编辑距离（整数）。
 * 异常：无。
 * 副作用：无。
 */
function levenshteinDistance(a: string, b: string): number {
  // 空间优化版 Levenshtein：时间 O(m*n)，空间 O(min(m,n))。
  if (a.length < b.length) {
    [a, b] = [b, a];
  }

  let previousRow = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i++) {
    const currentRow = [i];
    for (let j = 1; j <= b.length; j++) {
      const insertCost = currentRow[j - 1] + 1;
      const deleteCost = previousRow[j] + 1;
      const replaceCost = previousRow[j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0);
      currentRow.push(Math.min(insertCost, deleteCost, replaceCost));
    }
    previousRow = currentRow;
  }

  return previousRow[b.length];
}
