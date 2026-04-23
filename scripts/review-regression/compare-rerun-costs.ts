import "dotenv/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `Usage:
  pnpm exec ts-node --esm scripts/review-regression/compare-rerun-costs.ts --baseline-run <uuid> --candidate-run <uuid>

Options:
  --baseline-run   Baseline analysis run id
  --candidate-run  Candidate rerun analysis run id
  --help           Show this message
`;

interface CompareRerunCostsArgs {
  baselineRunId : string;
  candidateRunId: string;
}

class CliUsageError extends Error {}

function printUsage(): void {
  console.log(USAGE);
}

function requireFlagValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new CliUsageError(`Missing value for ${flag}`);
  }

  return value.trim();
}

export function parseCompareRerunCostsArgs(argv: string[]): CompareRerunCostsArgs | null {
  if (argv.includes("--help")) {
    return null;
  }

  let baselineRunId: string | null = null;
  let candidateRunId: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--baseline-run") {
      baselineRunId = requireFlagValue(argv, index, token);
      index += 1;
      continue;
    }

    if (token === "--candidate-run") {
      candidateRunId = requireFlagValue(argv, index, token);
      index += 1;
      continue;
    }

    if (token.startsWith("--")) {
      throw new CliUsageError(`Unknown option: ${token}`);
    }
  }

  if (baselineRunId === null) {
    throw new CliUsageError("Missing required option: --baseline-run");
  }

  if (candidateRunId === null) {
    throw new CliUsageError("Missing required option: --candidate-run");
  }

  return { baselineRunId, candidateRunId };
}

export async function runCompareRerunCosts(argv: string[]): Promise<number> {
  const parsedArgs = parseCompareRerunCostsArgs(argv);
  if (parsedArgs === null) {
    printUsage();
    return 0;
  }

  const costsModule = await import("../../src/server/modules/review/evidence-review/costs/index.ts");
  const prismaModule = await import("../../src/server/db/prisma.ts");

  try {
    const baseline = await costsModule.reviewRunCostSummaryService.getSummary(parsedArgs.baselineRunId);
    const candidate = await costsModule.reviewRunCostSummaryService.getSummary(parsedArgs.candidateRunId);
    const comparison = costsModule.compareReviewRunCostSummaries(baseline, candidate);
    const report = costsModule.renderReviewRunCostComparisonReport(comparison);

    console.log(report);
    return 0;
  } finally {
    await prismaModule.prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  try {
    process.exitCode = await runCompareRerunCosts(process.argv.slice(2));
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
