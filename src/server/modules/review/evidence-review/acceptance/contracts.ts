import { z } from "zod";

export const ACCEPTANCE_LOOP_KEYS = [
  "EVIDENCE",
  "REVIEW",
  "PROJECTION",
  "KNOWLEDGE",
  "REBUILD"
] as const;

export const acceptanceRiskItemSchema = z.object({
  severity  : z.enum(["BLOCKING", "NON_BLOCKING"]),
  summary   : z.string().min(1),
  owner     : z.string().min(1, "owner is required"),
  mitigation: z.string().min(1, "mitigation is required")
});

export const acceptanceLoopResultSchema = z.object({
  loopKey      : z.enum(ACCEPTANCE_LOOP_KEYS),
  passed       : z.boolean(),
  summary      : z.string().min(1),
  evidenceLines: z.array(z.string().min(1)),
  artifactPaths: z.array(z.string().min(1)),
  blocking     : z.boolean()
});

export const acceptanceManualCheckResultSchema = z.object({
  checkKey            : z.string().min(1),
  routePath           : z.string().min(1),
  expectedObservation : z.string().min(1),
  observed            : z.string().min(1),
  passed              : z.boolean(),
  blocking            : z.boolean()
});

export const acceptanceManualObservationFileSchema = z.object({
  scenarioKey: z.enum(["rulin-waishi-sample", "sanguo-yanyi-sample"]),
  checks     : z.array(z.object({
    checkKey     : z.string().min(1),
    observed     : z.string().min(1),
    passed       : z.boolean(),
    observedAtIso: z.string().datetime().optional()
  }))
});

export const acceptanceBookReportSchema = z.object({
  scenarioKey       : z.string().min(1),
  bookId            : z.string().min(1),
  bookTitle         : z.string().min(1),
  generatedAtIso    : z.string().datetime(),
  referencedArtifacts: z.object({
    t20TaskPath    : z.string().min(1),
    t21MarkdownPath: z.string().min(1),
    t21JsonPath    : z.string().min(1)
  }),
  loopResults : z.array(acceptanceLoopResultSchema),
  manualChecks: z.array(acceptanceManualCheckResultSchema),
  risks       : z.array(acceptanceRiskItemSchema),
  decision    : z.enum(["GO", "NO_GO"])
});

export const finalAcceptanceReportSchema = z.object({
  generatedAtIso   : z.string().datetime(),
  overallDecision  : z.enum(["GO", "NO_GO"]),
  bookReports      : z.array(acceptanceBookReportSchema),
  blockingRisks    : z.array(acceptanceRiskItemSchema),
  nonBlockingRisks : z.array(acceptanceRiskItemSchema),
  summaryLines     : z.array(z.string().min(1))
});

export type AcceptanceBookReport = z.infer<typeof acceptanceBookReportSchema>;
export type AcceptanceLoopKey = (typeof ACCEPTANCE_LOOP_KEYS)[number];
export type AcceptanceManualObservationFile = z.infer<
  typeof acceptanceManualObservationFileSchema
>;
export type FinalAcceptanceReport = z.infer<typeof finalAcceptanceReportSchema>;
