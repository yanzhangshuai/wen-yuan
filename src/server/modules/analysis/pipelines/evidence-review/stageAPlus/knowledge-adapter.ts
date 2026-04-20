import type { RuntimeKnowledgeBundle, RuntimeKnowledgeItem } from "@/server/modules/knowledge-v2/runtime-loader";
import { parseKnowledgePayload } from "@/server/modules/knowledge-v2/payload-schemas";
import {
  STAGE_A_PLUS_CONFIDENCE,
  type StageAPlusCompiledAliasEquivalenceRule,
  type StageAPlusCompiledAliasNegativeRule,
  type StageAPlusCompiledKnowledge,
  type StageAPlusCompiledKnowledgeBase,
  type StageAPlusCompiledRelationMappingRule,
  type StageAPlusCompiledRelationNegativeRule,
  type StageAPlusCompiledRelationTaxonomyRule,
  type StageAPlusCompiledTermRule,
  type StageAPlusKnowledgeReviewState
} from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/types";

function allRuntimeItems(bundle: RuntimeKnowledgeBundle): RuntimeKnowledgeItem[] {
  return [...bundle.verifiedItems, ...bundle.pendingItems];
}

function toReviewState(item: RuntimeKnowledgeItem): StageAPlusKnowledgeReviewState | null {
  if (item.reviewState === "VERIFIED" || item.reviewState === "PENDING") {
    return item.reviewState;
  }

  return null;
}

function cappedConfidence(item: RuntimeKnowledgeItem): number {
  const reviewState = toReviewState(item);
  const base = item.confidence ?? (
    reviewState === "PENDING"
      ? STAGE_A_PLUS_CONFIDENCE.PENDING_KB
      : STAGE_A_PLUS_CONFIDENCE.VERIFIED_KB
  );

  if (reviewState === "PENDING") {
    return Math.min(base, STAGE_A_PLUS_CONFIDENCE.PENDING_KB);
  }

  return Math.max(base, STAGE_A_PLUS_CONFIDENCE.VERIFIED_KB);
}

function base(item: RuntimeKnowledgeItem): StageAPlusCompiledKnowledgeBase | null {
  const reviewState = toReviewState(item);
  if (!reviewState) {
    return null;
  }

  return {
    id        : item.id,
    reviewState,
    confidence: cappedConfidence(item),
    item
  };
}

function compileTermRule(item: RuntimeKnowledgeItem): StageAPlusCompiledTermRule | null {
  const baseRule = base(item);
  if (!baseRule) {
    return null;
  }

  if (item.knowledgeType === "surname rule") {
    const payload = parseKnowledgePayload(item.knowledgeType, item.payload);
    return {
      ...baseRule,
      term           : payload.surname,
      normalizedLabel: payload.surname,
      aliasTypeHint  : "NAMED",
      mentionKind    : "NAMED"
    };
  }

  if (item.knowledgeType === "title rule") {
    const payload = parseKnowledgePayload(item.knowledgeType, item.payload);
    return {
      ...baseRule,
      term           : payload.title,
      normalizedLabel: payload.title,
      aliasTypeHint  : "TITLE",
      mentionKind    : "TITLE_ONLY"
    };
  }

  if (item.knowledgeType === "kinship term rule") {
    const payload = parseKnowledgePayload(item.knowledgeType, item.payload);
    return {
      ...baseRule,
      term           : payload.term,
      normalizedLabel: payload.normalizedLabel,
      aliasTypeHint  : "KINSHIP",
      mentionKind    : "KINSHIP"
    };
  }

  if (item.knowledgeType === "official position rule") {
    const payload = parseKnowledgePayload(item.knowledgeType, item.payload);
    return {
      ...baseRule,
      term           : payload.title,
      normalizedLabel: payload.normalizedLabel,
      aliasTypeHint  : "POSITION",
      mentionKind    : "TITLE_ONLY"
    };
  }

  return null;
}

export function compileStageAPlusKnowledge(
  bundle: RuntimeKnowledgeBundle
): StageAPlusCompiledKnowledge {
  const compiled: StageAPlusCompiledKnowledge = {
    aliasEquivalenceRules: [],
    aliasNegativeRules   : [],
    termRules            : [],
    surnameRules         : [],
    relationMappings     : [],
    relationTaxonomyRules: [],
    relationNegativeRules: []
  };

  for (const item of allRuntimeItems(bundle)) {
    const baseRule = base(item);
    if (!baseRule) {
      continue;
    }

    if (item.knowledgeType === "alias equivalence rule") {
      const payload = parseKnowledgePayload(item.knowledgeType, item.payload);
      compiled.aliasEquivalenceRules.push({
        ...baseRule,
        canonicalName : payload.canonicalName,
        aliasTexts    : payload.aliasTexts,
        aliasTypeHints: payload.aliasTypeHints,
        note          : payload.note
      } satisfies StageAPlusCompiledAliasEquivalenceRule);
      continue;
    }

    if (item.knowledgeType === "alias negative rule") {
      const payload = parseKnowledgePayload(item.knowledgeType, item.payload);
      compiled.aliasNegativeRules.push({
        ...baseRule,
        aliasText            : payload.aliasText,
        blockedCanonicalNames: payload.blockedCanonicalNames,
        reason               : payload.reason
      } satisfies StageAPlusCompiledAliasNegativeRule);
      continue;
    }

    const termRule = compileTermRule(item);
    if (termRule) {
      if (item.knowledgeType === "surname rule") {
        compiled.surnameRules.push(termRule);
      } else {
        compiled.termRules.push(termRule);
      }
      continue;
    }

    if (item.knowledgeType === "relation label mapping rule") {
      const payload = parseKnowledgePayload(item.knowledgeType, item.payload);
      compiled.relationMappings.push({
        ...baseRule,
        relationTypeKey   : payload.relationTypeKey,
        observedLabel     : payload.observedLabel,
        normalizedLabel   : payload.normalizedLabel,
        relationTypeSource: payload.relationTypeSource
      } satisfies StageAPlusCompiledRelationMappingRule);
      continue;
    }

    if (item.knowledgeType === "relation taxonomy rule") {
      const payload = parseKnowledgePayload(item.knowledgeType, item.payload);
      compiled.relationTaxonomyRules.push({
        ...baseRule,
        relationTypeKey   : payload.relationTypeKey,
        displayLabel      : payload.displayLabel,
        direction         : payload.direction,
        relationTypeSource: payload.relationTypeSource,
        aliasLabels       : payload.aliasLabels
      } satisfies StageAPlusCompiledRelationTaxonomyRule);
      continue;
    }

    if (item.knowledgeType === "relation negative rule") {
      const payload = parseKnowledgePayload(item.knowledgeType, item.payload);
      compiled.relationNegativeRules.push({
        ...baseRule,
        relationTypeKey: payload.relationTypeKey,
        blockedLabels  : payload.blockedLabels,
        denyDirection  : payload.denyDirection,
        reason         : payload.reason
      } satisfies StageAPlusCompiledRelationNegativeRule);
    }
  }

  return compiled;
}
