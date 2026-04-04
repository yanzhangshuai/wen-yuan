import { promises as fs } from "node:fs";
import path from "node:path";

import { z } from "zod";

interface CliArgs {
  metricsPath : string;
  baselinePath: string;
  outputPath  : string;
}

const baselineSchema = z.object({
  version: z.string().min(1),
  generatedAt: z.string().min(1),
  thresholds: z.object({
    jsonSuccessRateMin  : z.number().min(0).max(1),
    f1DeltaTarget       : z.number(),
    costDeltaTarget     : z.number(),
    throughputDeltaTarget: z.number()
  }).strict(),
  reference: z.object({
    entityF1             : z.number().min(0).max(1),
    relationF1           : z.number().min(0).max(1),
    costPer10kChars      : z.number().positive(),
    throughputMsPer10kChars: z.number().positive()
  }).strict()
}).passthrough();

const metricsSchema = z.object({
  version    : z.literal("eval-metrics.v1"),
  generatedAt: z.string().min(1),
  experiments: z.array(z.object({
    experimentTag: z.string().min(1),
    phase        : z.string().min(1),
    runs         : z.array(z.object({
      candidateId: z.string().min(1),
      label      : z.string().min(1),
      jsonSuccessRate: z.number().min(0).max(1).nullable(),
      entity: z.object({
        f1: z.number().min(0).max(1)
      }).passthrough(),
      relation: z.object({
        f1: z.number().min(0).max(1)
      }).passthrough(),
      f1Mean: z.number().min(0).max(1),
      estimatedCost: z.object({
        per10kChars: z.number().min(0).nullable()
      }).passthrough(),
      throughput: z.object({
        msPer10kChars: z.number().min(0).nullable()
      }).passthrough()
    }).passthrough())
  }).passthrough())
}).passthrough();

function parseArgs(argv: string[]): CliArgs {
  const pairs = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`参数缺失: ${token}`);
    }

    pairs.set(token, value);
    index += 1;
  }

  const metricsPath = pairs.get("--metrics");
  const baselinePath = pairs.get("--baseline");
  const outputPath = pairs.get("--output") ?? path.resolve("docs/eval/gate.result.json");

  if (!metricsPath || !baselinePath) {
    throw new Error("用法: pnpm ts-node scripts/eval/check-gate.ts --metrics <metrics.json> --baseline <baseline.json> [--output <gate.json>]");
  }

  return {
    metricsPath,
    baselinePath,
    outputPath
  };
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function safeDelta(current: number | null, baseline: number): number | null {
  if (current == null || baseline === 0) {
    return null;
  }

  return round((current - baseline) / baseline);
}

function compareNullableAsc(left: number | null, right: number | null): number {
  if (left == null && right == null) {
    return 0;
  }
  if (left == null) {
    return 1;
  }
  if (right == null) {
    return -1;
  }
  return left - right;
}

async function readJsonFile<T>(targetPath: string, schema: z.ZodSchema<T>): Promise<T> {
  const raw = await fs.readFile(path.resolve(targetPath), "utf8");
  const parsed: unknown = JSON.parse(raw);
  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`${targetPath} 格式无效: ${validated.error.issues[0]?.message ?? "unknown"}`);
  }

  return validated.data;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const metrics = await readJsonFile(args.metricsPath, metricsSchema);
  const baseline = await readJsonFile(args.baselinePath, baselineSchema);

  if (metrics.experiments.length === 0) {
    throw new Error("metrics.experiments 为空，无法执行门禁判定");
  }

  const baselineF1Mean = (baseline.reference.entityF1 + baseline.reference.relationF1) / 2;
  const phaseResults = metrics.experiments.map((experiment) => {
    const runEvaluations = experiment.runs.map((run) => {
      const f1Delta = round(run.f1Mean - baselineF1Mean);
      const costDelta = safeDelta(run.estimatedCost.per10kChars, baseline.reference.costPer10kChars);
      const throughputDelta = safeDelta(run.throughput.msPer10kChars, baseline.reference.throughputMsPer10kChars);
      const jsonPass = run.jsonSuccessRate != null && run.jsonSuccessRate >= baseline.thresholds.jsonSuccessRateMin;
      const f1Pass = f1Delta >= baseline.thresholds.f1DeltaTarget;
      const costPass = costDelta != null && costDelta <= baseline.thresholds.costDeltaTarget;
      const throughputPass = throughputDelta != null && throughputDelta <= baseline.thresholds.throughputDeltaTarget;
      const pass = jsonPass && f1Pass && costPass && throughputPass;

      const failReasons: string[] = [];
      if (!jsonPass) {
        failReasons.push("JSON_SUCCESS_RATE_NOT_MET");
      }
      if (!f1Pass) {
        failReasons.push("F1_DELTA_NOT_MET");
      }
      if (!costPass) {
        failReasons.push("COST_DELTA_NOT_MET");
      }
      if (!throughputPass) {
        failReasons.push("THROUGHPUT_DELTA_NOT_MET");
      }

      return {
        candidateId: run.candidateId,
        label      : run.label,
        pass,
        failReasons,
        metrics: {
          jsonSuccessRate   : run.jsonSuccessRate,
          entityF1          : run.entity.f1,
          relationF1        : run.relation.f1,
          f1Mean            : run.f1Mean,
          costPer10kChars   : run.estimatedCost.per10kChars,
          throughputMsPer10k: run.throughput.msPer10kChars
        },
        delta: {
          f1Delta,
          costDelta,
          throughputDelta
        }
      };
    });

    const sortedRuns = [...runEvaluations].sort((left, right) => {
      if (left.pass !== right.pass) {
        return left.pass ? -1 : 1;
      }

      if (left.delta.f1Delta !== right.delta.f1Delta) {
        return right.delta.f1Delta - left.delta.f1Delta;
      }

      const costCompare = compareNullableAsc(left.delta.costDelta, right.delta.costDelta);
      if (costCompare !== 0) {
        return costCompare;
      }

      return compareNullableAsc(left.delta.throughputDelta, right.delta.throughputDelta);
    });

    const winner = sortedRuns[0] ?? null;
    const passed = runEvaluations.some((run) => run.pass);
    const phaseFailReasons = passed
      ? []
      : Array.from(new Set(runEvaluations.flatMap((run) => run.failReasons)));

    return {
      phase        : experiment.phase,
      experimentTag: experiment.experimentTag,
      passed,
      winner,
      failureReasons: phaseFailReasons,
      runs         : runEvaluations
    };
  });

  const phasesPassed = phaseResults.filter((phase) => phase.passed).length;
  const runsTotal = phaseResults.reduce((sum, phase) => sum + phase.runs.length, 0);
  const runsPassed = phaseResults.reduce(
    (sum, phase) => sum + phase.runs.filter((run) => run.pass).length,
    0
  );

  const decision = phasesPassed === phaseResults.length ? "PASS" : "FAIL";
  const decisionReasons = decision === "PASS"
    ? ["ALL_PHASES_HAVE_PASSING_CANDIDATE"]
    : [
      `PHASES_PASSED_${phasesPassed}_OF_${phaseResults.length}`,
      ...phaseResults.filter((phase) => !phase.passed).map((phase) => `${phase.phase}_NO_PASSING_CANDIDATE`)
    ];

  const recommendedStageModelMap = Object.fromEntries(
    phaseResults
      .filter((phase) => phase.winner)
      .map((phase) => [phase.phase, {
        candidateId: phase.winner?.candidateId ?? null,
        pass       : phase.winner?.pass ?? false
      }])
  );

  const output = {
    version    : "eval-gate.v1",
    generatedAt: new Date().toISOString(),
    input: {
      metricsPath : path.resolve(args.metricsPath),
      baselinePath: path.resolve(args.baselinePath)
    },
    thresholds: baseline.thresholds,
    baselineReference: baseline.reference,
    summary: {
      decision,
      phaseCount  : phaseResults.length,
      phasesPassed,
      runsTotal,
      runsPassed
    },
    phaseResults,
    recommendedStageModelMap,
    decisionReasons
  };

  await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
  await fs.writeFile(args.outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    success     : true,
    code        : "EVAL_GATE_DECIDED",
    outputPath  : args.outputPath,
    decision,
    phasesPassed,
    phaseCount  : phaseResults.length,
    runsPassed,
    runsTotal
  }, null, 2));

  if (decision !== "PASS") {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({
    success: false,
    code   : "EVAL_GATE_FAILED",
    message: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exit(1);
});
