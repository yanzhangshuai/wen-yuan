import { parseKnowledgePayload } from "@/server/modules/knowledge-v2/payload-schemas";
import type { ParsedKnowledgeItem } from "@/server/modules/knowledge-v2/repository";

import {
  normalizeRelationCatalogLabel,
  parseRelationCatalogEntry,
  parseRelationNormalizationSuggestion,
  type RelationCatalogEntry,
  type RelationNormalizationSuggestion
} from "@/server/modules/knowledge-v2/relation-types/contracts";
import { RELATION_TYPE_PRESETS } from "@/server/modules/knowledge-v2/relation-types/preset-registry";

const SCOPE_PRIORITY = {
  GLOBAL   : 0,
  BOOK_TYPE: 1,
  BOOK     : 2,
  RUN      : 3
} as const;

type RelationTaxonomyItem = ParsedKnowledgeItem<"relation taxonomy rule">;
type RelationLabelMappingItem = ParsedKnowledgeItem<"relation label mapping rule">;
type RelationNegativeItem = ParsedKnowledgeItem<"relation negative rule">;

export interface CompiledRelationLabelMappingRule {
  id                : string;
  reviewState       : "VERIFIED" | "PENDING";
  confidence        : number;
  relationTypeKey   : string;
  observedLabel     : string;
  normalizedLabel   : string;
  relationTypeSource: RelationCatalogEntry["relationTypeSource"];
  item              : RelationLabelMappingItem;
}

export interface CompiledRelationNegativeRule {
  id             : string;
  reviewState    : "VERIFIED" | "PENDING";
  confidence     : number;
  relationTypeKey: string | null;
  blockedLabels  : string[];
  denyDirection  : RelationCatalogEntry["direction"] | null;
  reason         : string;
  item           : RelationNegativeItem;
}

export interface RelationTypeCatalog {
  activeEntries   : RelationCatalogEntry[];
  disabledEntries : RelationCatalogEntry[];
  entriesByKey    : Record<string, RelationCatalogEntry>;
  mappingRules    : CompiledRelationLabelMappingRule[];
  negativeRules   : CompiledRelationNegativeRule[];
}

function preferCatalogEntry(
  current: RelationCatalogEntry,
  candidate: RelationCatalogEntry
): RelationCatalogEntry {
  const currentScore = SCOPE_PRIORITY[current.scopeType];
  const candidateScore = SCOPE_PRIORITY[candidate.scopeType];

  if (candidateScore !== currentScore) {
    return candidateScore > currentScore ? candidate : current;
  }

  if (candidate.reviewState === "DISABLED" && current.reviewState !== "DISABLED") {
    return candidate;
  }

  return candidate;
}

function compileRelationCatalogEntry(item: RelationTaxonomyItem): RelationCatalogEntry {
  const payload = parseKnowledgePayload(item.knowledgeType, item.payload);

  return parseRelationCatalogEntry({
    relationTypeKey   : payload.relationTypeKey,
    defaultLabel      : payload.displayLabel,
    direction         : payload.direction,
    relationTypeSource: payload.relationTypeSource,
    aliasLabels       : payload.aliasLabels,
    scopeType         : item.scopeType,
    scopeId           : item.scopeId,
    reviewState       : item.reviewState,
    systemPreset      : item.source === "SYSTEM_PRESET",
    enabled           : item.reviewState !== "DISABLED",
    knowledgeItemId   : item.id
  });
}

function toSuggestionReviewState(
  reviewState: RelationCatalogEntry["reviewState"]
): RelationNormalizationSuggestion["reviewState"] | null {
  return reviewState === "VERIFIED" || reviewState === "PENDING"
    ? reviewState
    : null;
}

function compileRelationLabelMappingRule(
  item: RelationLabelMappingItem
): CompiledRelationLabelMappingRule | null {
  const reviewState = toSuggestionReviewState(item.reviewState);
  if (reviewState === null) {
    return null;
  }

  const payload = parseKnowledgePayload(item.knowledgeType, item.payload);

  return {
    id                : item.id,
    reviewState,
    confidence        : item.confidence ?? 0.55,
    relationTypeKey   : payload.relationTypeKey,
    observedLabel     : payload.observedLabel,
    normalizedLabel   : payload.normalizedLabel,
    relationTypeSource: payload.relationTypeSource,
    item
  };
}

function compileRelationNegativeRule(
  item: RelationNegativeItem
): CompiledRelationNegativeRule | null {
  const reviewState = toSuggestionReviewState(item.reviewState);
  if (reviewState === null) {
    return null;
  }

  const payload = parseKnowledgePayload(item.knowledgeType, item.payload);

  return {
    id             : item.id,
    reviewState,
    confidence     : item.confidence ?? 0.55,
    relationTypeKey: payload.relationTypeKey,
    blockedLabels  : payload.blockedLabels,
    denyDirection  : payload.denyDirection,
    reason         : payload.reason,
    item
  };
}

export function buildRelationTypeCatalog(input: {
  items: ParsedKnowledgeItem[];
  presets?: readonly RelationCatalogEntry[];
}): RelationTypeCatalog {
  const presets = input.presets ?? RELATION_TYPE_PRESETS;
  const entriesByKey: Record<string, RelationCatalogEntry> = Object.fromEntries(
    presets.map((entry) => [entry.relationTypeKey, parseRelationCatalogEntry(entry)])
  );

  const mappingRules: CompiledRelationLabelMappingRule[] = [];
  const negativeRules: CompiledRelationNegativeRule[] = [];

  for (const item of input.items) {
    if (item.knowledgeType === "relation taxonomy rule") {
      const compiled = compileRelationCatalogEntry(item);
      const previous = entriesByKey[compiled.relationTypeKey];

      entriesByKey[compiled.relationTypeKey] = previous
        ? preferCatalogEntry(previous, compiled)
        : compiled;
      continue;
    }

    if (item.knowledgeType === "relation label mapping rule") {
      const compiled = compileRelationLabelMappingRule(item);
      if (compiled) {
        mappingRules.push(compiled);
      }
      continue;
    }

    if (item.knowledgeType === "relation negative rule") {
      const compiled = compileRelationNegativeRule(item);
      if (compiled) {
        negativeRules.push(compiled);
      }
    }
  }

  const allEntries = Object.values(entriesByKey);

  return {
    activeEntries   : allEntries.filter((entry) => entry.enabled),
    disabledEntries : allEntries.filter((entry) => !entry.enabled),
    entriesByKey,
    mappingRules,
    negativeRules
  };
}

export function suggestRelationTypeByLabel(input: {
  catalog      : RelationTypeCatalog;
  relationLabel: string;
  direction    : RelationCatalogEntry["direction"];
}): RelationNormalizationSuggestion | null {
  const normalizedLabel = normalizeRelationCatalogLabel(input.relationLabel);

  for (const item of input.catalog.mappingRules) {
    if (normalizeRelationCatalogLabel(item.observedLabel) !== normalizedLabel) {
      continue;
    }

    const targetEntry = input.catalog.entriesByKey[item.relationTypeKey];
    if (targetEntry && !targetEntry.enabled) {
      continue;
    }

    return parseRelationNormalizationSuggestion({
      relationTypeKey   : item.relationTypeKey,
      matchedLabel      : item.observedLabel,
      normalizedLabel   : item.normalizedLabel,
      direction         : targetEntry?.direction ?? input.direction,
      relationTypeSource: item.relationTypeSource,
      confidence        : item.confidence,
      reviewState       : item.reviewState,
      knowledgeItemId   : item.id
    });
  }

  for (const entry of input.catalog.activeEntries) {
    const labels = [entry.defaultLabel, ...entry.aliasLabels].map(normalizeRelationCatalogLabel);
    if (!labels.includes(normalizedLabel)) {
      continue;
    }

    const reviewState = toSuggestionReviewState(entry.reviewState);
    if (reviewState === null) {
      continue;
    }

    return parseRelationNormalizationSuggestion({
      relationTypeKey   : entry.relationTypeKey,
      matchedLabel      : input.relationLabel,
      normalizedLabel   : entry.defaultLabel,
      direction         : entry.direction,
      relationTypeSource: entry.relationTypeSource,
      confidence        : entry.reviewState === "VERIFIED" ? 0.9 : 0.55,
      reviewState,
      knowledgeItemId   : entry.knowledgeItemId
    });
  }

  return null;
}

export function findRelationNegativeRule(input: {
  catalog      : RelationTypeCatalog;
  relationLabel: string;
  direction    : RelationCatalogEntry["direction"];
}): CompiledRelationNegativeRule | null {
  const normalizedLabel = normalizeRelationCatalogLabel(input.relationLabel);

  return input.catalog.negativeRules.find((item) => {
    return item.blockedLabels.some(
      (label) => normalizeRelationCatalogLabel(label) === normalizedLabel
    ) && (item.denyDirection === null || item.denyDirection === input.direction);
  }) ?? null;
}
