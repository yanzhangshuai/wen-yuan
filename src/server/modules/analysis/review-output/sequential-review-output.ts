import type { PrismaClient } from "@/generated/prisma/client";
import {
  BioCategory,
  ChapterSegmentType,
  ClaimSource,
  IdentityResolutionKind,
  MentionKind,
  NarrativeLens,
  PersonaCandidateStatus
} from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import type { ClaimRepositoryTransactionClient } from "@/server/modules/analysis/claims/claim-repository";
import { createClaimRepositoryForTransaction } from "@/server/modules/analysis/claims/claim-repository";
import {
  toClaimCreateData,
  validateClaimDraftByFamily,
  type ClaimCreateDataByFamily,
  type ClaimDraftByFamily
} from "@/server/modules/analysis/claims/claim-schemas";
import { createClaimWriteService } from "@/server/modules/analysis/claims/claim-write-service";
import { normalizeTextForEvidence } from "@/server/modules/analysis/evidence/offset-map";

// evidence score 饱和阈值：引用次数达到此值时得分为 1.0
const EVIDENCE_SCORE_SATURATION_COUNT = 10;

export interface SequentialReviewOutputInput {
  bookId    : string;
  runId     : string;
  chapterIds: string[];
}

export interface SequentialReviewOutputResult {
  personaCandidates       : number;
  entityMentions          : number;
  eventClaims             : number;
  relationClaims          : number;
  identityResolutionClaims: number;
}

type DeleteWhere = Record<string, unknown>;

// 最小化 tx 接口，避免直接依赖 Prisma 生成的 TransactionClient 类型。
// 继承 ClaimRepositoryTransactionClient 以确保 claim delegate 类型安全；
// entityMention 额外扩展 create（取回生成 ID 用于 identity-resolution 关联）。
interface SequentialReviewTx extends ClaimRepositoryTransactionClient {
  chapter: {
    findMany(args: {
      where : { bookId: string; id: { in: string[] } };
      select: { id: true; no: true; title: true; content: true };
    }): Promise<Array<{ id: string; no: number; title: string; content: string }>>;
  };
  mention: {
    findMany(args: {
      where  : { chapterId: { in: string[] } };
      include: { persona: { select: { id: true; name: true } } };
    }): Promise<Array<{
      id       : string;
      chapterId: string;
      rawText  : string;
      personaId: string;
      persona  : { id: string; name: string };
    }>>;
  };
  biographyRecord: {
    findMany(args: {
      where  : { chapterId: { in: string[] } };
      include: { persona: { select: { id: true; name: true } } };
    }): Promise<Array<{
      id       : string;
      chapterId: string;
      personaId: string;
      chapterNo: number;
      category : BioCategory;
      title    : string | null;
      event    : string;
      persona  : { id: string; name: string };
    }>>;
  };
  relationship: {
    findMany(args: {
      where  : { chapterId: { in: string[] } };
      include: {
        source: { select: { id: true; name: true } };
        target: { select: { id: true; name: true } };
      };
    }): Promise<Array<{
      id       : string;
      chapterId: string;
      sourceId : string;
      targetId : string;
      type     : string;
      source   : { id: string; name: string };
      target   : { id: string; name: string };
    }>>;
  };
  personaCandidate: {
    deleteMany(args: { where: { bookId: string; runId: string } }): Promise<{ count: number }>;
    create(args: {
      data: {
        bookId            : string;
        runId             : string;
        canonicalLabel    : string;
        candidateStatus   : string;
        firstSeenChapterNo: number | null;
        lastSeenChapterNo : number | null;
        mentionCount      : number;
        evidenceScore     : number;
      };
    }): Promise<{ id: string }>;
  };
  chapterSegment: {
    findFirst(args: {
      where: { runId: string; chapterId: string; segmentIndex: number };
    }): Promise<{ id: string } | null>;
    create(args: {
      data: {
        bookId        : string;
        chapterId     : string;
        runId         : string;
        segmentIndex  : number;
        segmentType   : string;
        startOffset   : number;
        endOffset     : number;
        text          : string;
        normalizedText: string;
      };
    }): Promise<{ id: string }>;
  };
  evidenceSpan: {
    deleteMany(args: { where: DeleteWhere }): Promise<{ count: number }>;
    create(args: {
      data: {
        bookId             : string;
        chapterId          : string;
        segmentId          : string;
        startOffset        : number;
        endOffset          : number;
        quotedText         : string;
        normalizedText     : string;
        speakerHint        : null;
        narrativeRegionType: string;
        createdByRunId     : string;
      };
    }): Promise<{ id: string }>;
  };
  // entityMention 在基类中为 CreateManyDelegate（只含 createMany + deleteMany），
  // 此处额外增加 create 以取回生成 ID
  entityMention: ClaimRepositoryTransactionClient["entityMention"] & {
    deleteMany(args: { where: DeleteWhere }): Promise<{ count: number }>;
    create(args: {
      data: ClaimCreateDataByFamily["ENTITY_MENTION"];
    }): Promise<{ id: string } & ClaimCreateDataByFamily["ENTITY_MENTION"]>;
  };
  $transaction: unknown;
}

export function createSequentialReviewOutputAdapter(prismaClient: PrismaClient = prisma) {
  async function writeBookReviewOutput(
    input: SequentialReviewOutputInput
  ): Promise<SequentialReviewOutputResult> {
    // PrismaClient.$transaction 的泛型签名无法直接接受窄化的 SequentialReviewTx，
    // 故用 as unknown as 绕过类型系统，实际运行时 Prisma 传入的 tx 满足接口约定。
    return (prismaClient as unknown as { $transaction<T>(fn: (tx: SequentialReviewTx) => Promise<T>): Promise<T> })
      .$transaction(async (tx) => {
        const { bookId, runId, chapterIds } = input;

        // 1. 加载目标章节（bookId + chapterIds 双重约束，防止加载越权章节）
        const chapters = await tx.chapter.findMany({
          where : { bookId, id: { in: chapterIds } },
          select: { id: true, no: true, title: true, content: true }
        });

        // M2: 用数据库实际返回的章节 ID，防止调用方传入不属于本书的孤儿 ID
        const validatedChapterIds = chapters.map(c => c.id);

        // 2. 加载遗留行（mentions / biographyRecords / relationships）
        const mentions = await tx.mention.findMany({
          where  : { chapterId: { in: validatedChapterIds } },
          include: { persona: { select: { id: true, name: true } } }
        });
        const biographyRecords = await tx.biographyRecord.findMany({
          where  : { chapterId: { in: validatedChapterIds } },
          include: { persona: { select: { id: true, name: true } } }
        });
        const relationships = await tx.relationship.findMany({
          where  : { chapterId: { in: validatedChapterIds } },
          include: {
            source: { select: { id: true, name: true } },
            target: { select: { id: true, name: true } }
          }
        });

        // 3. 收集所有不重复 persona，并统计来自 mentions 的章节号信息
        const personaIdToName = new Map<string, string>();
        const personaChapterNos = new Map<string, number[]>();
        const chapterNoMap = new Map<string, number>(chapters.map(c => [c.id, c.no]));

        for (const m of mentions) {
          personaIdToName.set(m.persona.id, m.persona.name);
          const no = chapterNoMap.get(m.chapterId);
          if (no !== undefined) {
            const arr = personaChapterNos.get(m.persona.id) ?? [];
            arr.push(no);
            personaChapterNos.set(m.persona.id, arr);
          }
        }
        for (const b of biographyRecords) {
          personaIdToName.set(b.persona.id, b.persona.name);
        }
        for (const r of relationships) {
          personaIdToName.set(r.source.id, r.source.name);
          personaIdToName.set(r.target.id, r.target.name);
        }

        // 4. 删除旧候选人，按唯一 persona 重建
        await tx.personaCandidate.deleteMany({ where: { bookId, runId } });
        const candidateIdMap = new Map<string, string>(); // personaId → candidateId

        for (const [personaId, name] of personaIdToName.entries()) {
          const nos = personaChapterNos.get(personaId) ?? [];
          // bio/relation-only personas 无 mention 记录，mentionCount 使用 0 而非人为补 1
          const mentionCount = nos.length;
          const firstSeenChapterNo = nos.length > 0 ? Math.min(...nos) : null;
          const lastSeenChapterNo  = nos.length > 0 ? Math.max(...nos) : null;

          const candidate = await tx.personaCandidate.create({
            data: {
              bookId,
              runId,
              canonicalLabel : name,
              candidateStatus: PersonaCandidateStatus.CONFIRMED,
              firstSeenChapterNo,
              lastSeenChapterNo,
              mentionCount,
              evidenceScore  : Math.min(1, Math.max(0.1, mentionCount / EVIDENCE_SCORE_SATURATION_COUNT))
            }
          });
          candidateIdMap.set(personaId, candidate.id);
        }

        // 5. 逐章处理：segment → entity mentions → 章节级 evidence span → event/relation claims
        const claimService = createClaimWriteService(
          createClaimRepositoryForTransaction(tx)
        );
        // mentionId → { entityMentionId, evidenceSpanId }
        const entityMentionInfoMap = new Map<string, { id: string; evidenceSpanId: string }>();
        let entityMentionCount = 0;
        let eventClaimCount    = 0;
        let relationClaimCount = 0;

        for (const chapter of chapters) {
          // 5a. 确保 chapter segment 存在（segmentIndex: 0 的 NARRATIVE 全章段）
          let segment = await tx.chapterSegment.findFirst({
            where: { runId, chapterId: chapter.id, segmentIndex: 0 }
          });
          if (!segment) {
            segment = await tx.chapterSegment.create({
              data: {
                bookId,
                chapterId     : chapter.id,
                runId,
                segmentIndex  : 0,
                segmentType   : ChapterSegmentType.NARRATIVE,
                startOffset   : 0,
                endOffset     : chapter.content.length,
                text          : chapter.content,
                normalizedText: normalizeTextForEvidence(chapter.content)
              }
            });
          }

          // 5b. 删除该章节旧 entity mentions
          await tx.entityMention.deleteMany({
            where: { bookId, chapterId: chapter.id, runId, source: ClaimSource.AI }
          });

          // 5b2. 删除该章节旧 evidence spans，防止重跑产生孤儿重复行
          await tx.evidenceSpan.deleteMany({
            where: { bookId, chapterId: chapter.id, createdByRunId: runId }
          });

          // 5c. 为每个 mention 创建 evidence span + entity mention
          const chapterMentions = mentions.filter(m => m.chapterId === chapter.id);
          for (const mention of chapterMentions) {
            const rawText = mention.rawText;
            const idx     = chapter.content.indexOf(rawText);
            let startOffset: number;
            let endOffset  : number;

            if (idx >= 0) {
              startOffset  = idx;
              endOffset    = idx + rawText.length;
            } else {
              // rawText 不在章节原文中，降级为第一个字符范围
              startOffset = 0;
              endOffset   = 1;
            }

            const spanText   = chapter.content.slice(startOffset, endOffset);
            const evidenceSpan = await tx.evidenceSpan.create({
              data: {
                bookId,
                chapterId          : chapter.id,
                segmentId          : segment.id,
                startOffset,
                endOffset,
                quotedText         : spanText,
                normalizedText     : normalizeTextForEvidence(spanText),
                speakerHint        : null,
                narrativeRegionType: "NARRATIVE",
                createdByRunId     : runId
              }
            });

            // rawText 不在章节原文中时，使用 persona name 作为 surfaceText
            const surfaceText = idx >= 0
              ? (rawText.trim() || mention.persona.name)
              : mention.persona.name;
            const draft = validateClaimDraftByFamily("ENTITY_MENTION", {
              claimFamily              : "ENTITY_MENTION",
              bookId,
              chapterId                : chapter.id,
              runId,
              source                   : "AI",
              confidence               : 0.9,
              surfaceText,
              mentionKind              : MentionKind.NAMED,
              identityClaim            : null,
              aliasTypeHint            : null,
              speakerPersonaCandidateId: null,
              suspectedResolvesTo      : null,
              evidenceSpanId           : evidenceSpan.id
            });

            const mentionData = toClaimCreateData(draft) as ClaimCreateDataByFamily["ENTITY_MENTION"];
            const entityMention = await tx.entityMention.create({ data: mentionData });
            entityMentionInfoMap.set(mention.id, {
              id            : entityMention.id,
              evidenceSpanId: evidenceSpan.id
            });
            entityMentionCount++;
          }

          // 5d. 章节级 evidence span（供 event / relation claims 使用）
          let chapterEvidenceSpanId: string | null = null;
          if (chapter.content.length > 0) {
            const chapterSpan = await tx.evidenceSpan.create({
              data: {
                bookId,
                chapterId          : chapter.id,
                segmentId          : segment.id,
                startOffset        : 0,
                endOffset          : chapter.content.length,
                quotedText         : chapter.content,
                normalizedText     : normalizeTextForEvidence(chapter.content),
                speakerHint        : null,
                narrativeRegionType: "NARRATIVE",
                createdByRunId     : runId
              }
            });
            chapterEvidenceSpanId = chapterSpan.id;
          } else {
            // I4: 章节内容为空时，如果仍有遗留传记或关系行，发出结构化警告。
            // 不创建零长度 evidence span（现有校验不允许 endOffset === 0）。
            const bioCnt = biographyRecords.filter(b => b.chapterId === chapter.id).length;
            const relCnt = relationships.filter(r => r.chapterId === chapter.id).length;
            if (bioCnt > 0 || relCnt > 0) {
              console.warn(
                "[sequential-review-output] chapter has empty content but legacy rows exist; " +
                "event/relation claims will be skipped for this chapter",
                {
                  bookId,
                  runId,
                  chapterId     : chapter.id,
                  biographyCount: bioCnt,
                  relationCount : relCnt
                }
              );
            }
          }

          // 5e. Event claims（来自 biographyRecords）
          const chapterBios = biographyRecords.filter(b => b.chapterId === chapter.id);
          if (chapterBios.length > 0 && chapterEvidenceSpanId !== null) {
            const evtResult = await claimService.writeClaimBatch({
              family: "EVENT",
              scope : {
                bookId,
                chapterId: chapter.id,
                runId,
                stageKey : "stage_a_extraction"
              },
              drafts: chapterBios.map(bio => ({
                claimFamily              : "EVENT",
                bookId,
                chapterId                : chapter.id,
                runId,
                source                   : "AI",
                confidence               : 0.9,
                reviewState              : "ACCEPTED",
                subjectMentionId         : null,
                subjectPersonaCandidateId: candidateIdMap.get(bio.personaId) ?? null,
                predicate                : String(bio.title ?? bio.category),
                objectText               : bio.event,
                objectPersonaCandidateId : null,
                locationText             : null,
                timeHintId               : null,
                eventCategory            : bio.category,
                narrativeLens            : NarrativeLens.SELF,
                evidenceSpanIds          : [chapterEvidenceSpanId],
                supersedesClaimId        : null,
                derivedFromClaimId       : null,
                createdByUserId          : null,
                reviewedByUserId         : null,
                reviewNote               : null
              }))
            });
            eventClaimCount += evtResult.createdCount;
          }

          // 5f. Relation claims（来自 relationships）
          const chapterRels = relationships.filter(r => r.chapterId === chapter.id);
          if (chapterRels.length > 0 && chapterEvidenceSpanId !== null) {
            const relResult = await claimService.writeClaimBatch({
              family: "RELATION",
              scope : {
                bookId,
                chapterId: chapter.id,
                runId,
                stageKey : "stage_a_extraction"
              },
              drafts: chapterRels.map(rel => ({
                claimFamily             : "RELATION",
                bookId,
                chapterId               : chapter.id,
                runId,
                source                  : "AI",
                confidence              : 0.9,
                reviewState             : "ACCEPTED",
                sourceMentionId         : null,
                targetMentionId         : null,
                sourcePersonaCandidateId: candidateIdMap.get(rel.sourceId) ?? null,
                targetPersonaCandidateId: candidateIdMap.get(rel.targetId) ?? null,
                relationTypeKey         : rel.type,
                relationLabel           : rel.type,
                relationTypeSource      : "CUSTOM",
                direction               : "UNDIRECTED",
                effectiveChapterStart   : null,
                effectiveChapterEnd     : null,
                timeHintId              : null,
                evidenceSpanIds         : [chapterEvidenceSpanId],
                supersedesClaimId       : null,
                derivedFromClaimId      : null,
                createdByUserId         : null,
                reviewedByUserId        : null,
                reviewNote              : null
              }))
            });
            relationClaimCount += relResult.createdCount;
          }
        }

        // 6. Identity-resolution claims（书级，对应所有 entity mentions）
        const irDrafts: ClaimDraftByFamily["IDENTITY_RESOLUTION"][] = [];
        for (const mention of mentions) {
          const mentionInfo = entityMentionInfoMap.get(mention.id);
          const candidateId = candidateIdMap.get(mention.persona.id);
          if (mentionInfo && candidateId) {
            irDrafts.push({
              claimFamily       : "IDENTITY_RESOLUTION",
              bookId,
              chapterId         : null,
              runId,
              source            : "AI",
              confidence        : 1.0,
              reviewState       : "ACCEPTED",
              mentionId         : mentionInfo.id,
              personaCandidateId: candidateId,
              resolvedPersonaId : mention.persona.id,
              resolutionKind    : IdentityResolutionKind.RESOLVES_TO,
              rationale         : "sequential legacy resolver accepted this persona",
              evidenceSpanIds   : [mentionInfo.evidenceSpanId],
              supersedesClaimId : null,
              derivedFromClaimId: null,
              createdByUserId   : null,
              reviewedByUserId  : null,
              reviewNote        : null
            });
          }
        }

        let identityResolutionClaims = 0;
        if (irDrafts.length > 0) {
          const irResult = await claimService.writeClaimBatch({
            family: "IDENTITY_RESOLUTION",
            scope : {
              bookId,
              runId,
              stageKey: "stage_b_identity_resolution"
            },
            drafts: irDrafts
          });
          identityResolutionClaims = irResult.createdCount;
        }

        return {
          personaCandidates: candidateIdMap.size,
          entityMentions   : entityMentionCount,
          eventClaims      : eventClaimCount,
          relationClaims   : relationClaimCount,
          identityResolutionClaims
        };
      });
  }

  return { writeBookReviewOutput };
}
