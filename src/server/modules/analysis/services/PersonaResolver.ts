import type { PrismaClient } from "@/generated/prisma/client";
import { NameType, PersonaType } from "@/generated/prisma/enums";
import type { AliasRegistryService } from "@/server/modules/analysis/services/AliasRegistryService";
import { ANALYSIS_PIPELINE_CONFIG } from "@/server/modules/analysis/config/pipeline";
import {
  type BookLexiconConfig,
  type MentionPersonalizationEvidence,
  type PersonalizationTier,
  SAFETY_GENERIC_TITLES,
  DEFAULT_GENERIC_TITLES,
  buildEffectiveLexicon,
  classifyPersonalization
} from "@/server/modules/analysis/config/lexicon";

export const GENERIC_TITLES = new Set([
  ...Array.from(SAFETY_GENERIC_TITLES),
  ...Array.from(DEFAULT_GENERIC_TITLES)
]);

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

export interface ResolveInput {
  bookId         : string;
  extractedName  : string;
  chapterContent : string;
  chapterNo?     : number;
  rosterMap?     : Map<string, string>;
  titleOnlyNames?: Set<string>;
  lexiconConfig? : BookLexiconConfig;
  genericRatios? : Map<string, { generic: number; nonGeneric: number }>;
}

export interface ResolveResult {
  status              : "resolved" | "created" | "hallucinated";
  personaId?          : string;
  confidence          : number;
  matchedName?        : string;
  reason?             : string;
  personalizationTier?: PersonalizationTier;
  grayZoneEvidence?   : MentionPersonalizationEvidence;
}

type TxLike = Pick<
  PrismaClient,
  "persona" | "profile" | "aliasMapping" | "mention"
>;

interface CandidatePersona {
  id     : string;
  name   : string;
  aliases: string[];
}

export function createPersonaResolver(
  prisma: PrismaClient,
  aliasRegistry?: AliasRegistryService
) {
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

  async function resolve(input: ResolveInput, tx?: TxLike): Promise<ResolveResult> {
    const client = tx ?? prisma;
    const extracted = normalizeName(input.extractedName);
    const effectiveLexicon = buildEffectiveLexicon(input.lexiconConfig);
    const rawName = input.extractedName.trim();

    if (!extracted) {
      return {
        status    : "hallucinated",
        confidence: 0,
        reason    : "empty_name"
      };
    }

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

    const candidates = await loadCandidates(client, input.bookId, extracted);
    const scored = candidates
      .map((candidate) => ({
        candidate,
        score: multiSignalScore(extracted, candidate, effectiveLexicon.hardBlockSuffixes, effectiveLexicon.softBlockSuffixes)
      }))
      .sort((a, b) => b.score - a.score);
    const winner = scored[0];

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

    if (!containsNormalizedName(input.chapterContent, input.extractedName)) {
      return {
        status     : "hallucinated",
        confidence : winner?.score ?? 0,
        matchedName: winner?.candidate.name,
        reason     : "name_not_in_chapter"
      };
    }

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

function normalizeName(name: string): string {
  return name.replace(/[\s·•,，。！？\-—]/g, "").toLowerCase();
}

function containsNormalizedName(chapterContent: string, candidateName: string): boolean {
  const normalizedCandidate = normalizeName(candidateName);
  if (!normalizedCandidate) {
    return false;
  }

  return normalizeName(chapterContent).includes(normalizedCandidate);
}

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
