import { z } from "zod";

const trimmedNonEmptyString = z.string().trim().min(1);
const relationDirectionSchema = z.enum(["FORWARD", "REVERSE", "BIDIRECTIONAL", "UNDIRECTED"]);
const relationTypeSourceSchema = z.enum(["PRESET", "CUSTOM", "NORMALIZED_FROM_CUSTOM"]);
const timeTypeSchema = z.enum([
  "CHAPTER_ORDER",
  "RELATIVE_PHASE",
  "NAMED_EVENT",
  "HISTORICAL_YEAR",
  "BATTLE_PHASE",
  "UNCERTAIN"
]);
const conflictTypeSchema = z.enum([
  "POSSIBLE_DUPLICATE",
  "POSSIBLE_SPLIT",
  "POST_MORTEM_ACTION",
  "IMPOSSIBLE_LOCATION",
  "RELATION_DIRECTION_CONFLICT",
  "ALIAS_CONFLICT",
  "TIME_ORDER_CONFLICT",
  "LOW_EVIDENCE_CLAIM"
]);

export const KNOWN_KNOWLEDGE_TYPES = [
  "name lexicon rule",
  "alias equivalence rule",
  "alias negative rule",
  "surname rule",
  "title rule",
  "kinship term rule",
  "official position rule",
  "historical figure reference",
  "name pattern rule",
  "relation taxonomy rule",
  "relation label mapping rule",
  "relation negative rule",
  "time normalization rule",
  "conflict escalation rule",
  "prompt extraction hint",
  "review promotion rule"
] as const;

export type KnownKnowledgeType = (typeof KNOWN_KNOWLEDGE_TYPES)[number];

const aliasTypeHintSchema = z.enum([
  "TITLE",
  "POSITION",
  "KINSHIP",
  "NICKNAME",
  "COURTESY_NAME",
  "NAMED",
  "IMPERSONATED_IDENTITY",
  "MISIDENTIFIED_AS",
  "UNSURE"
]);

const payloadRegistry = {
  "name lexicon rule": z.object({
    terms : z.array(trimmedNonEmptyString).min(1),
    bucket: z.enum(["PERSON_NAME", "TITLE_STEM", "POSITION_STEM", "HARD_BLOCK_SUFFIX", "SOFT_BLOCK_SUFFIX"]),
    note  : trimmedNonEmptyString.nullable().default(null)
  }),
  "alias equivalence rule": z.object({
    canonicalName : trimmedNonEmptyString,
    aliasTexts    : z.array(trimmedNonEmptyString).min(1),
    aliasTypeHints: z.array(aliasTypeHintSchema).default([]),
    note          : trimmedNonEmptyString.nullable().default(null)
  }),
  "alias negative rule": z.object({
    aliasText            : trimmedNonEmptyString,
    blockedCanonicalNames: z.array(trimmedNonEmptyString).min(1),
    reason               : trimmedNonEmptyString
  }),
  "surname rule": z.object({
    surname   : trimmedNonEmptyString,
    isCompound: z.boolean()
  }),
  "title rule": z.object({
    title: trimmedNonEmptyString,
    tier : z.enum(["SAFETY", "DEFAULT"])
  }),
  "kinship term rule": z.object({
    term           : trimmedNonEmptyString,
    normalizedLabel: trimmedNonEmptyString
  }),
  "official position rule": z.object({
    title          : trimmedNonEmptyString,
    normalizedLabel: trimmedNonEmptyString
  }),
  "historical figure reference": z.object({
    canonicalName: trimmedNonEmptyString,
    aliasTexts   : z.array(trimmedNonEmptyString).default([]),
    dynasty      : trimmedNonEmptyString.nullable().default(null),
    category     : trimmedNonEmptyString,
    description  : trimmedNonEmptyString.nullable().default(null)
  }),
  "name pattern rule": z.object({
    pattern    : trimmedNonEmptyString,
    action     : z.enum(["BOOST", "BLOCK"]),
    appliesTo  : z.enum(["NAME", "TITLE_ONLY", "ALIAS"]),
    description: trimmedNonEmptyString.nullable().default(null)
  }),
  "relation taxonomy rule": z.object({
    // relationTypeKey 保持开放字符串，允许预设与用户自定义关系类型共存。
    relationTypeKey   : trimmedNonEmptyString,
    displayLabel      : trimmedNonEmptyString,
    direction         : relationDirectionSchema,
    relationTypeSource: relationTypeSourceSchema,
    aliasLabels       : z.array(trimmedNonEmptyString).default([])
  }),
  "relation label mapping rule": z.object({
    relationTypeKey   : trimmedNonEmptyString,
    observedLabel     : trimmedNonEmptyString,
    normalizedLabel   : trimmedNonEmptyString,
    relationTypeSource: relationTypeSourceSchema
  }),
  "relation negative rule": z.object({
    relationTypeKey: trimmedNonEmptyString.nullable().default(null),
    blockedLabels  : z.array(trimmedNonEmptyString).min(1),
    denyDirection  : relationDirectionSchema.nullable().default(null),
    reason         : trimmedNonEmptyString
  }),
  "time normalization rule": z.object({
    rawText        : trimmedNonEmptyString,
    normalizedType : timeTypeSchema,
    normalizedLabel: trimmedNonEmptyString,
    relativeOrder  : z.number().int().nullable().default(null),
    denyInBookIds  : z.array(trimmedNonEmptyString).default([])
  }),
  "conflict escalation rule": z.object({
    conflictType     : conflictTypeSchema,
    escalateWhen     : trimmedNonEmptyString,
    recommendedAction: z.enum(["REVIEW_REQUIRED", "BLOCK_MERGE", "HARD_REJECT"])
  }),
  "prompt extraction hint": z.object({
    stageKey: trimmedNonEmptyString,
    hintType: z.enum(["ENTITY", "RELATION", "TIME", "STYLE"]),
    content : trimmedNonEmptyString,
    priority: z.number().int().default(0)
  }),
  "review promotion rule": z.object({
    claimFamily      : z.enum(["ALIAS", "EVENT", "RELATION", "TIME", "IDENTITY_RESOLUTION", "CONFLICT_FLAG"]),
    knowledgeType    : z.enum(KNOWN_KNOWLEDGE_TYPES),
    defaultScopeType : z.enum(["GLOBAL", "BOOK_TYPE", "BOOK", "RUN"]),
    targetReviewState: z.enum(["PENDING", "VERIFIED"]),
    note             : trimmedNonEmptyString.nullable().default(null)
  })
} as const satisfies Record<KnownKnowledgeType, z.ZodTypeAny>;

export function getKnowledgePayloadSchema<TType extends KnownKnowledgeType>(
  knowledgeType: TType
): (typeof payloadRegistry)[TType];
export function getKnowledgePayloadSchema(knowledgeType: string): z.ZodTypeAny;
/**
 * 统一从注册表拿 payload schema，避免写入层和运行时各自复制一份知识类型白名单。
 */
export function getKnowledgePayloadSchema(knowledgeType: string) {
  const schema = payloadRegistry[knowledgeType as KnownKnowledgeType];
  if (!schema) {
    throw new Error(`Unsupported knowledge type: ${knowledgeType}`);
  }

  return schema;
}

/**
 * 所有 KB v2 payload 都必须走注册表解析，禁止对 unknown payload 做 blind cast。
 */
export function parseKnowledgePayload<TType extends KnownKnowledgeType>(
  knowledgeType: TType,
  payload: unknown
): z.infer<(typeof payloadRegistry)[TType]> {
  return getKnowledgePayloadSchema(knowledgeType).parse(payload);
}
