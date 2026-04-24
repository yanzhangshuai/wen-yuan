import { z } from "zod";

import { PROJECTION_FAMILY_VALUES } from "@/server/modules/review/evidence-review/projections/types";
import { RELATION_DIRECTION_VALUES } from "@/server/modules/review/evidence-review/review-state";

export const REVIEW_REGRESSION_ACTION_VALUES = Object.freeze([
  "ACCEPT_CLAIM",
  "REJECT_CLAIM",
  "DEFER_CLAIM",
  "EDIT_CLAIM",
  "CREATE_MANUAL_CLAIM",
  "RELINK_EVIDENCE",
  "MERGE_PERSONA",
  "SPLIT_PERSONA"
] as const);

export const REVIEW_REGRESSION_CLAIM_KIND_VALUES = Object.freeze([
  "EVENT",
  "RELATION",
  "TIME",
  "IDENTITY"
] as const);

export const REVIEW_REGRESSION_IDENTITY_PRESSURE_VALUES = Object.freeze([
  "IDENTITY_CONFUSION",
  "MISIDENTIFICATION"
] as const);

export const REVIEW_REGRESSION_SNAPSHOT_MODE_VALUES = Object.freeze([
  "CURRENT_REVIEW",
  "RUN_SCOPED"
] as const);

const NATURAL_KEY_SEPARATOR = "\u001f";
const slugSafeKeySchema = z.string().trim().min(1).max(120).regex(/^[a-z0-9][a-z0-9-]*$/);
const naturalKeyPartSchema = z.string().trim().min(1).max(240);
const evidenceSnippetSchema = z.string()
  .transform((value) => normalizeReviewRegressionSnippet(value))
  .pipe(z.string().min(1).max(500));
const evidenceSnippetsSchema = z.array(evidenceSnippetSchema).min(1);
const chapterNoSchema = z.number().int().positive();
const nullableChapterNoSchema = chapterNoSchema.nullable();
const percentageSchema = z.number().min(0).max(100).nullable();

export function normalizeReviewRegressionSnippet(snippet: string): string {
  return snippet.replace(/\s+/g, " ").trim();
}

const chapterRangeSchema = z.object({
  startNo: chapterNoSchema,
  endNo  : chapterNoSchema
}).strict().superRefine((range, ctx) => {
  if (range.endNo < range.startNo) {
    ctx.addIssue({
      code   : z.ZodIssueCode.custom,
      path   : ["endNo"],
      message: "chapterRange.endNo must be greater than or equal to startNo"
    });
  }
});

export const reviewRegressionIdentityPressureCaseSchema = z.object({
  caseKey                : slugSafeKeySchema,
  pressureType           : z.enum(REVIEW_REGRESSION_IDENTITY_PRESSURE_VALUES),
  confusedWithPersonaName: naturalKeyPartSchema,
  chapterNo              : chapterNoSchema,
  evidenceSnippet        : evidenceSnippetSchema,
  expectedResolution     : z.string().trim().min(1).max(500).optional()
}).strict();

export const reviewRegressionPersonaExpectationSchema = z.object({
  personaName     : naturalKeyPartSchema,
  aliases         : z.array(naturalKeyPartSchema).default([]),
  chapterNos      : z.array(chapterNoSchema).min(1),
  evidenceSnippets: evidenceSnippetsSchema,
  pressureCases   : z.array(reviewRegressionIdentityPressureCaseSchema).default([])
}).strict();

export const reviewRegressionChapterFactExpectationSchema = z.object({
  personaName     : naturalKeyPartSchema,
  chapterNo       : chapterNoSchema,
  factLabel       : naturalKeyPartSchema,
  expectedValue   : z.string().trim().min(1).max(500).optional(),
  evidenceSnippets: evidenceSnippetsSchema
}).strict();

export const reviewRegressionRelationExpectationSchema = z.object({
  sourcePersonaName    : naturalKeyPartSchema,
  targetPersonaName    : naturalKeyPartSchema,
  relationTypeKey      : naturalKeyPartSchema,
  relationLabel        : z.string().trim().min(1).max(120).optional(),
  direction            : z.enum(RELATION_DIRECTION_VALUES),
  effectiveChapterStart: nullableChapterNoSchema,
  effectiveChapterEnd  : nullableChapterNoSchema,
  evidenceSnippets     : evidenceSnippetsSchema
}).strict();

export const reviewRegressionTimeExpectationSchema = z.object({
  personaName      : naturalKeyPartSchema,
  rawTimeText      : z.string().trim().min(1).max(240).optional(),
  normalizedLabel  : naturalKeyPartSchema,
  timeSortKey      : z.number().int().nullable(),
  chapterRangeStart: nullableChapterNoSchema,
  chapterRangeEnd  : nullableChapterNoSchema,
  isImprecise      : z.boolean().default(false),
  evidenceSnippets : evidenceSnippetsSchema
}).strict();

const reviewRegressionActionTargetSchema = z.object({
  claimKind  : z.enum(REVIEW_REGRESSION_CLAIM_KIND_VALUES).optional(),
  chapterNo  : chapterNoSchema.optional(),
  personaName: naturalKeyPartSchema.optional(),
  pair       : z.object({
    sourcePersonaName: naturalKeyPartSchema,
    targetPersonaName: naturalKeyPartSchema,
    relationTypeKey  : naturalKeyPartSchema.optional()
  }).strict().optional(),
  evidenceSnippet: evidenceSnippetSchema.optional()
}).strict().superRefine((target, ctx) => {
  const hasTargetSelector =
    target.claimKind !== undefined
    || target.chapterNo !== undefined
    || target.personaName !== undefined
    || target.pair !== undefined
    || target.evidenceSnippet !== undefined;

  if (!hasTargetSelector) {
    ctx.addIssue({
      code   : z.ZodIssueCode.custom,
      message: "review action target must include at least one natural-key selector"
    });
  }
});

export const reviewRegressionActionScenarioSchema = z.object({
  scenarioKey: slugSafeKeySchema,
  action     : z.enum(REVIEW_REGRESSION_ACTION_VALUES),
  target     : reviewRegressionActionTargetSchema,
  expected   : z.object({
    auditAction       : z.string().trim().min(1).max(120),
    projectionFamilies: z.array(z.enum(PROJECTION_FAMILY_VALUES)).min(1)
  }).strict()
}).strict().superRefine((scenario, ctx) => {
  if (
    (scenario.action === "MERGE_PERSONA" || scenario.action === "SPLIT_PERSONA")
    && scenario.target.pair === undefined
  ) {
    ctx.addIssue({
      code   : z.ZodIssueCode.custom,
      path   : ["target", "pair"],
      message: `${scenario.action} scenarios must provide target.pair`
    });
  }
});

export const reviewRegressionRerunSampleSchema = z.object({
  sampleKey              : slugSafeKeySchema,
  reason                 : z.string().trim().min(1).max(500),
  changedChapterNos      : z.array(chapterNoSchema).min(1),
  expectedStableKeys     : z.array(naturalKeyPartSchema).default([]),
  expectedChangedKeys    : z.array(naturalKeyPartSchema).default([]),
  comparisonFriendlyLabel: z.string().trim().min(1).max(240).optional(),
  evidenceSnippets       : evidenceSnippetsSchema
}).strict();

export const reviewRegressionFixtureSchema = z.object({
  fixtureKey   : slugSafeKeySchema,
  bookTitle    : naturalKeyPartSchema,
  bookAuthor   : naturalKeyPartSchema.optional(),
  chapterRange : chapterRangeSchema,
  personas     : z.array(reviewRegressionPersonaExpectationSchema),
  chapterFacts : z.array(reviewRegressionChapterFactExpectationSchema),
  relations    : z.array(reviewRegressionRelationExpectationSchema),
  timeFacts    : z.array(reviewRegressionTimeExpectationSchema),
  reviewActions: z.array(reviewRegressionActionScenarioSchema),
  rerunSamples : z.array(reviewRegressionRerunSampleSchema).default([])
}).strict();

const snapshotPersonaSchema = z.object({
  personaName: naturalKeyPartSchema,
  aliases    : z.array(naturalKeyPartSchema)
}).strict();

const snapshotChapterFactSchema = z.object({
  personaName     : naturalKeyPartSchema,
  chapterNo       : chapterNoSchema,
  factLabel       : naturalKeyPartSchema,
  evidenceSnippets: z.array(evidenceSnippetSchema)
}).strict();

const snapshotRelationSchema = z.object({
  sourcePersonaName    : naturalKeyPartSchema,
  targetPersonaName    : naturalKeyPartSchema,
  relationTypeKey      : naturalKeyPartSchema,
  direction            : z.enum(RELATION_DIRECTION_VALUES),
  effectiveChapterStart: nullableChapterNoSchema,
  effectiveChapterEnd  : nullableChapterNoSchema,
  evidenceSnippets     : z.array(evidenceSnippetSchema)
}).strict();

const snapshotTimeFactSchema = z.object({
  personaName      : naturalKeyPartSchema,
  normalizedLabel  : naturalKeyPartSchema,
  timeSortKey      : z.number().int().nullable(),
  chapterRangeStart: nullableChapterNoSchema,
  chapterRangeEnd  : nullableChapterNoSchema,
  evidenceSnippets : z.array(evidenceSnippetSchema)
}).strict();

export const reviewRegressionSnapshotSchema = z.object({
  fixtureKey  : slugSafeKeySchema,
  bookTitle   : naturalKeyPartSchema,
  chapterRange: chapterRangeSchema,
  personas    : z.array(snapshotPersonaSchema),
  chapterFacts: z.array(snapshotChapterFactSchema),
  relations   : z.array(snapshotRelationSchema),
  timeFacts   : z.array(snapshotTimeFactSchema)
}).strict();

const metricCounterSchema = z.number().int().min(0);

export const reviewRegressionMetricSummarySchema = z.object({
  personaAccuracy: z.object({
    matched    : metricCounterSchema,
    missing    : metricCounterSchema,
    unexpected : metricCounterSchema,
    accuracyPct: percentageSchema
  }).strict(),
  relationStability: z.object({
    matched     : metricCounterSchema,
    missing     : metricCounterSchema,
    changed     : metricCounterSchema,
    stabilityPct: percentageSchema
  }).strict(),
  timeNormalizationUsability: z.object({
    usable      : metricCounterSchema,
    unusable    : metricCounterSchema,
    usabilityPct: percentageSchema
  }).strict(),
  evidenceTraceability: z.object({
    traced         : metricCounterSchema,
    untraced       : metricCounterSchema,
    traceabilityPct: percentageSchema
  }).strict(),
  reviewActionSuccessRate: z.object({
    passed    : metricCounterSchema,
    failed    : metricCounterSchema,
    successPct: percentageSchema
  }).strict()
}).strict();

export const reviewRegressionRunComparisonSchema = z.object({
  baselineRunId : naturalKeyPartSchema,
  candidateRunId: naturalKeyPartSchema,
  snapshotDiff  : z.object({
    identical  : z.boolean(),
    addedKeys  : z.array(naturalKeyPartSchema),
    removedKeys: z.array(naturalKeyPartSchema),
    changedKeys: z.array(naturalKeyPartSchema)
  }).strict(),
  costComparison: z.unknown().nullable()
}).strict();

export const reviewRegressionActionResultSchema = z.object({
  scenarioKey: slugSafeKeySchema,
  passed     : z.boolean(),
  message    : z.string().trim().min(1).max(1000),
  auditAction: z.string().trim().min(1).max(120).nullable()
}).strict();

export const reviewRegressionReportSchema = z.object({
  command       : z.string().trim().min(1),
  fixturePath   : z.string().trim().min(1),
  fixture       : reviewRegressionFixtureSchema,
  metrics       : reviewRegressionMetricSummarySchema,
  missingKeys   : z.array(naturalKeyPartSchema),
  unexpectedKeys: z.array(naturalKeyPartSchema),
  changedKeys   : z.array(naturalKeyPartSchema),
  actionResults : z.array(reviewRegressionActionResultSchema),
  runComparison : reviewRegressionRunComparisonSchema.nullable(),
  generatedAtIso: z.string().datetime(),
  markdownPath  : z.string().trim().min(1),
  jsonPath      : z.string().trim().min(1)
}).strict();

export type ReviewRegressionFixture = z.infer<typeof reviewRegressionFixtureSchema>;
export type ReviewRegressionPersonaExpectation =
  z.infer<typeof reviewRegressionPersonaExpectationSchema>;
export type ReviewRegressionChapterFactExpectation =
  z.infer<typeof reviewRegressionChapterFactExpectationSchema>;
export type ReviewRegressionRelationExpectation =
  z.infer<typeof reviewRegressionRelationExpectationSchema>;
export type ReviewRegressionTimeExpectation =
  z.infer<typeof reviewRegressionTimeExpectationSchema>;
export type ReviewRegressionActionScenario =
  z.infer<typeof reviewRegressionActionScenarioSchema>;
export type ReviewRegressionRerunSample =
  z.infer<typeof reviewRegressionRerunSampleSchema>;
export type ReviewRegressionSnapshot = z.infer<typeof reviewRegressionSnapshotSchema>;
export type ReviewRegressionMetricSummary = z.infer<typeof reviewRegressionMetricSummarySchema>;
export type ReviewRegressionRunComparison = z.infer<typeof reviewRegressionRunComparisonSchema>;
export type ReviewRegressionReport = z.infer<typeof reviewRegressionReportSchema>;

function joinNaturalKeyParts(parts: readonly (number | string | null)[]): string {
  return parts.map((part) => (part === null ? "null" : String(part))).join(NATURAL_KEY_SEPARATOR);
}

export function getPersonaExpectationNaturalKey(
  persona: ReviewRegressionPersonaExpectation
): string {
  return persona.personaName;
}

export function getChapterFactExpectationNaturalKey(
  fact: ReviewRegressionChapterFactExpectation
): string {
  return joinNaturalKeyParts([fact.personaName, fact.chapterNo, fact.factLabel]);
}

export function getRelationExpectationNaturalKey(
  relation: ReviewRegressionRelationExpectation
): string {
  return joinNaturalKeyParts([
    relation.sourcePersonaName,
    relation.targetPersonaName,
    relation.relationTypeKey,
    relation.direction,
    relation.effectiveChapterStart,
    relation.effectiveChapterEnd
  ]);
}

export function getTimeExpectationNaturalKey(timeFact: ReviewRegressionTimeExpectation): string {
  return joinNaturalKeyParts([
    timeFact.personaName,
    timeFact.normalizedLabel,
    timeFact.chapterRangeStart,
    timeFact.chapterRangeEnd
  ]);
}

export function getReviewActionScenarioNaturalKey(
  scenario: ReviewRegressionActionScenario
): string {
  return scenario.scenarioKey;
}
