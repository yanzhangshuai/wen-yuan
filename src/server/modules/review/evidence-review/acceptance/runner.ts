import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { z } from "zod";

import { PROJECTION_FAMILY_VALUES } from "@/server/modules/review/evidence-review/projections/types";
import {
  createProjectionBuilder,
  createProjectionRepository
} from "@/server/modules/review/evidence-review/projections/projection-builder";
import type { ProjectionBuilder } from "@/server/modules/review/evidence-review/projections/types";
import {
  buildCurrentReviewRegressionSnapshot
} from "@/server/modules/review/evidence-review/regression/snapshot-builder";
import {
  createReviewRegressionSnapshotRepository,
  type ReviewRegressionCurrentRows,
  type ReviewRegressionSnapshotRepository
} from "@/server/modules/review/evidence-review/regression/snapshot-repository";
import type { ReviewRegressionFixture, ReviewRegressionSnapshot } from "@/server/modules/review/evidence-review/regression/contracts";
import { loadReviewRegressionFixture } from "@/server/modules/review/evidence-review/regression/fixture-loader";

import type { AcceptanceBookContext } from "./repository";
import {
  acceptanceBookReportSchema,
  acceptanceLoopResultSchema,
  acceptanceManualCheckResultSchema,
  acceptanceManualObservationFileSchema,
  acceptanceRiskItemSchema,
  finalAcceptanceReportSchema
} from "./contracts";
import {
  classifyFinalAcceptanceDecision,
  evaluateEvidenceLoop,
  evaluateKnowledgeLoop,
  evaluateProjectionLoop,
  evaluateRebuildLoop,
  evaluateReviewLoop
} from "./loop-evaluators";
import {
  renderAcceptanceBookReport,
  renderFinalAcceptanceReport
} from "./report";

type AcceptanceScenario = {
  scenarioKey          : string;
  bookTitle            : string;
  fixturePath          : string;
  manualObservationPath: string;
  reportPaths          : {
    markdownPath: string;
    jsonPath    : string;
  };
  referenceReports: {
    t20TaskPath    : string;
    t21MarkdownPath: string;
    t21JsonPath    : string;
  };
  manualChecks: Array<{
    checkKey           : string;
    routeKind          : "personaChapter" | "relationEditor" | "personaTime";
    expectedObservation: string;
  }>;
};

type AcceptanceRegressionReport = {
  markdownPath : string;
  jsonPath     : string;
  runComparison: {
    snapshotDiff  : { identical: boolean };
    costComparison: Record<string, unknown> | null;
  } | null;
};

type AcceptanceManualCheckResult = z.infer<typeof acceptanceManualCheckResultSchema>;
type AcceptanceLoopResult = z.infer<typeof acceptanceLoopResultSchema>;
type AcceptanceRiskItem = z.infer<typeof acceptanceRiskItemSchema>;
type AcceptanceBookReport = z.infer<typeof acceptanceBookReportSchema>;
type FinalAcceptanceReport = z.infer<typeof finalAcceptanceReportSchema>;

export interface AcceptanceSnapshotProvider {
  buildBeforeAfter(input: {
    bookId      : string;
    scenarioKey?: string;
    bookTitle?  : string;
    fixturePath?: string;
  }): Promise<{
    beforeSnapshotKeys           : string[];
    afterSnapshotKeys            : string[];
    reviewedClaimBackedProjection: boolean;
  }>;
}

export interface ManualChecklistRecorder {
  (input: {
    scenario: Pick<AcceptanceScenario, "scenarioKey" | "manualObservationPath" | "manualChecks">;
    routes  : AcceptanceBookContext["routes"];
  }): Promise<AcceptanceManualCheckResult[]>;
}

interface AcceptanceRepositoryAdapter {
  loadBookContext(input: {
    scenarioKey: string;
    bookTitle  : string;
  }): Promise<AcceptanceBookContext>;
}

interface ArtifactWriter {
  (path: string, content: string): Promise<void>;
}

interface RunEndToEndAcceptanceInput {
  scenarios             : AcceptanceScenario[];
  finalReportPaths      : { markdownPath: string; jsonPath: string };
  ensureRegressionReport: (scenario: {
    fixturePath     : string;
    referenceReports: AcceptanceScenario["referenceReports"];
  }) => Promise<AcceptanceRegressionReport>;
  acceptanceRepository: AcceptanceRepositoryAdapter;
  snapshotProvider    : AcceptanceSnapshotProvider;
  manualCheckRecorder : ManualChecklistRecorder;
  writeArtifact?      : ArtifactWriter;
}

interface ManualChecklistRecorderDependencies {
  readText?: (path: string) => Promise<string>;
}

interface LiveAcceptanceSnapshotProviderDependencies {
  fixtureLoader?     : (fixturePath: string) => Promise<ReviewRegressionFixture>;
  snapshotRepository?: ReviewRegressionSnapshotRepository;
  projectionBuilder? : ProjectionBuilder;
}

const DEFAULT_MANUAL_OBSERVED = "PENDING_MANUAL_VERIFICATION";

function createDefaultArtifactWriter(): ArtifactWriter {
  return async (path: string, content: string) => {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${content}\n`, "utf8");
  };
}

function toSnapshotKeys(snapshot: ReviewRegressionSnapshot): string[] {
  return [
    ...snapshot.personas.map((item) => `persona:${item.personaName}|aliases:${item.aliases.join(",")}`),
    ...snapshot.chapterFacts.map((item) => (
      `chapter:${item.chapterNo}|persona:${item.personaName}|fact:${item.factLabel}|evidence:${item.evidenceSnippets.join("&")}`
    )),
    ...snapshot.relations.map((item) => (
      `relation:${item.sourcePersonaName}->${item.targetPersonaName}:${item.relationTypeKey}:${item.direction}:${item.effectiveChapterStart ?? "-"}:${item.effectiveChapterEnd ?? "-"}|evidence:${item.evidenceSnippets.join("&")}`
    )),
    ...snapshot.timeFacts.map((item) => (
      `time:${item.personaName}:${item.normalizedLabel}:${item.timeSortKey ?? "null"}:${item.chapterRangeStart ?? "-"}:${item.chapterRangeEnd ?? "-"}|evidence:${item.evidenceSnippets.join("&")}`
    ))
  ].sort();
}

function hasReviewedClaimBackedProjection(rows: ReviewRegressionCurrentRows): boolean {
  const hasAcceptedClaims =
    rows.eventClaims.length
    + rows.relationClaims.length
    + rows.timeClaims.length
    + rows.identityResolutionClaims.length > 0;

  const relationshipEdgesBacked = rows.relationshipEdges.every((row) => row.sourceClaimIds.length > 0);
  const timelineEventsBacked = rows.timelineEvents.every((row) => row.sourceClaimIds.length > 0);
  const personaTimeFactsBacked = rows.personaTimeFacts.every((row) => row.sourceTimeClaimIds.length > 0);

  return hasAcceptedClaims && relationshipEdgesBacked && timelineEventsBacked && personaTimeFactsBacked;
}

function buildManualPlaceholder(
  check: AcceptanceScenario["manualChecks"][number],
  routePath: string
): AcceptanceManualCheckResult {
  return acceptanceManualCheckResultSchema.parse({
    checkKey           : check.checkKey,
    routePath,
    expectedObservation: check.expectedObservation,
    observed           : DEFAULT_MANUAL_OBSERVED,
    passed             : false,
    blocking           : true
  });
}

function buildLoopRisks(
  scenarioKey: string,
  loopResults: AcceptanceLoopResult[]
): AcceptanceRiskItem[] {
  return loopResults
    .filter((item) => !item.passed)
    .map((item) => acceptanceRiskItemSchema.parse({
      severity  : "BLOCKING",
      summary   : `${scenarioKey} ${item.loopKey} loop failed`,
      owner     : "AI acceptance runner",
      mitigation: "Fix failing loop before launch."
    }));
}

/**
 * manual checklist 必须依赖人类观测文件；缺文件、坏文件、缺 check 都只能返回 blocking placeholder。
 */
export function createManualChecklistRecorder(
  dependencies: ManualChecklistRecorderDependencies = {}
): ManualChecklistRecorder {
  const readText = dependencies.readText ?? ((path: string) => readFile(path, "utf8"));

  return async (input) => {
    const routeByKind = {
      personaChapter: input.routes.personaChapter,
      relationEditor: input.routes.relationEditor,
      personaTime   : input.routes.personaTime
    } as const;

    let observationFile: z.infer<typeof acceptanceManualObservationFileSchema> | null = null;

    try {
      const rawContent = await readText(input.scenario.manualObservationPath);
      const parsed = acceptanceManualObservationFileSchema.parse(JSON.parse(rawContent));
      if (parsed.scenarioKey !== input.scenario.scenarioKey) {
        throw new Error("manual observation scenario mismatch");
      }
      observationFile = parsed;
    } catch {
      return input.scenario.manualChecks.map((check) => {
        return buildManualPlaceholder(check, routeByKind[check.routeKind]);
      });
    }

    const observationByKey = new Map(observationFile.checks.map((check) => [check.checkKey, check]));

    return input.scenario.manualChecks.map((check) => {
      const observation = observationByKey.get(check.checkKey);
      if (observation === undefined) {
        return buildManualPlaceholder(check, routeByKind[check.routeKind]);
      }

      return acceptanceManualCheckResultSchema.parse({
        checkKey           : check.checkKey,
        routePath          : routeByKind[check.routeKind],
        expectedObservation: check.expectedObservation,
        observed           : observation.observed,
        passed             : observation.passed,
        blocking           : !observation.passed
      });
    });
  };
}

/**
 * live snapshot provider 直接复用 T21 snapshot builder 和 T11 projection builder，
 * 保证 T22 只做 orchestration，不再复制一套第二真相模型。
 */
export function createLiveAcceptanceSnapshotProvider(
  dependencies: LiveAcceptanceSnapshotProviderDependencies = {}
): AcceptanceSnapshotProvider {
  const fixtureLoader = dependencies.fixtureLoader ?? loadReviewRegressionFixture;
  const snapshotRepository =
    dependencies.snapshotRepository ?? createReviewRegressionSnapshotRepository();
  const projectionBuilder = dependencies.projectionBuilder ?? createProjectionBuilder({
    repository: createProjectionRepository()
  });

  return {
    async buildBeforeAfter(input) {
      if (typeof input.fixturePath !== "string" || input.fixturePath.trim().length === 0) {
        throw new Error("Acceptance snapshot provider requires fixturePath");
      }

      const fixture = await fixtureLoader(input.fixturePath);
      const context = await snapshotRepository.resolveFixtureContext(fixture);
      const beforeRows = await snapshotRepository.loadCurrentReviewRows(context);
      const beforeSnapshot = buildCurrentReviewRegressionSnapshot(context, beforeRows);

      await projectionBuilder.rebuildProjection({
        kind              : "PROJECTION_ONLY",
        bookId            : input.bookId,
        projectionFamilies: PROJECTION_FAMILY_VALUES
      });

      const afterRows = await snapshotRepository.loadCurrentReviewRows(context);
      const afterSnapshot = buildCurrentReviewRegressionSnapshot(context, afterRows);

      return {
        beforeSnapshotKeys           : toSnapshotKeys(beforeSnapshot),
        afterSnapshotKeys            : toSnapshotKeys(afterSnapshot),
        reviewedClaimBackedProjection: hasReviewedClaimBackedProjection(beforeRows)
      };
    }
  };
}

/**
 * acceptance runner 只编排已有读模型、T21 报告与 manual observation，
 * 不在 T22 引入新的 truth 写路径。
 */
export async function runEndToEndAcceptance(
  input: RunEndToEndAcceptanceInput
): Promise<FinalAcceptanceReport> {
  const writeArtifact = input.writeArtifact ?? createDefaultArtifactWriter();
  const generatedAtIso = new Date().toISOString();
  const bookReports: AcceptanceBookReport[] = [];

  for (const scenario of input.scenarios) {
    const regression = await input.ensureRegressionReport({
      fixturePath     : scenario.fixturePath,
      referenceReports: scenario.referenceReports
    });
    const context = await input.acceptanceRepository.loadBookContext({
      scenarioKey: scenario.scenarioKey,
      bookTitle  : scenario.bookTitle
    });
    const projection = await input.snapshotProvider.buildBeforeAfter({
      bookId     : context.book.id,
      scenarioKey: scenario.scenarioKey,
      bookTitle  : scenario.bookTitle,
      fixturePath: scenario.fixturePath
    });
    const manualChecks = await input.manualCheckRecorder({
      scenario: {
        scenarioKey          : scenario.scenarioKey,
        manualObservationPath: scenario.manualObservationPath,
        manualChecks         : scenario.manualChecks
      },
      routes: context.routes
    });

    const evidenceLoop = acceptanceLoopResultSchema.parse(evaluateEvidenceLoop({
      claimDetails: context.claimDetails
    }));
    const reviewLoop = acceptanceLoopResultSchema.parse(evaluateReviewLoop({
      auditActions: context.auditActions
    }));
    const projectionLoop = acceptanceLoopResultSchema.parse(evaluateProjectionLoop({
      beforeSnapshotKeys: projection.beforeSnapshotKeys,
      afterSnapshotKeys : projection.afterSnapshotKeys
    }));
    const knowledgeLoop = acceptanceLoopResultSchema.parse(evaluateKnowledgeLoop({
      relationCatalogAvailable     : context.relationCatalogAvailable,
      reviewedClaimBackedProjection: projection.reviewedClaimBackedProjection
    }));
    const rebuildLoop = acceptanceLoopResultSchema.parse({
      ...evaluateRebuildLoop({
        hasReferenceReport:
          regression.markdownPath.trim().length > 0
          && regression.jsonPath.trim().length > 0,
        rerunIdentical   : regression.runComparison?.snapshotDiff.identical ?? false,
        hasCostComparison: regression.runComparison?.costComparison !== null
      }),
      artifactPaths: [regression.markdownPath, regression.jsonPath]
    });
    const loopResults = [
      evidenceLoop,
      reviewLoop,
      projectionLoop,
      knowledgeLoop,
      rebuildLoop
    ];
    const risks = buildLoopRisks(scenario.scenarioKey, loopResults);
    const decision = classifyFinalAcceptanceDecision({
      loopResults,
      manualChecks,
      risks
    });
    const report = acceptanceBookReportSchema.parse({
      scenarioKey        : scenario.scenarioKey,
      bookId             : context.book.id,
      bookTitle          : context.book.title,
      generatedAtIso,
      referencedArtifacts: {
        t20TaskPath    : scenario.referenceReports.t20TaskPath,
        t21MarkdownPath: regression.markdownPath,
        t21JsonPath    : regression.jsonPath
      },
      loopResults,
      manualChecks,
      risks,
      decision
    });

    await writeArtifact(
      scenario.reportPaths.markdownPath,
      renderAcceptanceBookReport(report)
    );
    await writeArtifact(
      scenario.reportPaths.jsonPath,
      JSON.stringify(report, null, 2)
    );

    bookReports.push(report);
  }

  const blockingRisks = bookReports.flatMap((report) => {
    return report.risks.filter((risk) => risk.severity === "BLOCKING");
  });
  const nonBlockingRisks = bookReports.flatMap((report) => {
    return report.risks.filter((risk) => risk.severity === "NON_BLOCKING");
  });
  const overallDecision = bookReports.some((report) => report.decision === "NO_GO")
    || blockingRisks.length > 0
    ? "NO_GO"
    : "GO";
  const finalReport = finalAcceptanceReportSchema.parse({
    generatedAtIso,
    overallDecision,
    bookReports,
    blockingRisks,
    nonBlockingRisks,
    summaryLines: bookReports.map((report) => `${report.scenarioKey}: ${report.decision}`)
  });

  await writeArtifact(
    input.finalReportPaths.markdownPath,
    renderFinalAcceptanceReport(finalReport)
  );
  await writeArtifact(
    input.finalReportPaths.jsonPath,
    JSON.stringify(finalReport, null, 2)
  );

  return finalReport;
}
