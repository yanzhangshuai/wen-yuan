import type { PrismaClient } from "@/generated/prisma/client";
import { PersonaType } from "@/generated/prisma/enums";

/**
 * 功能：定义实体对齐输入参数。
 * 输入：无。
 * 输出：类型约束 ResolveInput。
 * 异常：无。
 * 副作用：无。
 */
interface ResolveInput {
  bookId: string;
  extractedName: string;
  chapterContent: string;
}

/**
 * 功能：定义实体对齐结果。
 * 输入：无。
 * 输出：类型约束 ResolveResult。
 * 异常：无。
 * 副作用：无。
 */
export interface ResolveResult {
  status: "resolved" | "created" | "hallucinated";
  personaId?: string;
  confidence: number;
  matchedName?: string;
  reason?: string;
}

type TxLike = Pick<
  PrismaClient,
  "persona" | "profile"
>;

/**
 * 功能：定义候选实体结构（供相似度打分使用）。
 * 输入：无。
 * 输出：类型约束 CandidatePersona。
 * 异常：无。
 * 副作用：无。
 */
interface CandidatePersona {
  id: string;
  name: string;
  aliases: string[];
}

/**
 * 功能：创建实体对齐服务，将 AI 抽取姓名对齐到已有 Persona。
 * 输入：prisma - 数据库客户端（可注入，便于测试）。
 * 输出：包含 resolve 方法的服务对象。
 * 异常：数据库操作失败时抛错。
 * 副作用：可能新增 persona/profile，或 upsert profile。
 */
export function createPersonaResolver(prisma: PrismaClient) {
  async function loadCandidates(client: TxLike, bookId: string, extracted: string): Promise<CandidatePersona[]> {
    // 第一层：精确/半精确召回（名字、别名、书内称呼）。
    const directMatches = await client.persona.findMany({
      where: {
        OR: [
          { name: { contains: extracted, mode: "insensitive" } },
          { globalTags: { has: extracted } },
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
          where: { bookId },
          select: { localName: true }
        }
      },
      take: 40
    });

    if (directMatches.length > 0) {
      return directMatches.map((item) => ({
        id: item.id,
        name: item.name,
        aliases: [...item.globalTags, ...item.profiles.map((profile) => profile.localName)]
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
          where: { bookId },
          select: { localName: true }
        }
      },
      take: 200
    });

    return fallbackBookMatches.map((item) => ({
      id: item.id,
      name: item.name,
      aliases: [...item.globalTags, ...item.profiles.map((profile) => profile.localName)]
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

    // 空名字直接标记为幻觉，避免写入脏数据。
    if (!extracted) {
      return {
        status: "hallucinated",
        confidence: 0,
        reason: "empty_name"
      };
    }

    const candidates = await loadCandidates(client, input.bookId, extracted);

    const scored = candidates
      .map((candidate) => ({
        candidate,
        score: scoreCandidate(extracted, candidate)
      }))
      .sort((a, b) => b.score - a.score);

    const winner = scored[0];

    // 达到阈值则优先合并到已有 Persona，符合"尽量复用实体"的原则。
    if (winner && winner.score >= 0.62) {
      // 确保该 persona 在当前书有 profile（幂等 upsert）。
      await client.profile.upsert({
        where: {
          personaId_bookId: {
            personaId: winner.candidate.id,
            bookId: input.bookId
          }
        },
        update: {},
        create: {
          personaId: winner.candidate.id,
          bookId: input.bookId,
          localName: input.extractedName
        }
      });

      return {
        status: "resolved",
        personaId: winner.candidate.id,
        confidence: winner.score,
        matchedName: winner.candidate.name
      };
    }

    // 名字不在原文中出现，倾向判断为模型幻觉。
    if (!input.chapterContent.includes(input.extractedName)) {
      return {
        status: "hallucinated",
        confidence: winner?.score ?? 0,
        matchedName: winner?.candidate.name,
        reason: "name_not_in_chapter"
      };
    }

    // 低置信且确实在原文出现，才创建新 Persona。
    const created = await client.persona.create({
      data: {
        name: input.extractedName,
        type: PersonaType.PERSON,
        globalTags: [input.extractedName]
      }
    });

    await client.profile.create({
      data: {
        personaId: created.id,
        bookId: input.bookId,
        localName: input.extractedName
      }
    });

    return {
      status: "created",
      personaId: created.id,
      confidence: winner?.score ?? 0.35,
      matchedName: created.name
    };
  }

  return { resolve };
}

/**
 * 功能：计算候选实体与抽取姓名的匹配分数。
 * 输入：extractedName - 归一化后的抽取姓名；candidate - 候选实体。
 * 输出：0~1 匹配分值，越大越相似。
 * 异常：无。
 * 副作用：无。
 */
function scoreCandidate(extractedName: string, candidate: CandidatePersona): number {
  const canonical = normalizeName(candidate.name);

  if (canonical === extractedName) {
    return 1;
  }

  // 同时比较 canonical name 与 aliases，取最大相似度作为最终分数。
  const aliasScores = candidate.aliases.map((alias) => similarity(normalizeName(alias), extractedName));
  const canonicalScore = similarity(canonical, extractedName);
  const aliasScore = aliasScores.length > 0 ? Math.max(...aliasScores) : 0;

  return Math.max(canonicalScore, aliasScore);
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
 * 功能：计算两字符串归一化相似度。
 * 输入：a、b - 已归一化字符串。
 * 输出：0~1 相似度。
 * 异常：无。
 * 副作用：无。
 */
function similarity(a: string, b: string): number {
  if (!a || !b) {
    return 0;
  }

  const maxLen = Math.max(a.length, b.length);

  if (maxLen === 0) {
    return 1;
  }

  // 归一化 Levenshtein：1 - 编辑距离/最大长度。
  return 1 - levenshteinDistance(a, b) / maxLen;
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

  for (let i = 1; i <= a.length; i += 1) {
    const currentRow: number[] = [i];

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currentRow[j] = Math.min(
        currentRow[j - 1] + 1,
        previousRow[j] + 1,
        previousRow[j - 1] + cost
      );
    }

    previousRow = currentRow;
  }

  return previousRow[b.length];
}
