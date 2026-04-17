/**
 * 文件定位（Stage B · 全书实体仲裁主服务）：
 * - 契约源：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md`
 *   §0-4（LOW 加严）/ §0-7（CONFIRMED 门槛）/ §0-8（suspectedResolvesTo）/
 *   §0-9（MERGE 充要条件）/ §0-14（B.5 反馈通道）/ §4.2（Prompt B）。
 *
 * 职责：
 * 1. 一次扫全书，聚合 `persona_mentions` → 三通道候选组（Union-Find）：
 *    ① 相同 surfaceForm；② 相同 suspectedResolvesTo；③ AliasEntry 命中。
 * 2. 通道 ③ 查 `alias_entries`；空 / 抛错 → **降级**（`aliasEntryDegraded=true`）。
 * 3. 对 size≥2 的组调 Prompt B → MERGE / SPLIT / UNSURE。
 * 4. §0-9 充要条件：
 *    - 必要 confidence ≥ mergeConfidenceFloor；
 *    - 充分 ≥2 distinct chapter evidence AND (rulePreMergeHit ∨ aliasEntryHit)。
 *    不满足 → `merge_suggestions PENDING`，绝不合并。
 * 5. 为被合并 / 新增 persona 计算 §0-7 CONFIRMED（单 pass 中仅 distinctChapter+mentionCount
 *    分支；biography 分支依赖 Stage C 输出，不存在则跳过）；§0-4 LOW 章阈值 +1。
 * 6. 消费 B.5 PENDING（source=STAGE_B5_TEMPORAL）：
 *    - 可推断冒名者 → 更新 `targetPersonaId`，保持 PENDING；
 *    - 无法推断 → 标 `status='NEEDS_HUMAN_REVIEW'`。
 *    **永不自动合并**（冒名建模逆向逻辑）。
 * 7. 幂等：若组中所有 mention 已 promoted 且 persona.status='CONFIRMED' → 跳过。
 *
 * 禁止：
 * - 无证据的"同姓/前缀"合并；
 * - 直接把 LOW 章的 evidence 放宽门槛；
 * - 自动合并 IMPERSONATION_CANDIDATE。
 */

import type {
  AliasType,
  BookTypeCode,
  PrismaClient
} from "@/generated/prisma/client";
import type { AiProviderClient } from "@/server/providers/ai";
import type { PromptMessageInput } from "@/types/pipeline";

import { resolvePromptTemplate } from "@/server/modules/knowledge";
import { getFewShots } from "@/server/modules/analysis/prompts/resolveBookTypeFewShots";
import { getThresholds } from "@/server/modules/analysis/config/thresholdsByBookType";

import type {
  CandidateGroup,
  CandidateGroupChannel,
  RawStageBLlmItem,
  StageB5ConsumeAction,
  StageBDecision,
  StageBMentionRow,
  StageBMergeAction,
  StageBResult,
  StageBSuggestionAction
} from "@/server/modules/analysis/pipelines/threestage/stageB/types";

const STAGE_B_SLUG = "STAGE_B_RESOLVE_ENTITIES";

/** Stage B 需要的 Prisma 最小面，便于测试时注入 mock。 */
export type StageBPrismaClient = Pick<
  PrismaClient,
  | "book"
  | "persona"
  | "personaMention"
  | "mergeSuggestion"
  | "aliasEntry"
  | "chapterPreprocessResult"
  | "biographyRecord"
  | "$transaction"
>;

/** `resolve(bookId)` 入参。 */
export interface StageBResolveInput {
  bookId: string;
}

/**
 * 内部：按 surfaceForm 精确 group 的 “规则预合并” 判定。
 * - 所有 identityClaim 属于 SELF 集（同一表层 + 全 SELF → 预合并命中）；
 * - IMPERSONATING / QUOTED / REPORTED / HISTORICAL 混入即禁止预合并。
 */
function isRulePreMergeHit(mentions: readonly StageBMentionRow[]): boolean {
  if (mentions.length < 2) return false;
  const surfaces = new Set(mentions.map((m) => m.surfaceForm));
  if (surfaces.size !== 1) return false;
  return mentions.every((m) => m.identityClaim === "SELF");
}

/** Union-Find（极简，mention index 为元素）。 */
class UnionFind {
  private readonly parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

/** AliasEntry 最小读模型（仅需 canonicalName + aliases）。 */
interface AliasEntryLite {
  canonicalName: string;
  aliases      : readonly string[];
}

/**
 * Stage B 全书实体仲裁主服务。
 *
 * 构造器依赖：`aiClient` 做 LLM 仲裁；`prisma` 写库。
 *
 * ```ts
 * const resolver = new StageBResolver(aiClient, prisma);
 * const result = await resolver.resolve({ bookId });
 * ```
 */
export class StageBResolver {
  constructor(
    private readonly aiClient: AiProviderClient,
    private readonly prisma  : StageBPrismaClient
  ) {}

  async resolve(input: StageBResolveInput): Promise<StageBResult> {
    const { bookId } = input;

    // 1. 基础上下文：书籍信息（typeCode / title）+ mentions + 章节 LOW 标记。
    const book = await this.prisma.book.findUnique({
      where : { id: bookId },
      select: { id: true, title: true, typeCode: true }
    });
    if (book === null) {
      throw new Error(`StageBResolver: book not found: ${bookId}`);
    }
    const thresholds = getThresholds(book.typeCode);

    const mentions = await this.loadMentions(bookId);
    const lowChapterIds = await this.loadLowChapterIds(mentions);

    // 2. AliasEntry（graceful degrade）
    const { aliasEntries, degraded: aliasEntryDegraded } =
      await this.loadAliasEntriesSafe(bookId);

    // 3. 三通道候选组
    const groups = this.buildCandidateGroups(mentions, aliasEntries);

    // 4. 幂等过滤：已全部 promoted 且 persona=CONFIRMED → 跳过
    const activeGroups = await this.filterIdempotent(groups);

    // 5. 对 size≥2 的 group 走 LLM；size=1 的直接进入 persona 建档
    const merges     : StageBMergeAction[]     = [];
    const suggestions: StageBSuggestionAction[] = [];
    let   llmCalls = 0;

    for (const group of activeGroups) {
      if (group.mentions.length < 2) {
        // 单 mention：直接落 CANDIDATE / CONFIRMED persona（不送 LLM）
        const merge = await this.persistSingletonPersona({
          bookId,
          group,
          thresholds,
          lowChapterIds,
          bookTypeCode: book.typeCode
        });
        merges.push(merge);
        continue;
      }

      const decision = await this.invokeLlm({
        bookTitle   : book.title,
        bookTypeCode: book.typeCode,
        group
      });
      llmCalls += 1;

      const evaluated = this.evaluateGroupDecision(
        group,
        decision,
        thresholds.mergeConfidenceFloor
      );

      if (evaluated.action === "MERGE") {
        const merge = await this.persistMergeGroup({
          bookId,
          group,
          thresholds,
          lowChapterIds,
          bookTypeCode: book.typeCode
        });
        merges.push(merge);
      } else if (evaluated.action === "SUGGESTION") {
        // 未满足充要但 confidence ≥ floor：写 merge_suggestions PENDING。
        // 为了写 suggestion 必须先有 source/target persona，这里为每个不同 surfaceForm
        // 建一个 singleton persona（保持独立），然后写建议（最小 source/target 对）。
        const singletons = await this.persistSplitAsSingletons({
          bookId,
          group,
          thresholds,
          lowChapterIds,
          bookTypeCode: book.typeCode
        });
        merges.push(...singletons);
        if (singletons.length >= 2) {
          const suggestion = await this.persistSuggestion({
            bookId,
            group,
            decision       : decision,
            sourcePersonaId: singletons[0].personaId,
            targetPersonaId: singletons[1].personaId
          });
          suggestions.push(suggestion);
        }
      } else {
        // SPLIT / confidence 过低：不合并，不写建议
        const singletons = await this.persistSplitAsSingletons({
          bookId,
          group,
          thresholds,
          lowChapterIds,
          bookTypeCode: book.typeCode
        });
        merges.push(...singletons);
      }
    }

    // 6. 消费 B.5 PENDING
    const b5Consumed = await this.consumeB5Suggestions(bookId);

    return {
      bookId,
      candidateGroupsTotal: groups.length,
      llmInvocations      : llmCalls,
      merges,
      suggestions,
      b5Consumed,
      aliasEntryDegraded
    };
  }

  // ────────────────────────────── 候选组 / 通道构建 ──────────────────────────────

  private async loadMentions(bookId: string): Promise<StageBMentionRow[]> {
    const rows = await this.prisma.personaMention.findMany({
      where : { bookId },
      select: {
        id                 : true,
        chapterNo          : true,
        chapterId          : true,
        surfaceForm        : true,
        suspectedResolvesTo: true,
        aliasTypeHint      : true,
        identityClaim      : true,
        narrativeRegionType: true,
        actionVerb         : true,
        rawSpan            : true,
        confidence         : true,
        promotedPersonaId  : true
      },
      orderBy: [{ chapterNo: "asc" }, { id: "asc" }]
    });

    // 保留 chapterId 在闭包里供 LOW 查询用，但对外接口统一 StageBMentionRow。
    this.chapterIdByMention = new Map(rows.map((r) => [r.id, r.chapterId]));

    return rows.map((r) => ({
      id                 : r.id,
      chapterNo          : r.chapterNo,
      surfaceForm        : r.surfaceForm,
      suspectedResolvesTo: r.suspectedResolvesTo,
      aliasTypeHint      : r.aliasTypeHint,
      identityClaim      : r.identityClaim,
      narrativeRegionType: r.narrativeRegionType,
      actionVerb         : r.actionVerb,
      rawSpan            : r.rawSpan,
      confidence         : r.confidence,
      promotedPersonaId  : r.promotedPersonaId
    }));
  }

  /** mentionId → chapterId 辅助映射（LOW 章节判定需要）。 */
  private chapterIdByMention: Map<string, string> = new Map();

  private async loadLowChapterIds(
    mentions: readonly StageBMentionRow[]
  ): Promise<Set<string>> {
    const chapterIds = Array.from(
      new Set(
        mentions
          .map((m) => this.chapterIdByMention.get(m.id))
          .filter((v): v is string => typeof v === "string")
      )
    );
    if (chapterIds.length === 0) return new Set();

    const rows = await this.prisma.chapterPreprocessResult.findMany({
      where : { chapterId: { in: chapterIds } },
      select: { chapterId: true, confidence: true }
    });
    return new Set(
      rows.filter((r) => r.confidence === "LOW").map((r) => r.chapterId)
    );
  }

  /** 降级：若查询抛错或结果空 → 返回 degraded=true（通道 ③ 视为不工作）。 */
  private async loadAliasEntriesSafe(
    bookId: string
  ): Promise<{ aliasEntries: AliasEntryLite[]; degraded: boolean }> {
    try {
      const rows = await this.prisma.aliasEntry.findMany({
        where: {
          reviewStatus: "VERIFIED",
          pack        : {
            isActive: true,
            OR      : [
              { scope: "GLOBAL" },
              { bookPacks: { some: { bookId } } }
            ]
          }
        },
        select: { canonicalName: true, aliases: true }
      });
      if (rows.length === 0) {
        console.warn(
          `[StageBResolver] aliasEntry.empty bookId=${bookId} channel3.degraded=true`
        );
        return { aliasEntries: [], degraded: true };
      }
      return { aliasEntries: rows, degraded: false };
    } catch (err) {
      console.warn(
        `[StageBResolver] aliasEntry.query.failed bookId=${bookId} degraded=true err=${String(err)}`
      );
      return { aliasEntries: [], degraded: true };
    }
  }

  /**
   * 用 UnionFind 把 mentions 按三通道联通，返回候选组（size≥1）。
   * - 通道 ①：相同 surfaceForm；
   * - 通道 ②：相同 suspectedResolvesTo 非空值；
   * - 通道 ③：AliasEntry 命中（同一 entry 内所有 aliases + canonicalName 互通）。
   */
  private buildCandidateGroups(
    mentions   : readonly StageBMentionRow[],
    aliasEntries: readonly AliasEntryLite[]
  ): CandidateGroup[] {
    if (mentions.length === 0) return [];

    const uf = new UnionFind(mentions.length);

    // 通道 ①：相同 surfaceForm
    const bySurface = new Map<string, number[]>();
    mentions.forEach((m, idx) => {
      const bucket = bySurface.get(m.surfaceForm) ?? [];
      bucket.push(idx);
      bySurface.set(m.surfaceForm, bucket);
    });
    for (const indices of bySurface.values()) {
      for (let i = 1; i < indices.length; i++) uf.union(indices[0], indices[i]);
    }

    // 通道 ②：相同 suspectedResolvesTo 键 & NAMED mention（§0-8）
    const byResolves = new Map<string, number[]>();
    mentions.forEach((m, idx) => {
      const key = m.suspectedResolvesTo;
      if (key === null || key.length === 0) return;
      const bucket = byResolves.get(key) ?? [];
      bucket.push(idx);
      byResolves.set(key, bucket);
    });
    // 每个 suspectedResolvesTo=K 的 mention 必须与 surfaceForm=K 的 NAMED mention 联通
    for (const [key, indices] of byResolves) {
      const namedAnchors: number[] = [];
      mentions.forEach((m, idx) => {
        if (m.surfaceForm === key && m.aliasTypeHint === "NAMED") {
          namedAnchors.push(idx);
        }
      });
      if (namedAnchors.length === 0) continue;
      for (const idx of indices) uf.union(idx, namedAnchors[0]);
      for (let i = 1; i < namedAnchors.length; i++) {
        uf.union(namedAnchors[0], namedAnchors[i]);
      }
    }

    // 通道 ③：AliasEntry
    const aliasGroups = new Map<string, number[]>();
    if (aliasEntries.length > 0) {
      // surface → canonicalName 快表
      const surfaceToCanonical = new Map<string, string>();
      for (const e of aliasEntries) {
        surfaceToCanonical.set(e.canonicalName, e.canonicalName);
        for (const a of e.aliases) surfaceToCanonical.set(a, e.canonicalName);
      }
      mentions.forEach((m, idx) => {
        const canonical = surfaceToCanonical.get(m.surfaceForm);
        if (canonical === undefined) return;
        const bucket = aliasGroups.get(canonical) ?? [];
        bucket.push(idx);
        aliasGroups.set(canonical, bucket);
      });
      for (const indices of aliasGroups.values()) {
        for (let i = 1; i < indices.length; i++) uf.union(indices[0], indices[i]);
      }
    }

    // 按 root 分组
    const bucketByRoot = new Map<number, number[]>();
    for (let i = 0; i < mentions.length; i++) {
      const r = uf.find(i);
      const b = bucketByRoot.get(r) ?? [];
      b.push(i);
      bucketByRoot.set(r, b);
    }

    const groups: CandidateGroup[] = [];
    let gid = 1;
    for (const indices of bucketByRoot.values()) {
      const gMentions = indices.map((i) => mentions[i]);
      const channels = new Set<CandidateGroupChannel>();
      const surfaces = new Set(gMentions.map((m) => m.surfaceForm));
      if (surfaces.size === 1 && gMentions.length >= 2) channels.add("EXACT_SURFACE");
      if (gMentions.some((m) => m.suspectedResolvesTo !== null && m.suspectedResolvesTo.length > 0)) {
        channels.add("SUSPECTED_RESOLVES_TO");
      }

      // AliasEntry 命中：组内所有 distinct surface 都在同一 entry 内
      let aliasEntryHit = false;
      let aliasEntryCanonical: string | null = null;
      for (const entry of aliasEntries) {
        const pool = new Set<string>([entry.canonicalName, ...entry.aliases]);
        if ([...surfaces].every((s) => pool.has(s))) {
          aliasEntryHit = true;
          aliasEntryCanonical = entry.canonicalName;
          channels.add("ALIAS_ENTRY");
          break;
        }
      }

      groups.push({
        groupId        : gid++,
        channels,
        mentions       : gMentions,
        rulePreMergeHit: isRulePreMergeHit(gMentions),
        aliasEntryHit,
        aliasEntryCanonical
      });
    }
    return groups;
  }

  private async filterIdempotent(
    groups: readonly CandidateGroup[]
  ): Promise<CandidateGroup[]> {
    const personaIds = Array.from(
      new Set(
        groups
          .flatMap((g) => g.mentions.map((m) => m.promotedPersonaId))
          .filter((v): v is string => typeof v === "string")
      )
    );
    if (personaIds.length === 0) return [...groups];
    const personas = await this.prisma.persona.findMany({
      where : { id: { in: personaIds } },
      select: { id: true, status: true }
    });
    const statusById = new Map(personas.map((p) => [p.id, p.status]));

    return groups.filter((g) => {
      // 组内每个 mention 都有 promoted 且对应 persona CONFIRMED → 跳过
      const allConfirmed = g.mentions.every((m) => {
        if (m.promotedPersonaId === null) return false;
        return statusById.get(m.promotedPersonaId) === "CONFIRMED";
      });
      return !allConfirmed;
    });
  }

  // ────────────────────────────── LLM 仲裁 ──────────────────────────────

  private async invokeLlm(params: {
    bookTitle   : string;
    bookTypeCode: BookTypeCode;
    group       : CandidateGroup;
  }): Promise<StageBDecision> {
    const { bookTitle, bookTypeCode, group } = params;
    const fewShots = await getFewShots(bookTypeCode, "STAGE_B");

    // 将候选组序列化为 Prompt 可读字符串
    const evidenceLines = group.mentions.map(
      (m) => `  - ch${m.chapterNo} ${m.surfaceForm} [${m.identityClaim}/${m.narrativeRegionType}]: ${m.rawSpan}`
    );
    const surfaces = Array.from(new Set(group.mentions.map((m) => m.surfaceForm)));
    const candidateGroupsStr =
      `candidateGroup#${group.groupId}\n` +
      `  surfaceForms: ${surfaces.join(", ")}\n` +
      `  channels: ${[...group.channels].join(", ")}\n` +
      `  mentions:\n${evidenceLines.join("\n")}`;

    const prompt: PromptMessageInput = await this.buildPrompt({
      bookTitle,
      bookTypeLabel: bookTypeCode,
      candidateGroupsStr,
      fewShots
    });
    const aiResult = await this.aiClient.generateJson(prompt, { temperature: 0 });
    return parseStageBResponse(aiResult.content, group.groupId);
  }

  private async buildPrompt(params: {
    bookTitle         : string;
    bookTypeLabel     : string;
    candidateGroupsStr: string;
    fewShots          : string;
  }): Promise<PromptMessageInput> {
    const resolved = await resolvePromptTemplate({
      slug        : STAGE_B_SLUG,
      bookTypeId  : null,
      replacements: {
        bookTitle           : params.bookTitle,
        bookTypeLabel       : params.bookTypeLabel,
        candidateGroups     : params.candidateGroupsStr,
        bookTypeFewShots    : params.fewShots,
        bookTypeSpecialRules: ""
      }
    });
    return { system: resolved.system, user: resolved.user };
  }

  /**
   * §0-9 充要条件评估：
   * - confidence < floor → SUGGESTION（或 UNSURE 放弃）
   * - MERGE + distinctChapters≥2 + (rulePreMergeHit ∨ aliasEntryHit) → MERGE
   * - 否则 → SUGGESTION
   */
  private evaluateGroupDecision(
    group   : CandidateGroup,
    decision: StageBDecision,
    floor   : number
  ): { action: "MERGE" | "SUGGESTION" | "SPLIT" } {
    if (decision.decision === "SPLIT") {
      return { action: "SPLIT" };
    }
    if (decision.confidence < floor) {
      // LLM 自己虚的 / 下限不够：不合并；若 >= 0.6 保留为 suggestion，否则直接 SPLIT
      return { action: decision.confidence >= 0.6 ? "SUGGESTION" : "SPLIT" };
    }
    const distinctChapters = new Set(group.mentions.map((m) => m.chapterNo)).size;
    const sufficient =
      distinctChapters >= 2 && (group.rulePreMergeHit || group.aliasEntryHit);
    if (decision.decision === "MERGE" && sufficient) {
      return { action: "MERGE" };
    }
    // LLM 说 MERGE 但不满足充分条件 / UNSURE → 挂起
    return { action: "SUGGESTION" };
  }

  // ────────────────────────────── 落库 ──────────────────────────────

  private async persistSingletonPersona(params: {
    bookId       : string;
    group        : CandidateGroup;
    thresholds   : ReturnType<typeof getThresholds>;
    lowChapterIds: Set<string>;
    bookTypeCode : BookTypeCode;
  }): Promise<StageBMergeAction> {
    const { group, thresholds, lowChapterIds } = params;
    const mention = group.mentions[0];

    // 幂等：复用已存在 persona
    if (mention.promotedPersonaId !== null) {
      const existing = await this.prisma.persona.findUnique({
        where : { id: mention.promotedPersonaId },
        select: { id: true, name: true, status: true }
      });
      if (existing !== null) {
        return {
          groupId         : group.groupId,
          canonicalName   : existing.name,
          personaId       : existing.id,
          mergedPersonaIds: [],
          mentionIds      : [mention.id],
          aliasesAdded    : [],
          status          : existing.status === "CONFIRMED" ? "CONFIRMED" : "CANDIDATE",
          hasLowChapter   : this.groupHasLowChapter(group, lowChapterIds)
        };
      }
    }

    const hasLow = this.groupHasLowChapter(group, lowChapterIds);
    const stats = this.computeStats(group.mentions);
    const statusDecision = await this.computeConfirmed({
      distinctChapters: stats.distinctChapters,
      mentionCount    : stats.mentionCount,
      personaIdForBio : null,
      hasLow,
      thresholds
    });

    const canonicalName = mention.surfaceForm;
    const personaId = await this.prisma.$transaction(async (tx) => {
      const persona = await tx.persona.create({
        data: {
          name                  : canonicalName,
          status                : statusDecision,
          mentionCount          : stats.mentionCount,
          distinctChapters      : stats.distinctChapters,
          preprocessorConfidence: hasLow ? "LOW" : "HIGH"
        },
        select: { id: true }
      });
      await tx.personaMention.update({
        where: { id: mention.id },
        data : { promotedPersonaId: persona.id }
      });
      return persona.id;
    });

    return {
      groupId         : group.groupId,
      canonicalName,
      personaId,
      mergedPersonaIds: [],
      mentionIds      : [mention.id],
      aliasesAdded    : [],
      status          : statusDecision,
      hasLowChapter   : hasLow
    };
  }

  private async persistMergeGroup(params: {
    bookId       : string;
    group        : CandidateGroup;
    thresholds   : ReturnType<typeof getThresholds>;
    lowChapterIds: Set<string>;
    bookTypeCode : BookTypeCode;
  }): Promise<StageBMergeAction> {
    const { group, thresholds, lowChapterIds } = params;

    // 选 canonicalName：优先 AliasEntry canonical，其次最长 NAMED surface，兜底任一 surface。
    const canonicalName =
      group.aliasEntryCanonical ?? pickCanonicalSurface(group.mentions);

    const hasLow = this.groupHasLowChapter(group, lowChapterIds);
    const stats = this.computeStats(group.mentions);

    // 复用已有 persona（取第一个已 promoted 的）
    const existingPersonaId = group.mentions
      .map((m) => m.promotedPersonaId)
      .find((v): v is string => typeof v === "string") ?? null;

    const statusDecision = await this.computeConfirmed({
      distinctChapters: stats.distinctChapters,
      mentionCount    : stats.mentionCount,
      personaIdForBio : existingPersonaId,
      hasLow,
      thresholds
    });
    const distinctSurfaces = Array.from(
      new Set(group.mentions.map((m) => m.surfaceForm))
    );

    const result = await this.prisma.$transaction(async (tx) => {
      let personaId: string;
      const mergedPersonaIds: string[] = [];

      if (existingPersonaId === null) {
        const persona = await tx.persona.create({
          data: {
            name                  : canonicalName,
            status                : statusDecision,
            mentionCount          : stats.mentionCount,
            distinctChapters      : stats.distinctChapters,
            aliases               : distinctSurfaces.filter((s) => s !== canonicalName),
            preprocessorConfidence: hasLow ? "LOW" : "HIGH"
          },
          select: { id: true }
        });
        personaId = persona.id;
      } else {
        personaId = existingPersonaId;
        await tx.persona.update({
          where: { id: personaId },
          data : {
            name                  : canonicalName,
            status                : statusDecision,
            mentionCount          : stats.mentionCount,
            distinctChapters      : stats.distinctChapters,
            aliases               : distinctSurfaces.filter((s) => s !== canonicalName),
            preprocessorConfidence: hasLow ? "LOW" : "HIGH"
          }
        });
        // 其它已 promoted 的 persona 标记 MERGED_INTO
        for (const m of group.mentions) {
          const pid = m.promotedPersonaId;
          if (pid !== null && pid !== personaId && !mergedPersonaIds.includes(pid)) {
            await tx.persona.update({
              where: { id: pid },
              data : { status: "MERGED_INTO" }
            });
            mergedPersonaIds.push(pid);
          }
        }
      }

      // 所有 mention 回填 promotedPersonaId
      await tx.personaMention.updateMany({
        where: { id: { in: group.mentions.map((m) => m.id) } },
        data : { promotedPersonaId: personaId }
      });
      return { personaId, mergedPersonaIds };
    });

    return {
      groupId         : group.groupId,
      canonicalName,
      personaId       : result.personaId,
      mergedPersonaIds: result.mergedPersonaIds,
      mentionIds      : group.mentions.map((m) => m.id),
      aliasesAdded    : distinctSurfaces.filter((s) => s !== canonicalName),
      status          : statusDecision,
      hasLowChapter   : hasLow
    };
  }

  /**
   * §0-9 不满足充要（或 SPLIT）路径：保持独立 persona。
   * 桶的划分依据（从严到宽）：
   *   - 已有 promotedPersonaId：按 promotedPersonaId 聚合（复用已有 persona）；
   *   - 未 promoted 的 mention：**一 mention 一 persona**（不按 surfaceForm 合并，
   *     严格遵循 "未达充要条件禁止合并"）。
   */
  private async persistSplitAsSingletons(params: {
    bookId       : string;
    group        : CandidateGroup;
    thresholds   : ReturnType<typeof getThresholds>;
    lowChapterIds: Set<string>;
    bookTypeCode : BookTypeCode;
  }): Promise<StageBMergeAction[]> {
    const { group, thresholds, lowChapterIds } = params;
    const buckets = new Map<string, { surface: string; mentions: StageBMentionRow[] }>();
    for (const m of group.mentions) {
      // 已 promoted 的按 promotedPersonaId 复用；未 promoted 的每条独立 bucket。
      const key = m.promotedPersonaId !== null ? `pid:${m.promotedPersonaId}` : `solo:${m.id}`;
      const bucket = buckets.get(key);
      if (bucket) {
        bucket.mentions.push(m);
      } else {
        buckets.set(key, { surface: m.surfaceForm, mentions: [m] });
      }
    }
    const out: StageBMergeAction[] = [];
    for (const { surface, mentions: mList } of buckets.values()) {
      const subGroup: CandidateGroup = {
        groupId            : group.groupId,
        channels           : new Set(["EXACT_SURFACE"]),
        mentions           : mList,
        rulePreMergeHit    : isRulePreMergeHit(mList),
        aliasEntryHit      : false,
        aliasEntryCanonical: null
      };
      const hasLow = this.groupHasLowChapter(subGroup, lowChapterIds);
      const stats = this.computeStats(mList);
      const existingPersonaId = mList
        .map((m) => m.promotedPersonaId)
        .find((v): v is string => typeof v === "string") ?? null;
      const statusDecision = await this.computeConfirmed({
        distinctChapters: stats.distinctChapters,
        mentionCount    : stats.mentionCount,
        personaIdForBio : existingPersonaId,
        hasLow,
        thresholds
      });

      const personaId = await this.prisma.$transaction(async (tx) => {
        let pid: string;
        if (existingPersonaId === null) {
          const persona = await tx.persona.create({
            data: {
              name                  : surface,
              status                : statusDecision,
              mentionCount          : stats.mentionCount,
              distinctChapters      : stats.distinctChapters,
              preprocessorConfidence: hasLow ? "LOW" : "HIGH"
            },
            select: { id: true }
          });
          pid = persona.id;
        } else {
          pid = existingPersonaId;
          await tx.persona.update({
            where: { id: pid },
            data : {
              status                : statusDecision,
              mentionCount          : stats.mentionCount,
              distinctChapters      : stats.distinctChapters,
              preprocessorConfidence: hasLow ? "LOW" : "HIGH"
            }
          });
        }
        await tx.personaMention.updateMany({
          where: { id: { in: mList.map((m) => m.id) } },
          data : { promotedPersonaId: pid }
        });
        return pid;
      });

      out.push({
        groupId         : group.groupId,
        canonicalName   : surface,
        personaId,
        mergedPersonaIds: [],
        mentionIds      : mList.map((m) => m.id),
        aliasesAdded    : [],
        status          : statusDecision,
        hasLowChapter   : hasLow
      });
    }
    return out;
  }

  private async persistSuggestion(params: {
    bookId         : string;
    group          : CandidateGroup;
    decision       : StageBDecision;
    sourcePersonaId: string;
    targetPersonaId: string;
  }): Promise<StageBSuggestionAction> {
    const { bookId, group, decision, sourcePersonaId, targetPersonaId } = params;
    const evidenceRefs: Record<string, unknown> = {
      kind      : "STAGE_B_AUTO",
      groupId   : group.groupId,
      channels  : [...group.channels],
      mentionIds: group.mentions.map((m) => m.id),
      surfaces  : Array.from(new Set(group.mentions.map((m) => m.surfaceForm)))
    };
    const reason = `StageB LLM ${decision.decision} confidence=${decision.confidence.toFixed(2)} - ${decision.rationale}`;
    const row = await this.prisma.mergeSuggestion.create({
      data: {
        bookId,
        sourcePersonaId,
        targetPersonaId,
        reason,
        confidence  : decision.confidence,
        status      : "PENDING",
        source      : "STAGE_B_AUTO",
        evidenceRefs: evidenceRefs as unknown as Parameters<
          StageBPrismaClient["mergeSuggestion"]["create"]
        >[0]["data"]["evidenceRefs"]
      },
      select: { id: true }
    });
    return {
      groupId     : group.groupId,
      reason,
      confidence  : decision.confidence,
      sourcePersonaId,
      targetPersonaId,
      evidenceRefs: { ...evidenceRefs, suggestionId: row.id }
    };
  }

  // ────────────────────────────── §0-7 / §0-4 门槛 ──────────────────────────────

  private groupHasLowChapter(
    group        : CandidateGroup,
    lowChapterIds: Set<string>
  ): boolean {
    return group.mentions.some((m) => {
      const cid = this.chapterIdByMention.get(m.id);
      if (cid === undefined) return false;
      return lowChapterIds.has(cid);
    });
  }

  private computeStats(mentions: readonly StageBMentionRow[]): {
    mentionCount    : number;
    distinctChapters: number;
  } {
    return {
      mentionCount    : mentions.length,
      distinctChapters: new Set(mentions.map((m) => m.chapterNo)).size
    };
  }

  /**
   * §0-7 CONFIRMED 门槛 + §0-4 LOW 加严。
   * 分支 A：distinctChapters≥thresh AND mentionCount≥thresh（本次默认分支）。
   * 分支 B：effectiveBiographyCount≥2（查已有 biography_records；Stage C 跑过才可能命中）。
   */
  private async computeConfirmed(params: {
    distinctChapters: number;
    mentionCount    : number;
    personaIdForBio : string | null;
    hasLow          : boolean;
    thresholds      : ReturnType<typeof getThresholds>;
  }): Promise<"CONFIRMED" | "CANDIDATE"> {
    const { distinctChapters, mentionCount, personaIdForBio, hasLow, thresholds } = params;
    const minCh = thresholds.confirmedMinChapters + (hasLow ? 1 : 0);
    const minMn = thresholds.confirmedMinMentions + (hasLow ? 1 : 0);

    if (distinctChapters >= minCh && mentionCount >= minMn) {
      return "CONFIRMED";
    }

    // 分支 B：effectiveBiographyCount（只在 persona 已存在时才能查）
    if (personaIdForBio !== null) {
      const bioCount = await this.prisma.biographyRecord.count({
        where: {
          personaId          : personaIdForBio,
          narrativeLens      : { in: ["SELF", "IMPERSONATING"] },
          narrativeRegionType: "NARRATIVE"
        }
      });
      if (bioCount >= 2) return "CONFIRMED";
    }
    return "CANDIDATE";
  }

  // ────────────────────────────── B.5 PENDING 消费 ──────────────────────────────

  private async consumeB5Suggestions(bookId: string): Promise<StageB5ConsumeAction[]> {
    const pending = await this.prisma.mergeSuggestion.findMany({
      where : { bookId, source: "STAGE_B5_TEMPORAL", status: "PENDING" },
      select: {
        id             : true,
        sourcePersonaId: true,
        targetPersonaId: true,
        evidenceRefs   : true
      }
    });
    const out: StageB5ConsumeAction[] = [];
    for (const s of pending) {
      const refs = (s.evidenceRefs ?? null) as {
        kind?             : unknown;
        postDeathMentions?: Array<{ chapterNo?: number; surfaceForm?: string }>;
      } | null;
      if (refs === null || refs.kind !== "IMPERSONATION_CANDIDATE") continue;

      const inferred = await this.inferImpersonator({
        bookId,
        sourcePersonaId  : s.sourcePersonaId,
        postDeathMentions: Array.isArray(refs.postDeathMentions) ? refs.postDeathMentions : []
      });

      if (inferred !== null) {
        await this.prisma.mergeSuggestion.update({
          where: { id: s.id },
          data : {
            targetPersonaId: inferred,
            reason         : `StageB inferred impersonator personaId=${inferred} for deceased persona ${s.sourcePersonaId}`
          }
        });
        out.push({
          suggestionId  : s.id,
          originalSource: "STAGE_B5_TEMPORAL",
          originalTarget: s.targetPersonaId,
          newTargetId   : inferred,
          status        : "PENDING",
          reason        : "impersonator inferred"
        });
      } else {
        await this.prisma.mergeSuggestion.update({
          where: { id: s.id },
          data : {
            status: "NEEDS_HUMAN_REVIEW",
            reason: `StageB could not infer impersonator for deceased persona ${s.sourcePersonaId}; human review required`
          }
        });
        out.push({
          suggestionId  : s.id,
          originalSource: "STAGE_B5_TEMPORAL",
          originalTarget: s.targetPersonaId,
          newTargetId   : null,
          status        : "NEEDS_HUMAN_REVIEW",
          reason        : "could not infer impersonator"
        });
      }
    }
    return out;
  }

  /**
   * 冒名者推断规则（§0-14 逆向建模）：
   *   规则 A：post-death 章节内存在 `identityClaim=IMPERSONATING` 的 mention，
   *            且其 promotedPersonaId ≠ sourcePersona → 取该 persona 为冒名者。
   *   规则 B：另有 persona 的 mention 在同章节使用与 postDeathMention 相同的 surfaceForm 且
   *            promotedPersonaId ≠ sourcePersona → 取该 persona 为冒名者。
   * 若推断出唯一候选 → 返回；多候选 / 零候选 → 返回 null（交人工审核）。
   */
  private async inferImpersonator(params: {
    bookId           : string;
    sourcePersonaId  : string;
    postDeathMentions: ReadonlyArray<{ chapterNo?: number; surfaceForm?: string }>;
  }): Promise<string | null> {
    const { bookId, sourcePersonaId, postDeathMentions } = params;
    const chapterNos = Array.from(
      new Set(
        postDeathMentions
          .map((p) => p.chapterNo)
          .filter((n): n is number => typeof n === "number")
      )
    );
    const surfaceForms = Array.from(
      new Set(
        postDeathMentions
          .map((p) => p.surfaceForm)
          .filter((s): s is string => typeof s === "string")
      )
    );
    if (chapterNos.length === 0) return null;

    const candidates = await this.prisma.personaMention.findMany({
      where: {
        bookId,
        chapterNo        : { in: chapterNos },
        promotedPersonaId: { not: null },
        NOT              : { promotedPersonaId: sourcePersonaId },
        OR               : [
          { identityClaim: "IMPERSONATING" },
          { surfaceForm: { in: surfaceForms } }
        ]
      },
      select: { promotedPersonaId: true }
    });
    const ids = Array.from(
      new Set(
        candidates
          .map((c) => c.promotedPersonaId)
          .filter((v): v is string => typeof v === "string")
      )
    );
    if (ids.length === 1) return ids[0];
    return null;
  }
}

/** 选 canonicalName：优先 NAMED 且最长 surface；否则任一 surface。 */
function pickCanonicalSurface(mentions: readonly StageBMentionRow[]): string {
  const named = mentions.filter((m) => m.aliasTypeHint === "NAMED");
  const pool = named.length > 0 ? named : [...mentions];
  let best = pool[0].surfaceForm;
  for (const m of pool) {
    if (m.surfaceForm.length > best.length) best = m.surfaceForm;
  }
  return best;
}

/**
 * 解析 LLM 对某一候选组的输出。
 * 兼容两种顶层形态：`{decisions:[...]}`、`[...]`、或单对象。
 * groupId 命中优先；若不命中取数组第一项。
 */
export function parseStageBResponse(
  content: string,
  groupId: number
): StageBDecision {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { groupId, decision: "UNSURE", confidence: 0, rationale: "JSON parse failed" };
  }

  let items: RawStageBLlmItem[] = [];
  if (Array.isArray(parsed)) {
    items = parsed as RawStageBLlmItem[];
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as { decisions?: unknown[]; groupId?: number };
    if (Array.isArray(obj.decisions)) {
      items = obj.decisions as RawStageBLlmItem[];
    } else if (typeof obj.groupId === "number") {
      items = [parsed as RawStageBLlmItem];
    }
  }

  const hit = items.find((it) => it.groupId === groupId) ?? items[0];
  if (hit === undefined) {
    return { groupId, decision: "UNSURE", confidence: 0, rationale: "empty decisions" };
  }

  const decisionRaw = typeof hit.decision === "string" ? hit.decision.toUpperCase() : "UNSURE";
  const decision: "MERGE" | "SPLIT" | "UNSURE" =
    decisionRaw === "MERGE" || decisionRaw === "SPLIT" ? decisionRaw : "UNSURE";
  const rawConf = typeof hit.confidence === "number" ? hit.confidence : 0;
  const confidence = Math.min(1, Math.max(0, rawConf));
  const rationale = typeof hit.rationale === "string" ? hit.rationale : "";
  return { groupId, decision, confidence, rationale };
}

// Re-export AliasType for callers who need it.
export type { AliasType };
