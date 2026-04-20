import { AliasType } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import {
  findOrCreateEvidenceSpan,
  validateEvidenceSpanDraft,
  type EvidenceSpanFindOrCreateClient,
  type EvidenceSpanRow,
  type MaterializedEvidenceSpanData
} from "@/server/modules/analysis/evidence/evidence-spans";
import {
  buildOffsetMap,
  mapNormalizedRangeToOriginalRange,
  normalizeTextForEvidence
} from "@/server/modules/analysis/evidence/offset-map";
import { validateClaimDraftByFamily } from "@/server/modules/analysis/claims/claim-schemas";
import type { PersistedStage0Segment } from "@/server/modules/analysis/pipelines/evidence-review/stage0/repository";
import {
  reviewNoteForKnowledge,
  STAGE_A_PLUS_CONFIDENCE,
  type StageAPlusCompiledAliasEquivalenceRule,
  type StageAPlusCompiledKnowledge,
  type StageAPlusCompiledTermRule,
  type StageAPlusDiscardRecord,
  type StageAPlusRecallKind,
  type StageAPlusRecallOutput
} from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/types";

function aliasTypeToClaimKind(aliasType: string): "ALIAS_OF" | "COURTESY_NAME_OF" | "TITLE_OF" | "KINSHIP_REFERENCE_TO" | "IMPERSONATES" | "MISIDENTIFIED_AS" | "UNSURE" {
  if (aliasType === "COURTESY_NAME") return "COURTESY_NAME_OF";
  if (aliasType === "TITLE" || aliasType === "POSITION") return "TITLE_OF";
  if (aliasType === "KINSHIP") return "KINSHIP_REFERENCE_TO";
  if (aliasType === "IMPERSONATED_IDENTITY") return "IMPERSONATES";
  if (aliasType === "MISIDENTIFIED_AS") return "MISIDENTIFIED_AS";
  if (aliasType === "UNSURE") return "UNSURE";

  return "ALIAS_OF";
}

function aliasTypeToMentionKind(aliasType: string): "NAMED" | "TITLE_ONLY" | "COURTESY_NAME" | "KINSHIP" | "UNKNOWN" {
  if (aliasType === "TITLE" || aliasType === "POSITION") return "TITLE_ONLY";
  if (aliasType === "COURTESY_NAME") return "COURTESY_NAME";
  if (aliasType === "KINSHIP") return "KINSHIP";
  if (aliasType === "UNSURE") return "UNKNOWN";

  return "NAMED";
}

function primaryAliasType(rule: StageAPlusCompiledAliasEquivalenceRule): AliasType {
  const [hint] = rule.aliasTypeHints;
  return AliasType[hint as keyof typeof AliasType] ?? AliasType.UNSURE;
}

function buildDiscard(
  kind: StageAPlusRecallKind,
  ref: string,
  code: StageAPlusDiscardRecord["code"],
  message: string
): StageAPlusDiscardRecord {
  return { kind, ref, code, message };
}

function findUniqueQuoteRangeInSegment(
  segmentText: string,
  quotedText: string
): { startOffset: number; endOffset: number } | "NOT_FOUND" | "NOT_UNIQUE" {
  const map = buildOffsetMap(segmentText);
  const normalizedNeedle = normalizeTextForEvidence(quotedText);

  if (normalizedNeedle.length === 0) {
    return "NOT_FOUND";
  }

  const matches: Array<{ startOffset: number; endOffset: number }> = [];
  let fromIndex = 0;

  while (fromIndex <= map.normalizedText.length - normalizedNeedle.length) {
    const normalizedStart = map.normalizedText.indexOf(normalizedNeedle, fromIndex);
    if (normalizedStart < 0) {
      break;
    }

    matches.push(
      mapNormalizedRangeToOriginalRange(
        map,
        normalizedStart,
        normalizedStart + normalizedNeedle.length
      )
    );

    fromIndex = normalizedStart + 1;
  }

  if (matches.length === 0) {
    return "NOT_FOUND";
  }

  if (matches.length > 1) {
    return "NOT_UNIQUE";
  }

  return matches[0];
}

function createEvidenceAnchor(segment: PersistedStage0Segment) {
  return {
    id            : segment.id,
    bookId        : segment.bookId,
    chapterId     : segment.chapterId,
    segmentType   : segment.segmentType,
    startOffset   : segment.startOffset,
    endOffset     : segment.endOffset,
    text          : segment.rawText,
    normalizedText: segment.normalizedText,
    speakerHint   : segment.speakerHint
  };
}

function isComposedSurnameTermRule(
  rule: StageAPlusCompiledTermRule
): boolean {
  return (
    rule.aliasTypeHint === "TITLE"
    || rule.aliasTypeHint === "POSITION"
    || rule.aliasTypeHint === "KINSHIP"
  );
}

export interface StageAPlusEvidenceResolver {
  findOrCreate(data: MaterializedEvidenceSpanData): Promise<EvidenceSpanRow>;
}

export interface StageAPlusRuleRecallDependencies {
  evidenceResolver?: StageAPlusEvidenceResolver;
}

export function createStageAPlusEvidenceResolver(
  client: EvidenceSpanFindOrCreateClient = prisma
): StageAPlusEvidenceResolver {
  return {
    findOrCreate: async (data) => findOrCreateEvidenceSpan(client, data)
  };
}

export function createStageAPlusRuleRecall(
  dependencies: StageAPlusRuleRecallDependencies = {}
) {
  const evidenceResolver = dependencies.evidenceResolver ?? createStageAPlusEvidenceResolver();

  async function recallChapterClaims(input: {
    bookId     : string;
    chapterId  : string;
    chapterNo  : number;
    runId      : string;
    chapterText: string;
    segments   : PersistedStage0Segment[];
    knowledge  : StageAPlusCompiledKnowledge;
  }): Promise<StageAPlusRecallOutput> {
    const output: StageAPlusRecallOutput = {
      mentionDrafts   : [],
      aliasDrafts     : [],
      relationDrafts  : [],
      discardRecords  : [],
      knowledgeItemIds: []
    };
    const seen = new Set<string>();
    const knowledgeIdsSeen = new Set<string>();

    function recordKnowledgeId(knowledgeId: string): void {
      if (knowledgeIdsSeen.has(knowledgeId)) {
        return;
      }

      knowledgeIdsSeen.add(knowledgeId);
      output.knowledgeItemIds.push(knowledgeId);
    }

    async function evidenceForTerm(
      kind: StageAPlusRecallKind,
      term: string,
      ref: string
    ): Promise<string | null> {
      const matches: Array<{
        segment: PersistedStage0Segment;
        range  : { startOffset: number; endOffset: number };
      }> = [];
      let hasAmbiguousMatch = false;

      for (const segment of input.segments) {
        const range = findUniqueQuoteRangeInSegment(segment.rawText, term);
        if (range === "NOT_FOUND") {
          continue;
        }

        if (range === "NOT_UNIQUE") {
          hasAmbiguousMatch = true;
          continue;
        }

        matches.push({ segment, range });
      }

      if (hasAmbiguousMatch || matches.length > 1) {
        output.discardRecords.push(
          buildDiscard(
            kind,
            ref,
            "QUOTE_NOT_UNIQUE",
            `term evidence is not unique in chapter ${input.chapterNo}: ${term}`
          )
        );
        return null;
      }

      const [match] = matches;
      if (!match) {
        return null;
      }

      try {
        const materialized = validateEvidenceSpanDraft({
          chapterText: input.chapterText,
          segment    : createEvidenceAnchor(match.segment),
          draft      : {
            bookId             : input.bookId,
            chapterId          : input.chapterId,
            segmentId          : match.segment.id,
            startOffset        : match.segment.startOffset + match.range.startOffset,
            endOffset          : match.segment.startOffset + match.range.endOffset,
            expectedText       : term,
            speakerHint        : match.segment.speakerHint,
            narrativeRegionType: match.segment.segmentType,
            createdByRunId     : input.runId
          }
        });
        const evidence = await evidenceResolver.findOrCreate(materialized);
        return evidence.id;
      } catch (error) {
        output.discardRecords.push(
          buildDiscard(
            kind,
            ref,
            "EVIDENCE_VALIDATION_FAILED",
            error instanceof Error ? error.message : String(error)
          )
        );
        return null;
      }
    }

    async function addMention(
      term: string,
      rule: { id: string; reviewState: "VERIFIED" | "PENDING"; confidence: number },
      aliasType: AliasType
    ): Promise<void> {
      const key = `mention:${term}`;
      if (seen.has(key)) {
        return;
      }

      seen.add(key);

      const evidenceSpanId = await evidenceForTerm("MENTION", term, `mention:${term}`);
      if (!evidenceSpanId) {
        return;
      }

      output.mentionDrafts.push(
        validateClaimDraftByFamily("ENTITY_MENTION", {
          claimFamily              : "ENTITY_MENTION",
          bookId                   : input.bookId,
          chapterId                : input.chapterId,
          runId                    : input.runId,
          source                   : "RULE",
          confidence               : rule.confidence,
          surfaceText              : term,
          mentionKind              : aliasTypeToMentionKind(aliasType),
          identityClaim            : null,
          aliasTypeHint            : aliasType,
          speakerPersonaCandidateId: null,
          suspectedResolvesTo      : null,
          evidenceSpanId
        })
      );
      recordKnowledgeId(rule.id);
    }

    async function addAlias(
      term: string,
      rule: StageAPlusCompiledAliasEquivalenceRule
    ): Promise<void> {
      const key = `alias:${rule.id}:${term}`;
      if (seen.has(key)) {
        return;
      }

      seen.add(key);

      const evidenceSpanId = await evidenceForTerm("ALIAS", term, `alias:${rule.id}:${term}`);
      if (!evidenceSpanId) {
        return;
      }

      const aliasType = primaryAliasType(rule);
      output.aliasDrafts.push(
        validateClaimDraftByFamily("ALIAS", {
          claimFamily     : "ALIAS",
          bookId          : input.bookId,
          chapterId       : input.chapterId,
          runId           : input.runId,
          source          : "RULE",
          reviewState     : "PENDING",
          createdByUserId : null,
          reviewedByUserId: null,
          reviewNote      : rule.reviewState === "PENDING"
            ? reviewNoteForKnowledge(
              "KB_PENDING_HINT",
              rule.id,
              `aliasText=${term}; canonicalName=${rule.canonicalName}`
            )
            : reviewNoteForKnowledge(
              "KB_VERIFIED",
              rule.id,
              `aliasText=${term}; canonicalName=${rule.canonicalName}`
            ),
          supersedesClaimId       : null,
          derivedFromClaimId      : null,
          evidenceSpanIds         : [evidenceSpanId],
          confidence              : rule.confidence,
          aliasText               : term,
          aliasType,
          personaCandidateId      : null,
          targetPersonaCandidateId: null,
          claimKind               : aliasTypeToClaimKind(aliasType)
        })
      );
      recordKnowledgeId(rule.id);
    }

    for (const rule of input.knowledge.aliasEquivalenceRules) {
      const aliasType = primaryAliasType(rule);
      for (const term of [rule.canonicalName, ...rule.aliasTexts]) {
        await addMention(term, rule, aliasType);
        await addAlias(term, rule);
      }
    }

    for (const surname of input.knowledge.surnameRules) {
      for (const termRule of input.knowledge.termRules) {
        if (!isComposedSurnameTermRule(termRule)) {
          continue;
        }

        const surfaceText = `${surname.term}${termRule.term}`;
        await addMention(
          surfaceText,
          termRule,
          AliasType[termRule.aliasTypeHint] ?? AliasType.UNSURE
        );
      }
    }

    for (const rule of input.knowledge.termRules) {
      await addMention(rule.term, rule, AliasType[rule.aliasTypeHint] ?? AliasType.UNSURE);
    }

    for (const rule of input.knowledge.aliasNegativeRules) {
      const evidenceSpanId = await evidenceForTerm(
        "ALIAS",
        rule.aliasText,
        `alias-negative:${rule.id}`
      );
      if (!evidenceSpanId) {
        continue;
      }

      output.aliasDrafts.push(
        validateClaimDraftByFamily("ALIAS", {
          claimFamily     : "ALIAS",
          bookId          : input.bookId,
          chapterId       : input.chapterId,
          runId           : input.runId,
          source          : "RULE",
          reviewState     : "CONFLICTED",
          createdByUserId : null,
          reviewedByUserId: null,
          reviewNote      : reviewNoteForKnowledge(
            "KB_ALIAS_NEGATIVE",
            rule.id,
            `aliasText=${rule.aliasText}; blockedCanonicalNames=${rule.blockedCanonicalNames.join("|")}; reason=${rule.reason}`
          ),
          supersedesClaimId : null,
          derivedFromClaimId: null,
          evidenceSpanIds   : [evidenceSpanId],
          confidence        : Math.max(
            rule.confidence,
            STAGE_A_PLUS_CONFIDENCE.NEGATIVE_KB
          ),
          aliasText               : rule.aliasText,
          aliasType               : "UNSURE",
          personaCandidateId      : null,
          targetPersonaCandidateId: null,
          claimKind               : "UNSURE"
        })
      );
      recordKnowledgeId(rule.id);
    }

    return output;
  }

  return { recallChapterClaims };
}

export type StageAPlusRuleRecall = ReturnType<typeof createStageAPlusRuleRecall>;
