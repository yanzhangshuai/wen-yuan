import "dotenv/config";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `Usage:
  pnpm exec tsx scripts/review-regression/run-gold-set-regression.ts --fixture <path> [options]

Options:
  --fixture         Review regression fixture path
  --report-dir      Optional output directory for summary.md and summary.json
  --chapter-start   Optional chapter range start override
  --chapter-end     Optional chapter range end override
  --baseline-run    Optional baseline analysis run id
  --candidate-run   Optional candidate analysis run id
  --help            Show this message
`;

export interface GoldSetRegressionArgs {
  fixturePath    : string;
  reportDir?     : string;
  chapterStartNo?: number;
  chapterEndNo?  : number;
  baselineRunId? : string;
  candidateRunId?: string;
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

function parsePositiveIntegerFlag(argv: string[], index: number, flag: string): number {
  const rawValue = requireFlagValue(argv, index, flag);
  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isInteger(parsedValue) || parsedValue <= 0) {
    throw new CliUsageError(`Invalid positive integer for ${flag}: ${rawValue}`);
  }

  return parsedValue;
}

export function parseGoldSetRegressionArgs(argv: string[]): GoldSetRegressionArgs | null {
  if (argv.includes("--help")) {
    return null;
  }

  let fixturePath: string | null = null;
  let reportDir: string | undefined;
  let chapterStartNo: number | undefined;
  let chapterEndNo: number | undefined;
  let baselineRunId: string | undefined;
  let candidateRunId: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--fixture") {
      fixturePath = requireFlagValue(argv, index, token);
      index += 1;
      continue;
    }

    if (token === "--report-dir") {
      reportDir = requireFlagValue(argv, index, token);
      index += 1;
      continue;
    }

    if (token === "--chapter-start") {
      chapterStartNo = parsePositiveIntegerFlag(argv, index, token);
      index += 1;
      continue;
    }

    if (token === "--chapter-end") {
      chapterEndNo = parsePositiveIntegerFlag(argv, index, token);
      index += 1;
      continue;
    }

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

  if (fixturePath === null) {
    throw new CliUsageError("Missing required option: --fixture");
  }

  if ((baselineRunId === undefined) !== (candidateRunId === undefined)) {
    throw new CliUsageError("Both --baseline-run and --candidate-run are required for run comparison");
  }

  return {
    fixturePath,
    reportDir,
    chapterStartNo,
    chapterEndNo,
    baselineRunId,
    candidateRunId
  };
}

function buildCommand(argv: string[]): string {
  return [
    "pnpm",
    "exec",
    "tsx",
    "scripts/review-regression/run-gold-set-regression.ts",
    ...argv
  ].join(" ");
}

export async function runGoldSetRegression(argv: string[]): Promise<number> {
  const parsedArgs = parseGoldSetRegressionArgs(argv);
  if (parsedArgs === null) {
    printUsage();
    return 0;
  }

  const regressionModule = await import("../../src/server/modules/review/evidence-review/regression/index.ts");
  const prismaModule = await import("../../src/server/db/prisma.ts");

  try {
    const report = await regressionModule.runReviewGoldSetRegression({
      ...parsedArgs,
      command: buildCommand(argv)
    });

    console.log(report.markdownPath);
    console.log(report.jsonPath);
    return 0;
  } finally {
    await prismaModule.prisma.$disconnect();
  }
}

async function main(): Promise<void> {
  try {
    process.exitCode = await runGoldSetRegression(process.argv.slice(2));
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
