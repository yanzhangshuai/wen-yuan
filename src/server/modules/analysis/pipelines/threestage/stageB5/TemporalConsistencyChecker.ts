/**
 * 文件定位（Stage B.5 · 时序一致性检查主服务）：
 * - 契约源：`docs/superpowers/specs/2026-04-17-character-extraction-accuracy-redesign.md`
 *   §0-3（双检）/ §0-14（反馈通道 · 不回环）/ REV-2。
 *
 * 职责（MVP，§0-3 第①类“死后行动”）：
 * 1. 对每本书，扫描所有 `deathChapterNo` 非空的 persona；
 * 2. 查其在“死亡章之后”的 `persona_mentions`：仅当 identityClaim ∈ {SELF, IMPERSONATING}
 *    且 `narrativeRegionType = NARRATIVE` 时才视作“死后仍在行动”；
 * 3. 命中 → 写 `merge_suggestions(kind=IMPERSONATION_CANDIDATE/subKind=POST_DEATH_ACTION,
 *    status=PENDING, source=STAGE_B5_TEMPORAL)`，evidenceRefs 附 postDeathMentions 列表；
 * 4. 幂等：同 (bookId, sourcePersonaId, kind=IMPERSONATION_CANDIDATE,
 *    source=STAGE_B5_TEMPORAL, status=PENDING) 已存在则跳过。
 *
 * §0-14 反馈通道边界：
 * - 本 checker **只写 merge_suggestions**，不改 persona（不回环），
 *   具体冒名者由下一次 job 的 Stage B 消费 PENDING 队列时推断。
 *
 * Schema 适配决策（与 PRD 原文字段名差异 · 见交付报告“决策点”）：
 * - PRD 约定 `kind='IMPERSONATION_CANDIDATE'` / `evidenceJson`，但 `MergeSuggestion` 表未设
 *   `kind` 列，且字段名为 `evidenceRefs`：`kind` / `subKind` 落入 `evidenceRefs` JSON。
 * - PRD 约定 `targetPersonaId=null`，但 Prisma schema 的 `targetPersonaId` 非空：
 *   采用“自指哨兵”（targetPersonaId = sourcePersonaId）表达“目标尚待 Stage B 推断”，
 *   Stage B 消费时以 `source === 'STAGE_B5_TEMPORAL'` + `kind === 'IMPERSONATION_CANDIDATE'`
 *   识别并覆盖真实冒名者 ID。
 * - PRD 原文字段 `narrativeLens` 指 `PersonaMention.identityClaim`（Stage A 持久化字段名）。
 *
 * 非运行时回环（§0-14）：
 * - 可独立调用（单测场景）或由三阶段 orchestrator 串接（本任务不接 orchestrator）。
 *
 * 未做（T05 follow-up，§0-3 第②类 + REV-2）：
 * - 跨地点并发检查（依赖 `areMutuallyExclusive`，且要求 Stage A 已写 `currentLocation`）。
 *   见下方 TODO(T05) 扩展位。
 */

import type { IdentityClaim, PrismaClient } from "@/generated/prisma/client";

import type {
  PostDeathMentionEvidence,
  TemporalCheckResult,
  TemporalEvidenceRefs,
  TemporalPersonaReport
} from "@/server/modules/analysis/pipelines/threestage/stageB5/types";

/**
 * 本 checker 使用的最小 Prisma 面（便于构造器注入 mock）。
 * 仅暴露 persona / personaMention / mergeSuggestion 三个模型的读写。
 */
export type TemporalB5PrismaClient = Pick<
  PrismaClient,
  "persona" | "personaMention" | "mergeSuggestion"
>;

/** Stage A 写入 persona_mentions 的 identityClaim 中，视作“本人行动”的子集。*/
const ACTIVE_CLAIMS: readonly IdentityClaim[] = ["SELF", "IMPERSONATING"];

/** 只有正文叙事段的 mention 才作为“死后行动”证据；POEM/COMMENTARY/DIALOGUE 皆排除。*/
const NARRATIVE_REGION = "NARRATIVE";

/** 写入 merge_suggestions 时恒定的来源枚举值（与 PRD §0-3 协议一致）。*/
const SOURCE_TAG = "STAGE_B5_TEMPORAL";

/** 确定性规则检测，置信度恒定 0.9（PRD §0-3 约定）。*/
const FIXED_CONFIDENCE = 0.9;

/**
 * Stage B.5 时序一致性检查器。
 *
 * 典型用法：
 * ```ts
 * const checker = new TemporalConsistencyChecker(prisma);
 * const result = await checker.check(bookId);
 * ```
 */
export class TemporalConsistencyChecker {
  constructor(private readonly prisma: TemporalB5PrismaClient) {}

  /**
   * 对指定 book 扫描一次全书：对所有设置了 `deathChapterNo` 的 persona 做死后行动检测，
   * 命中者写 `merge_suggestions PENDING`。
   *
   * @param bookId 目标书籍 ID（UUID）。
   * @returns 扫描统计与每个 persona 的处理报告。
   */
  async check(bookId: string): Promise<TemporalCheckResult> {
    // 步骤 1：捞出本书里已确认死亡章节号的 persona；
    // deathChapterNo 是 Persona 全局字段（§0-2 双源确认），但通过 personaMentions.some 限定本书范围。
    const candidates = await this.prisma.persona.findMany({
      where: {
        deathChapterNo : { not: null },
        personaMentions: { some: { bookId } }
      },
      select: {
        id            : true,
        deathChapterNo: true
      }
    });

    const reports: TemporalPersonaReport[] = [];
    let   created = 0;
    let   skipped = 0;

    for (const persona of candidates) {
      // Prisma 类型保留 number | null，`where.not: null` 已过滤，这里做运行时兜底避免 strict-null 报错。
      if (persona.deathChapterNo === null) continue;

      const postDeathMentions = await this.findPostDeathMentions(
        bookId,
        persona.id,
        persona.deathChapterNo
      );

      if (postDeathMentions.length === 0) {
        reports.push({
          personaId        : persona.id,
          deathChapterNo   : persona.deathChapterNo,
          postDeathMentions: 0,
          action           : "none",
          suggestionId     : null
        });
        continue;
      }

      // 幂等：同 persona 已有 PENDING 来源=STAGE_B5_TEMPORAL 的 IMPERSONATION_CANDIDATE 则跳过。
      const existing = await this.findExistingPendingSuggestion(bookId, persona.id);
      if (existing !== null) {
        skipped += 1;
        reports.push({
          personaId        : persona.id,
          deathChapterNo   : persona.deathChapterNo,
          postDeathMentions: postDeathMentions.length,
          action           : "skipped_existing",
          suggestionId     : existing
        });
        continue;
      }

      const suggestionId = await this.createSuggestion(
        bookId,
        persona.id,
        persona.deathChapterNo,
        postDeathMentions
      );
      created += 1;
      reports.push({
        personaId        : persona.id,
        deathChapterNo   : persona.deathChapterNo,
        postDeathMentions: postDeathMentions.length,
        action           : "created",
        suggestionId
      });
    }

    // TODO(T05 follow-up, §0-3 第②类 + REV-2):
    //   跨地点并发检查——依赖 `areMutuallyExclusive(locA, locB)` 与 Stage A 写入的
    //   `Persona.currentLocation` / `currentLocationChapter`。扩展位：在此处循环
    //   candidates（或另一组全体 persona），按章节聚合 mention 的 currentLocation 标签，
    //   命中互斥则产出同类 IMPERSONATION_CANDIDATE（subKind='CROSS_LOCATION_CONCURRENT'）。
    //   需受 feature flag TEMPORAL_CHECK_LOCATION 控制，首版默认关闭。

    return {
      bookId,
      personasScanned   : candidates.length,
      suggestionsCreated: created,
      suggestionsSkipped: skipped,
      reports
    };
  }

  /**
   * 捞出指定 persona 在 deathChapterNo 之后（严格大于）的“本人行动型” mention。
   *
   * 过滤口径（§0-3(a)）：
   * - `promotedPersonaId = persona.id`：晋级后回填的 persona 归属；
   * - `chapterNo > deathChapterNo`：严格大于，death 当章的尾声行动属合理范围；
   * - `identityClaim ∈ {SELF, IMPERSONATING}`：QUOTED/REPORTED/HISTORICAL 皆不算“死后行动”
   *   （被追忆、被转述、典故引用均合法）；
   * - `narrativeRegionType = NARRATIVE`：POEM/COMMENTARY 的署名不计入事实时间轴。
   */
  private async findPostDeathMentions(
    bookId         : string,
    personaId      : string,
    deathChapterNo : number
  ): Promise<PostDeathMentionEvidence[]> {
    const rows = await this.prisma.personaMention.findMany({
      where: {
        bookId,
        promotedPersonaId  : personaId,
        chapterNo          : { gt: deathChapterNo },
        identityClaim      : { in: Array.from(ACTIVE_CLAIMS) },
        narrativeRegionType: NARRATIVE_REGION
      },
      select: {
        id                 : true,
        chapterNo          : true,
        surfaceForm        : true,
        rawSpan            : true,
        identityClaim      : true,
        narrativeRegionType: true
      },
      orderBy: { chapterNo: "asc" }
    });

    return rows.map((r) => ({
      mentionId          : r.id,
      chapterNo          : r.chapterNo,
      surfaceForm        : r.surfaceForm,
      rawSpan            : r.rawSpan,
      identityClaim      : r.identityClaim,
      narrativeRegionType: r.narrativeRegionType
    }));
  }

  /**
   * 幂等查找：是否已存在同 persona、同来源、同 kind 的 PENDING 建议。
   *
   * 注意：`kind` 存于 `evidenceRefs` JSON，Prisma 不支持直接索引 JSON 字段做 `equals`
   * 的复杂匹配，这里用 `source + status + sourcePersonaId` 先过滤候选集，再在应用层
   * 检查 `evidenceRefs.kind`，兼顾正确性与可移植性（候选集通常 ≤1）。
   */
  private async findExistingPendingSuggestion(
    bookId   : string,
    personaId: string
  ): Promise<string | null> {
    const rows = await this.prisma.mergeSuggestion.findMany({
      where: {
        bookId,
        sourcePersonaId: personaId,
        source         : SOURCE_TAG,
        status         : "PENDING"
      },
      select: {
        id          : true,
        evidenceRefs: true
      }
    });

    for (const row of rows) {
      const refs = row.evidenceRefs as { kind?: unknown } | null;
      if (refs !== null && refs !== undefined && refs.kind === "IMPERSONATION_CANDIDATE") {
        return row.id;
      }
    }
    return null;
  }

  /**
   * 写入 PENDING 合并建议。`targetPersonaId` 使用自指哨兵（= sourcePersonaId），
   * 表达“具体冒名者待 Stage B 下一轮消费时推断”（见文件头“Schema 适配决策”）。
   */
  private async createSuggestion(
    bookId           : string,
    personaId        : string,
    deathChapterNo   : number,
    postDeathMentions: PostDeathMentionEvidence[]
  ): Promise<string> {
    const evidence: TemporalEvidenceRefs = {
      kind   : "IMPERSONATION_CANDIDATE",
      subKind: "POST_DEATH_ACTION",
      deathChapterNo,
      postDeathMentions
    };

    const row = await this.prisma.mergeSuggestion.create({
      data: {
        bookId,
        sourcePersonaId: personaId,
        // 自指哨兵：Stage B 消费时将其替换为真实冒名者 persona id。
        targetPersonaId: personaId,
        reason         : `POST_DEATH_ACTION: persona ${personaId} 死于第 ${deathChapterNo} 回后仍在 ${postDeathMentions.length} 处 NARRATIVE 本人行动`,
        confidence     : FIXED_CONFIDENCE,
        status         : "PENDING",
        source         : SOURCE_TAG,
        evidenceRefs   : evidence as unknown as Parameters<
          TemporalB5PrismaClient["mergeSuggestion"]["create"]
        >[0]["data"]["evidenceRefs"]
      },
      select: { id: true }
    });

    return row.id;
  }
}
