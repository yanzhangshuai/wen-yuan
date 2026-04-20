import { z } from "zod";

import {
  knowledgeReviewStateSchema,
  knowledgeScopeTypeSchema,
  type KnowledgeReviewState,
  type KnowledgeScopeType
} from "@/server/modules/knowledge-v2/base-types";
import {
  relationDirectionSchema,
  relationTypeSourceSchema,
  type RelationDirection,
  type RelationTypeSource
} from "@/server/modules/analysis/claims/base-types";

const trimmedNonEmptyString = z.string().trim().min(1);

export const relationCatalogEntrySchema = z.object({
  relationTypeKey   : trimmedNonEmptyString,
  defaultLabel      : trimmedNonEmptyString,
  direction         : relationDirectionSchema,
  relationTypeSource: relationTypeSourceSchema,
  aliasLabels       : z.array(trimmedNonEmptyString).default([]),
  scopeType         : knowledgeScopeTypeSchema,
  scopeId           : trimmedNonEmptyString.nullable().default(null),
  reviewState       : knowledgeReviewStateSchema,
  systemPreset      : z.boolean(),
  enabled           : z.boolean(),
  knowledgeItemId   : trimmedNonEmptyString.nullable().default(null)
}).superRefine((value, ctx) => {
  if (value.scopeType === "GLOBAL" && value.scopeId !== null) {
    ctx.addIssue({
      code   : "custom",
      path   : ["scopeId"],
      message: "GLOBAL scope must not define scopeId"
    });
  }

  if (value.scopeType !== "GLOBAL" && value.scopeId === null) {
    ctx.addIssue({
      code   : "custom",
      path   : ["scopeId"],
      message: `${value.scopeType} scope requires scopeId`
    });
  }
});

export const relationNormalizationSuggestionSchema = z.object({
  relationTypeKey   : trimmedNonEmptyString,
  matchedLabel      : trimmedNonEmptyString,
  normalizedLabel   : trimmedNonEmptyString,
  direction         : relationDirectionSchema,
  relationTypeSource: relationTypeSourceSchema,
  confidence        : z.number().min(0).max(1),
  reviewState       : z.union([z.literal("VERIFIED"), z.literal("PENDING")]),
  knowledgeItemId   : trimmedNonEmptyString.nullable().default(null)
});

export type RelationCatalogEntry = z.infer<typeof relationCatalogEntrySchema>;
export type RelationNormalizationSuggestion = z.infer<typeof relationNormalizationSuggestionSchema>;
export type RelationCatalogVisibilityReviewState = Extract<
  KnowledgeReviewState,
  "VERIFIED" | "PENDING" | "DISABLED"
>;
export type RelationCatalogScopeType = KnowledgeScopeType;
export type RelationCatalogDirection = RelationDirection;
export type RelationCatalogTypeSource = RelationTypeSource;

export function parseRelationCatalogEntry(input: unknown): RelationCatalogEntry {
  return relationCatalogEntrySchema.parse(input);
}

export function parseRelationNormalizationSuggestion(
  input: unknown
): RelationNormalizationSuggestion {
  return relationNormalizationSuggestionSchema.parse(input);
}

export function normalizeRelationTypeKey(value: string): string {
  return value.trim();
}

export function normalizeRelationCatalogLabel(value: string): string {
  return value.trim();
}
