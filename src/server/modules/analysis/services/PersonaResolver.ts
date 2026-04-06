import type { PrismaClient } from "@/generated/prisma/client";
import { NameType, PersonaType } from "@/generated/prisma/enums";
import type { AliasRegistryService } from "@/server/modules/analysis/services/AliasRegistryService";
import { ANALYSIS_PIPELINE_CONFIG } from "@/server/modules/analysis/config/pipeline";
import {
  type BookLexiconConfig,
  type EffectiveLexicon,
  type MentionPersonalizationEvidence,
  type PersonalizationTier,
  SAFETY_GENERIC_TITLES,
  DEFAULT_GENERIC_TITLES,
  buildEffectiveLexicon,
  classifyPersonalization
} from "@/server/modules/analysis/config/lexicon";

/**
 * 文件定位（Next.js 服务端领域服务）：
 * - 位于 `src/server/modules/analysis/services`，属于章节解析流水线中的“人物消歧”核心服务。
 * - 该文件不会直接作为 Next.js `page.tsx/route.ts` 暴露，而是被 `ChapterAnalysisService` 在服务端调用。
 *
 * 核心职责：
 * - 把 AI 抽取出的名字（`extractedName`）映射到“已有 persona / 新建 persona / 幻觉过滤”三类结果。
 * - 统一处理称谓泛化（如“皇上”“大人”）与个性化（同一称谓在本书被特指某人）的判定。
 * - 结合名册（roster）、别名注册表（alias registry）与相似度算法，降低误建人物和误绑定风险。
 *
 * 业务边界与上下游：
 * - 上游：章节解析阶段识别出的称谓字符串、章节原文、章节号、名册映射等上下文。
 * - 下游：`ChapterAnalysisService` 根据 ResolveResult 决定创建 mention/biography/relationship 等结构化数据。
 * - 本文件内“阈值与分支”是业务规则，不是技术限制；修改会直接影响识别准确率与审核成本。
 */
export const GENERIC_TITLES = new Set([
  ...Array.from(SAFETY_GENERIC_TITLES),
  ...Array.from(DEFAULT_GENERIC_TITLES)
]);

/**
 * 根据词法规则推断别名类型。
 * 这里优先级固定为 TITLE > POSITION > NICKNAME，是为了优先保护“称号语义”，避免官职/尊号被降级为昵称。
 */
function inferAliasType(
  name: string,
  titlePattern: RegExp,
  positionPattern: RegExp
): "TITLE" | "POSITION" | "NICKNAME" {
  if (titlePattern.test(name)) {
    return "TITLE";
  }

  if (positionPattern.test(name)) {
    return "POSITION";
  }

  return "NICKNAME";
}

const RANKED_HONORIFIC_PATTERN = /^([\u4e00-\u9fa5])[一二三四五六七八九十百千万两\d]{1,3}(先生|老爷|相公|公子|大人)$/;
const CHINESE_NAME_PATTERN = /^[\u4e00-\u9fa5]{2,4}$/;

interface ScoredCandidate {
  candidate: CandidatePersona;
  score    : number;
}

function parseRankedHonorificAlias(normalizedName: string): { surname: string } | null {
  const matched = RANKED_HONORIFIC_PATTERN.exec(normalizedName);
  if (!matched) {
    return null;
  }
  return { surname: matched[1] };
}

function isLikelyCanonicalChineseName(
  normalizedName: string,
  effectiveLexicon: EffectiveLexicon
): boolean {
  if (!CHINESE_NAME_PATTERN.test(normalizedName)) {
    return false;
  }
  if (effectiveLexicon.genericTitles.has(normalizedName)) {
    return false;
  }
  if (effectiveLexicon.titlePattern.test(normalizedName) || effectiveLexicon.positionPattern.test(normalizedName)) {
    return false;
  }
  for (const suffix of effectiveLexicon.hardBlockSuffixes) {
    if (normalizedName.endsWith(suffix)) {
      return false;
    }
  }
  return true;
}

/**
 * “姓氏 + 排行 + 敬称”变体（如“马二先生”）的保守加权策略：
 * - 仅当候选中存在且仅存在 1 个“同姓且像正式姓名”的人物时才提升分值；
 * - 若同姓候选超过 1 个，不做加权，避免把“马二先生”误并到错误人物。
 */
function applyRankedHonorificBoost(
  extractedName: string,
  scored: ScoredCandidate[],
  effectiveLexicon: EffectiveLexicon
): ScoredCandidate[] {
  const hint = parseRankedHonorificAlias(extractedName);
  if (!hint || scored.length === 0) {
    return scored;
  }

  const matchedIndexes: number[] = [];
  for (const [index, item] of scored.entries()) {
    const normalizedCandidateName = normalizeName(item.candidate.name);
    if (!normalizedCandidateName.startsWith(hint.surname)) {
      continue;
    }
    if (!isLikelyCanonicalChineseName(normalizedCandidateName, effectiveLexicon)) {
      continue;
    }
    matchedIndexes.push(index);
  }

  if (matchedIndexes.length !== 1) {
    return scored;
  }

  const boosted = [...scored];
  const targetIndex = matchedIndexes[0];
  const boostFloor = ANALYSIS_PIPELINE_CONFIG.personaResolveMinScore + 0.06;
  boosted[targetIndex] = {
    ...boosted[targetIndex],
    score: Math.max(boosted[targetIndex].score, boostFloor)
  };
  return boosted;
}

/**
 * 人物解析输入参数。
 */
export interface ResolveInput {
  /** 当前解析所属书籍 ID。用于限制候选范围，避免跨书污染。 */
  bookId         : string;
  /** AI 从本段文本中抽取出的原始称谓。 */
  extractedName  : string;
  /** 当前章节原文（用于“是否真实出现在正文”校验）。 */
  chapterContent : string;
  /** 章节号。提供时可启用按章节范围生效的 alias 映射命中。 */
  chapterNo?     : number;
  /** Phase 1 人物名册映射：surfaceForm -> personaId 或 GENERIC。 */
  rosterMap?     : Map<string, string>;
  /** 本章被判定为“仅称号”的名字集合，用于决定新建 persona 的 nameType。 */
  titleOnlyNames?: Set<string>;
  /** 书籍级词典配置（泛化称谓、硬软后缀等）。 */
  lexiconConfig? : BookLexiconConfig;
  /** 泛化比率统计：surfaceForm -> { generic, nonGeneric }。用于灰区判定。 */
  genericRatios? : Map<string, { generic: number; nonGeneric: number }>;
}

/**
 * 人物解析输出结果。
 */
export interface ResolveResult {
  /** 解析状态：命中已有人物 / 新建人物 / 判定为幻觉。 */
  status              : "resolved" | "created" | "hallucinated";
  /** 命中或新建的人物 ID；幻觉时为空。 */
  personaId?          : string;
  /** 最终置信度（0-1）。用于后续过滤与审核排序。 */
  confidence          : number;
  /** 命中的候选标准名（便于调试与审核展示）。 */
  matchedName?        : string;
  /** 失败/降级原因码（empty_name/name_too_short/gray_zone 等）。 */
  reason?             : string;
  /** 对“泛化称谓”判定出的个性化层级。 */
  personalizationTier?: PersonalizationTier;
  /** 灰区判定证据；仅 gray_zone 时输出。 */
  grayZoneEvidence?   : MentionPersonalizationEvidence;
}

/**
 * 事务适配层：只暴露当前解析流程真正需要的 Prisma 模型能力。
 * 这样做可以在外层事务中复用该解析逻辑，避免无关模型访问带来的耦合。
 */
type TxLike = Pick<
  PrismaClient,
  "persona" | "profile" | "aliasMapping" | "mention"
>;

/**
 * 候选人物的最小字段集合。
 */
interface CandidatePersona {
  /** 人物主键。 */
  id     : string;
  /** 标准人名。 */
  name   : string;
  /** 已收敛的别名列表（含 profile.localName）。 */
  aliases: string[];
}

/**
 * 创建人物解析器。
 *
 * @param prisma Prisma 客户端（默认主客户端，亦可传事务客户端）
 * @param aliasRegistry 别名注册服务（可选，缺失时跳过 alias 快速命中与自动登记）
 */
export function createPersonaResolver(
  prisma: PrismaClient,
  aliasRegistry?: AliasRegistryService
) {
  /**
   * 加载候选人物：
   * 1. 先查“直接相关”候选（名字/别名/localName 命中），优先精确与性能。
   * 2. 若无直接命中，再退化到“本书所有人物”做兜底比对，避免漏识别。
   */
  async function loadCandidates(client: TxLike, bookId: string, extracted: string): Promise<CandidatePersona[]> {
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
   * 收集“泛化称谓是否被个性化使用”的证据。
   * 证据来自三条链路：
   * - alias 映射是否稳定绑定到单一 persona；
   * - 历史 mention 是否跨章节稳定出现；
   * - generic/nonGeneric 统计比率是否偏向具体人物语境。
   */
  async function collectPersonalizationEvidence(
    client: TxLike,
    surfaceForm: string,
    bookId: string,
    genericRatios?: Map<string, { generic: number; nonGeneric: number }>
  ): Promise<MentionPersonalizationEvidence> {
    const aliasBindings = await client.aliasMapping.findMany({
      where: {
        bookId,
        alias     : surfaceForm,
        confidence: { gte: ANALYSIS_PIPELINE_CONFIG.aliasRegistryMinConfidence },
        status    : { in: ["CONFIRMED", "LLM_INFERRED"] }
      },
      select: { personaId: true }
    });

    const stablePersonaIds = new Set(aliasBindings.map((item) => item.personaId).filter((item): item is string => Boolean(item)));
    const hasStableAliasBinding = stablePersonaIds.size === 1;

    const mentionRows = await client.mention.findMany({
      where: {
        chapter: { bookId },
        OR     : [
          { rawText: { equals: surfaceForm, mode: "insensitive" } },
          { rawText: { contains: surfaceForm, mode: "insensitive" } }
        ],
        deletedAt: null
      },
      select: { chapterId: true, personaId: true },
      take  : 200
    });

    const chapterAppearanceCount = new Set(mentionRows.map((item) => item.chapterId)).size;
    const mentionedPersonaIds = new Set(mentionRows.map((item) => item.personaId).filter((item): item is string => Boolean(item)));
    const singlePersonaConsistency = mentionedPersonaIds.size <= 1;

    const ratioStat = genericRatios?.get(surfaceForm);
    const genericCount = ratioStat?.generic ?? 0;
    const nonGenericCount = ratioStat?.nonGeneric ?? 0;
    const ratioDenominator = genericCount + nonGenericCount;
    const genericRatio = ratioDenominator > 0 ? genericCount / ratioDenominator : 0.5;

    return {
      surfaceForm,
      hasStableAliasBinding,
      chapterAppearanceCount,
      singlePersonaConsistency,
      genericRatio
    };
  }

  /**
   * 核心解析流程：
   * - 先做输入防御（空值、过短、安全泛化词）；
   * - 再按优先级依次尝试：roster 命中 -> alias 命中 -> 相似度命中；
   * - 最后仍未命中时，按规则决定“幻觉过滤”或“新建人物”。
   */
  async function resolve(input: ResolveInput, tx?: TxLike): Promise<ResolveResult> {
    const client = tx ?? prisma;
    const extracted = normalizeName(input.extractedName);
    const effectiveLexicon = buildEffectiveLexicon(input.lexiconConfig);
    const rawName = input.extractedName.trim();

    // 空字符串直接视为无效识别，避免落库污染。
    if (!extracted) {
      return {
        status    : "hallucinated",
        confidence: 0,
        reason    : "empty_name"
      };
    }

    // 单字/极短字符串在中文实体识别中误报率极高，按业务规则直接过滤。
    if (extracted.length < 2) {
      return {
        status    : "hallucinated",
        confidence: 0,
        reason    : "name_too_short"
      };
    }

    if (SAFETY_GENERIC_TITLES.has(rawName)) {
      return {
        status    : "hallucinated",
        confidence: 1.0,
        reason    : "safety_generic"
      };
    }

    // 配置型泛化称谓：
    // - 若关闭动态判定，直接按泛化词处理；
    // - 若开启动态判定，则依据证据分成 personalized/generic/gray_zone。
    if (effectiveLexicon.genericTitles.has(rawName)) {
      if (!ANALYSIS_PIPELINE_CONFIG.dynamicTitleResolutionEnabled) {
        return {
          status    : "hallucinated",
          confidence: 0.9,
          reason    : "config_generic"
        };
      }

      const evidence = await collectPersonalizationEvidence(client, rawName, input.bookId, input.genericRatios);
      const tier = classifyPersonalization(evidence);
      console.info("[PersonaResolver] generic.personalization.check", JSON.stringify({
        bookId        : input.bookId,
        name          : rawName,
        tier,
        genericRatio  : evidence.genericRatio,
        chapterAppears: evidence.chapterAppearanceCount
      }));
      if (tier === "personalized") {
        // pass through
      } else if (tier === "generic") {
        return {
          status             : "hallucinated",
          confidence         : 0.9,
          reason             : "config_generic",
          personalizationTier: tier
        };
      } else {
        return {
          status             : "hallucinated",
          confidence         : 0.5,
          reason             : "gray_zone",
          personalizationTier: tier,
          grayZoneEvidence   : evidence
        };
      }
    }

    // 优先使用 Phase 1 名册结果：这是同章上下文最强信号，优先级高于全局相似度。
    if (input.rosterMap) {
      const rosterValue = input.rosterMap.get(rawName);
      if (rosterValue === "GENERIC") {
        return {
          status    : "hallucinated",
          confidence: 1.0,
          reason    : "generic_title"
        };
      }
      if (rosterValue) {
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

    // 次优先级：按章节范围查询别名注册表。
    // 这样可覆盖“同一称谓在不同章节指向不同人物”的历史变更场景。
    if (aliasRegistry && input.chapterNo !== undefined) {
      const aliasResult = await aliasRegistry.lookupAlias(input.bookId, rawName, input.chapterNo);
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

    // 进入相似度匹配阶段：对候选集打分并选择最高分。
    const candidates = await loadCandidates(client, input.bookId, extracted);
    const baseScored: ScoredCandidate[] = candidates
      .map((candidate) => ({
        candidate,
        score: multiSignalScore(extracted, candidate, effectiveLexicon.hardBlockSuffixes, effectiveLexicon.softBlockSuffixes)
      }));
    const scored = applyRankedHonorificBoost(extracted, baseScored, effectiveLexicon)
      .sort((a, b) => b.score - a.score);
    const winner = scored[0];

    // 达到阈值则认定为已有人物，并顺便补齐 localName/aliases，持续增强后续命中率。
    if (winner && winner.score >= ANALYSIS_PIPELINE_CONFIG.personaResolveMinScore) {
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

      const normalizedExtracted = rawName.toLowerCase();
      const aliasExists = winner.candidate.aliases.some(
        (a) => a.trim().toLowerCase() === normalizedExtracted
      );
      // 只有当 extractedName 既不是标准名也不在 aliases 中时才追加，避免冗余别名膨胀。
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

    // 若名字在章节原文中都不存在，说明更可能是模型臆造；宁可漏识别也不误建实体。
    if (!containsNormalizedName(input.chapterContent, input.extractedName)) {
      return {
        status     : "hallucinated",
        confidence : winner?.score ?? 0,
        matchedName: winner?.candidate.name,
        reason     : "name_not_in_chapter"
      };
    }

    // 走到这里表示“可接受的新人物”：
    // - `TITLE_ONLY` 属于业务语义标签，不是技术限制；
    // - 置信度使用 winner 分数兜底，默认 0.35 便于后续审核筛查。
    const nameType = input.titleOnlyNames?.has(rawName)
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

    // 对“称号/官职”类新建人物自动登记 alias mapping，便于后续章节复用。
    if (
      aliasRegistry &&
      (
        nameType === NameType.TITLE_ONLY ||
        effectiveLexicon.positionPattern.test(input.extractedName) ||
        effectiveLexicon.titlePattern.test(input.extractedName)
      )
    ) {
      const aliasType = nameType === NameType.TITLE_ONLY
        ? "TITLE"
        : inferAliasType(input.extractedName, effectiveLexicon.titlePattern, effectiveLexicon.positionPattern);
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
 * 多信号匹配得分：
 * - 在 canonicalName 与 aliases 间取最大值；
 * - 这样可以兼顾“标准名匹配”与“别称命中”两类路径。
 */
function multiSignalScore(
  extractedName: string,
  candidate: CandidatePersona,
  hardBlockSuffixes: Set<string>,
  softBlockSuffixes: Set<string>
): number {
  const allNames = [
    normalizeName(candidate.name),
    ...candidate.aliases.map(normalizeName)
  ].filter(Boolean);

  if (allNames.length === 0) return 0;
  return Math.max(...allNames.map((n) => scorePair(extractedName, n, hardBlockSuffixes, softBlockSuffixes)));
}

/**
 * 两个名字的相似度评分：
 * 1. 完全相等直接 1；
 * 2. 子串关系使用业务化惩罚规则（硬/软后缀）；
 * 3. 长字符串用编辑距离；
 * 4. 短字符串用字符集合相似度。
 */
function scorePair(
  a: string,
  b: string,
  hardBlockSuffixes: Set<string>,
  softBlockSuffixes: Set<string>
): number {
  if (!a || !b) return 0;
  if (a === b) return 1.0;

  const minLen = Math.min(a.length, b.length);
  const maxLen = Math.max(a.length, b.length);

  if (minLen >= 2) {
    if (a.includes(b)) {
      const result = calculateSubstringMatchScore(a, b, hardBlockSuffixes, softBlockSuffixes);
      if (result > 0 && result < (0.60 + 0.37 * (b.length / a.length))) {
        const tail = a.slice(a.indexOf(b) + b.length);
        console.info("[PersonaResolver] suffix.soft_block.hit", JSON.stringify({ a, b, tail }));
      }
      return result;
    }
    if (b.includes(a)) {
      const result = calculateSubstringMatchScore(b, a, hardBlockSuffixes, softBlockSuffixes);
      if (result > 0 && result < (0.60 + 0.37 * (a.length / b.length))) {
        const tail = b.slice(b.indexOf(a) + a.length);
        console.info("[PersonaResolver] suffix.soft_block.hit", JSON.stringify({ a, b, tail }));
      }
      return result;
    }
  }

  if (maxLen >= 6) {
    return 1 - levenshteinDistance(a, b) / maxLen;
  }

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
 * 子串匹配评分规则：
 * - hardBlock 后缀（如明显无关词尾）直接判 0；
 * - softBlock 后缀按系数惩罚，保留“低置信可疑命中”供后续审核。
 */
export function calculateSubstringMatchScore(
  longer: string,
  shorter: string,
  hardBlockSuffixes: Set<string>,
  softBlockSuffixes: Set<string>
): number {
  if (!longer.includes(shorter)) {
    return 0;
  }
  const tail = longer.slice(longer.indexOf(shorter) + shorter.length);
  if (tail && hardBlockSuffixes.has(tail)) return 0;
  const normalScore = 0.60 + 0.37 * (shorter.length / longer.length);
  if (tail && softBlockSuffixes.has(tail)) {
    return normalScore * ANALYSIS_PIPELINE_CONFIG.softBlockPenalty;
  }
  return normalScore;
}

/**
 * 名字归一化：去掉空白/标点并转小写。
 * 目标是减少文风与排版差异对匹配的影响，而不是做语义改写。
 */
function normalizeName(name: string): string {
  return name.replace(/[\s·•,，。！？\-—]/g, "").toLowerCase();
}

/**
 * 判断候选名字是否真实出现在章节中（同样按归一化后匹配）。
 * 该检查是“防幻觉”最后一道闸门。
 */
function containsNormalizedName(chapterContent: string, candidateName: string): boolean {
  const normalizedCandidate = normalizeName(candidateName);
  if (!normalizedCandidate) {
    return false;
  }

  return normalizeName(chapterContent).includes(normalizedCandidate);
}

/**
 * 经典 Levenshtein 编辑距离实现。
 * 这里不引入第三方库，保持服务端路径轻量与可测试性。
 */
function levenshteinDistance(a: string, b: string): number {
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
