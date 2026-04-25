import "dotenv/config";
import { access, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `Usage:
  pnpm exec tsx scripts/review-regression/acceptance/run-e2e-acceptance.ts [options]

Options:
  --book        rulin-waishi-sample | sanguo-yanyi-sample | all
  --skip-seed   Reuse existing seeded sample books
  --help        Show this message
`;

type AcceptanceScenarioKey = "rulin-waishi-sample" | "sanguo-yanyi-sample" | "all";

export interface AcceptanceCliArgs {
  scenarioKey: AcceptanceScenarioKey;
  skipSeed   : boolean;
}

class CliUsageError extends Error {}

function printUsage(): void {
  console.log(USAGE);
}

function isAcceptanceScenarioKey(value: string): value is AcceptanceScenarioKey {
  return value === "rulin-waishi-sample" || value === "sanguo-yanyi-sample" || value === "all";
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function buildCommand(argv: string[]): string {
  return [
    "pnpm",
    "exec",
    "tsx",
    "scripts/review-regression/acceptance/run-e2e-acceptance.ts",
    ...argv
  ].join(" ");
}

type AcceptanceRegressionReport = {
  markdownPath : string;
  jsonPath     : string;
  actionResults?: Array<{
    scenarioKey: string;
    passed     : boolean;
    message    : string;
    auditAction: string | null;
  }>;
  runComparison: {
    baselineRunId?: string;
    candidateRunId?: string;
    snapshotDiff  : {
      identical  : boolean;
      addedKeys? : string[];
      removedKeys?: string[];
      changedKeys?: string[];
    };
    costComparison?: unknown;
  } | null;
};

interface ResolveAcceptanceRegressionReportInput {
  scenario: {
    fixturePath   : string;
    baselineRunId?: string;
    candidateRunId?: string;
    referenceReports: {
      t21MarkdownPath: string;
      t21JsonPath    : string;
    };
  };
  pathExists?: (path: string) => Promise<boolean>;
  readText?  : (path: string) => Promise<string>;
  parseReport: (rawText: string) => AcceptanceRegressionReport;
  runRegression: (input: {
    fixturePath   : string;
    reportDir     : string;
    baselineRunId?: string;
    candidateRunId?: string;
    command       : string;
  }) => Promise<AcceptanceRegressionReport>;
}

function buildRegressionCommand(input: {
  fixturePath   : string;
  reportDir     : string;
  baselineRunId?: string;
  candidateRunId?: string;
}): string {
  const argv = [
    "--fixture",
    input.fixturePath,
    "--report-dir",
    input.reportDir
  ];

  if (typeof input.baselineRunId === "string" && typeof input.candidateRunId === "string") {
    argv.push(
      "--baseline-run",
      input.baselineRunId,
      "--candidate-run",
      input.candidateRunId
    );
  }

  return [
    "pnpm",
    "exec",
    "tsx",
    "scripts/review-regression/run-gold-set-regression.ts",
    ...argv
  ].join(" ");
}

export async function resolveAcceptanceRegressionReport(
  input: ResolveAcceptanceRegressionReportInput
): Promise<AcceptanceRegressionReport> {
  const pathExistsFn = input.pathExists ?? pathExists;
  const readText = input.readText ?? ((path: string) => readFile(path, "utf8"));

  const hasStableArtifacts = await Promise.all([
    pathExistsFn(input.scenario.referenceReports.t21MarkdownPath),
    pathExistsFn(input.scenario.referenceReports.t21JsonPath)
  ]);

  if (hasStableArtifacts.every(Boolean)) {
    const rawReport = await readText(input.scenario.referenceReports.t21JsonPath);
    const report = input.parseReport(rawReport);

    if (
      report.runComparison !== null
      || typeof input.scenario.baselineRunId !== "string"
      || typeof input.scenario.candidateRunId !== "string"
    ) {
      return {
        markdownPath : input.scenario.referenceReports.t21MarkdownPath,
        jsonPath     : input.scenario.referenceReports.t21JsonPath,
        actionResults: report.actionResults,
        runComparison: report.runComparison
      };
    }
  }

  return input.runRegression({
    fixturePath   : input.scenario.fixturePath,
    reportDir     : dirname(input.scenario.referenceReports.t21MarkdownPath),
    baselineRunId : input.scenario.baselineRunId,
    candidateRunId: input.scenario.candidateRunId,
    command       : buildRegressionCommand({
      fixturePath   : input.scenario.fixturePath,
      reportDir     : dirname(input.scenario.referenceReports.t21MarkdownPath),
      baselineRunId : input.scenario.baselineRunId,
      candidateRunId: input.scenario.candidateRunId
    })
  });
}

export function parseAcceptanceArgs(argv: string[]): AcceptanceCliArgs | null {
  if (argv.includes("--help")) {
    return null;
  }

  let scenarioKey: AcceptanceScenarioKey = "all";
  let skipSeed = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--book") {
      const value = argv[index + 1];
      if (typeof value !== "string" || !isAcceptanceScenarioKey(value)) {
        throw new CliUsageError(`Invalid value for --book: ${value ?? ""}`);
      }

      scenarioKey = value;
      index += 1;
      continue;
    }

    if (token === "--skip-seed") {
      skipSeed = true;
      continue;
    }

    if (token.startsWith("--")) {
      throw new CliUsageError(`Unknown option: ${token}`);
    }
  }

  return {
    scenarioKey,
    skipSeed
  };
}

export async function runAcceptance(argv: string[]): Promise<number> {
  const parsedArgs = parseAcceptanceArgs(argv);
  if (parsedArgs === null) {
    printUsage();
    return 0;
  }

  const acceptanceModule = await import("../../../src/server/modules/review/evidence-review/acceptance/index.ts");
  const regressionModule = await import("../../../src/server/modules/review/evidence-review/regression/index.ts");
  const prismaModule = await import("../../../src/server/db/prisma.ts");

  try {
    if (!parsedArgs.skipSeed) {
      await regressionModule.seedReviewRegressionSamples();
    }

    const scenarios = acceptanceModule.ACCEPTANCE_SCENARIOS.filter((scenario) => {
      return parsedArgs.scenarioKey === "all" || scenario.scenarioKey === parsedArgs.scenarioKey;
    });

    const finalReport = await acceptanceModule.runEndToEndAcceptance({
      scenarios,
      finalReportPaths: acceptanceModule.FINAL_ACCEPTANCE_REPORT_PATHS,
      ensureRegressionReport: async (scenario) => {
        return resolveAcceptanceRegressionReport({
          scenario,
          parseReport: (rawText) => {
            return regressionModule.reviewRegressionReportSchema.parse(JSON.parse(rawText));
          },
          runRegression: (options) => regressionModule.runReviewGoldSetRegression({
            fixturePath   : options.fixturePath,
            reportDir     : options.reportDir,
            baselineRunId : options.baselineRunId,
            candidateRunId: options.candidateRunId,
            command       : options.command
          })
        });
      },
      acceptanceRepository: acceptanceModule.createAcceptanceRepository(),
      snapshotProvider    : acceptanceModule.createLiveAcceptanceSnapshotProvider(),
      manualCheckRecorder : acceptanceModule.createManualChecklistRecorder()
    });

    console.log(finalReport.overallDecision);
    console.log(acceptanceModule.FINAL_ACCEPTANCE_REPORT_PATHS.markdownPath);
    console.log(acceptanceModule.FINAL_ACCEPTANCE_REPORT_PATHS.jsonPath);

    return 0;
  } finally {
    await prismaModule.prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  try {
    process.exitCode = await runAcceptance(process.argv.slice(2));
  } catch (error) {
    if (error instanceof CliUsageError) {
      console.error(error.message);
      printUsage();
      process.exitCode = 1;
      return;
    }

    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const isDirectExecution = process.argv[1]
  ? fileURLToPath(import.meta.url) === resolve(process.argv[1])
  : false;

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
