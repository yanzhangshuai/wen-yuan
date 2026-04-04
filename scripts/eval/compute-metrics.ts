import { promises as fs } from "node:fs";
import path from "node:path";

import { z } from "zod";

interface CliArgs {
  experimentsArg: string;
  goldsetPath   : string;
  outputPath    : string;
}

interface Counters {
  tp: number;
  fp: number;
  fn: number;
}

const goldsetRecordSchema = z.object({
  bookId   : z.string().min(1),
  chapterNo: z.number().int().min(1),
  chapterTitle: z.string().optional(),
  textLength  : z.number().int().min(0).optional(),
  personas : z.array(z.object({
    name   : z.string().min(1),
    aliases: z.array(z.string().min(1)).optional()
  }).strict()),
  relationships: z.array(z.object({
    source: z.string().min(1),
    target: z.string().min(1),
    type  : z.string().min(1)
  }).strict())
}).strict();

const experimentFileSchema = z.object({
  version      : z.literal("eval-experiment.v1"),
  generatedAt  : z.string().min(1),
  experimentTag: z.string().min(1),
  phase        : z.string().min(1),
  bookId       : z.string().min(1),
  chapterList  : z.array(z.number().int().min(1)),
  candidateSetPath: z.string().min(1).optional(),
  source: z.object({
    baseUrl : z.string().min(1),
    dryRun  : z.boolean(),
    currency: z.string().min(1)
  }).strict(),
  runs: z.array(z.object({
    candidateId: z.string().min(1),
    label      : z.string().min(1),
    primary: z.object({
      key            : z.string().min(1),
      displayName    : z.string().min(1),
      provider       : z.string().min(1),
      apiModelId     : z.string().min(1),
      dbModelId      : z.string().min(1),
      promptPer1M    : z.number().min(0),
      completionPer1M: z.number().min(0)
    }).strict(),
    fallback: z.object({
      key            : z.string().min(1),
      displayName    : z.string().min(1),
      provider       : z.string().min(1),
      apiModelId     : z.string().min(1),
      dbModelId      : z.string().min(1),
      promptPer1M    : z.number().min(0),
      completionPer1M: z.number().min(0)
    }).strict().nullable(),
    job: z.object({
      id        : z.string().min(1),
      status    : z.string().min(1),
      startedAt : z.string().nullable(),
      finishedAt: z.string().nullable(),
      durationMs: z.number().int().nullable(),
      errorLog  : z.string().nullable()
    }).strict(),
    stageLogs: z.object({
      totalCalls      : z.number().int().min(0),
      successCalls    : z.number().int().min(0),
      retriedCalls    : z.number().int().min(0),
      errorCalls      : z.number().int().min(0),
      fallbackCalls   : z.number().int().min(0),
      promptTokens    : z.number().int().min(0),
      completionTokens: z.number().int().min(0),
      totalDurationMs : z.number().int().min(0),
      jsonSuccessRate : z.number().min(0).max(1).nullable()
    }).strict(),
    estimatedCost: z.object({
      currency            : z.string().min(1),
      total               : z.number().min(0),
      per10kChars         : z.number().min(0).nullable(),
      missingPricingEvents: z.number().int().min(0)
    }).strict(),
    predictions: z.object({
      chapterCount     : z.number().int().min(0),
      personaCount     : z.number().int().min(0),
      relationshipCount: z.number().int().min(0),
      chapters         : z.array(z.object({
        chapterNo    : z.number().int().min(1),
        textLength   : z.number().int().min(0),
        personaNames : z.array(z.string()),
        relationships: z.array(z.object({
          source: z.string(),
          target: z.string(),
          type  : z.string()
        }).strict())
      }).strict())
    }).strict()
  }).strict())
}).strict();

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

  const experimentsArg = pairs.get("--experiments");
  const goldsetPath = pairs.get("--goldset");
  const outputPath = pairs.get("--output") ?? path.resolve("docs/eval/metrics.summary.json");

  if (!experimentsArg || !goldsetPath) {
    throw new Error("用法: pnpm ts-node scripts/eval/compute-metrics.ts --experiments <tag1,tag2|path1,path2> --goldset <goldset.jsonl> [--output <metrics.json>]");
  }

  return {
    experimentsArg,
    goldsetPath,
    outputPath
  };
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function buildExperimentPath(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) {
    throw new Error("experiments 中包含空项");
  }

  if (trimmed.endsWith(".json") || trimmed.includes("/")) {
    return path.resolve(trimmed);
  }

  return path.resolve("docs/eval/experiments", `${trimmed}.json`);
}

function toRate(counters: Counters) {
  const precision = counters.tp + counters.fp > 0 ? counters.tp / (counters.tp + counters.fp) : 0;
  const recall = counters.tp + counters.fn > 0 ? counters.tp / (counters.tp + counters.fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

  return {
    precision: round(precision),
    recall   : round(recall),
    f1       : round(f1),
    tp       : counters.tp,
    fp       : counters.fp,
    fn       : counters.fn
  };
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function addSetCounters(
  predictedSet: Set<string>,
  goldSet: Set<string>,
  counters: Counters
) {
  for (const item of predictedSet) {
    if (goldSet.has(item)) {
      counters.tp += 1;
    } else {
      counters.fp += 1;
    }
  }

  for (const item of goldSet) {
    if (!predictedSet.has(item)) {
      counters.fn += 1;
    }
  }
}

function buildAliasMap(personas: z.infer<typeof goldsetRecordSchema>["personas"]): Map<string, string> {
  const map = new Map<string, string>();

  for (const persona of personas) {
    const canonical = normalizeName(persona.name);
    if (!canonical) {
      continue;
    }

    map.set(canonical, canonical);
    for (const alias of persona.aliases ?? []) {
      const normalizedAlias = normalizeName(alias);
      if (normalizedAlias) {
        map.set(normalizedAlias, canonical);
      }
    }
  }

  return map;
}

function normalizeRelationKey(source: string, target: string, type: string): string {
  return `${normalizeName(source)}::${normalizeName(target)}::${normalizeName(type)}`;
}

async function readGoldsetRecords(goldsetPath: string): Promise<Array<z.infer<typeof goldsetRecordSchema>>> {
  const raw = await fs.readFile(path.resolve(goldsetPath), "utf8");
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const records: Array<z.infer<typeof goldsetRecordSchema>> = [];
  for (let index = 0; index < lines.length; index += 1) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[index]);
    } catch (error) {
      throw new Error(`goldset 第 ${index + 1} 行 JSON 解析失败: ${error instanceof Error ? error.message : String(error)}`);
    }

    const validated = goldsetRecordSchema.safeParse(parsed);
    if (!validated.success) {
      throw new Error(`goldset 第 ${index + 1} 行不合法: ${validated.error.issues[0]?.message ?? "unknown"}`);
    }

    records.push(validated.data);
  }

  return records;
}

async function loadExperiment(filePath: string) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  const validated = experimentFileSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`实验文件格式无效 (${filePath}): ${validated.error.issues[0]?.message ?? "unknown"}`);
  }

  return validated.data;
}

function evaluateRun(
  run: z.infer<typeof experimentFileSchema>["runs"][number],
  chapterList: number[],
  goldByChapter: Map<number, z.infer<typeof goldsetRecordSchema>>
) {
  const predictedChapterMap = new Map<number, z.infer<typeof experimentFileSchema>["runs"][number]["predictions"]["chapters"][number]>();
  for (const chapter of run.predictions.chapters) {
    predictedChapterMap.set(chapter.chapterNo, chapter);
  }

  const entityCounters: Counters = { tp: 0, fp: 0, fn: 0 };
  const relationCounters: Counters = { tp: 0, fp: 0, fn: 0 };
  const missingGoldChapters: number[] = [];
  const missingPredictedChapters: number[] = [];
  const extraPredictedChapters = run.predictions.chapters
    .map((chapter) => chapter.chapterNo)
    .filter((chapterNo) => !chapterList.includes(chapterNo))
    .sort((a, b) => a - b);

  let totalTextChars = 0;

  for (const chapterNo of chapterList) {
    const goldChapter = goldByChapter.get(chapterNo);
    if (!goldChapter) {
      missingGoldChapters.push(chapterNo);
    }

    const predictedChapter = predictedChapterMap.get(chapterNo);
    if (!predictedChapter) {
      missingPredictedChapters.push(chapterNo);
    }

    const aliasMap = buildAliasMap(goldChapter?.personas ?? []);
    const canonical = (value: string) => aliasMap.get(normalizeName(value)) ?? normalizeName(value);

    const goldEntities = new Set((goldChapter?.personas ?? []).map((persona) => canonical(persona.name)).filter((name) => name.length > 0));
    const predictedEntities = new Set((predictedChapter?.personaNames ?? []).map((name) => canonical(name)).filter((name) => name.length > 0));
    addSetCounters(predictedEntities, goldEntities, entityCounters);

    const goldRelations = new Set(
      (goldChapter?.relationships ?? []).map((relation) => normalizeRelationKey(
        canonical(relation.source),
        canonical(relation.target),
        relation.type
      ))
    );
    const predictedRelations = new Set(
      (predictedChapter?.relationships ?? []).map((relation) => normalizeRelationKey(
        canonical(relation.source),
        canonical(relation.target),
        relation.type
      ))
    );
    addSetCounters(predictedRelations, goldRelations, relationCounters);

    totalTextChars += predictedChapter?.textLength ?? 0;
  }

  const entity = toRate(entityCounters);
  const relation = toRate(relationCounters);
  const f1Mean = round((entity.f1 + relation.f1) / 2);
  const throughputMsPer10kChars = totalTextChars > 0
    ? round((run.stageLogs.totalDurationMs / totalTextChars) * 10000)
    : null;

  return {
    candidateId: run.candidateId,
    label      : run.label,
    jobId      : run.job.id,
    jobStatus  : run.job.status,
    jsonSuccessRate: run.stageLogs.jsonSuccessRate == null ? null : round(run.stageLogs.jsonSuccessRate),
    entity,
    relation,
    f1Mean,
    estimatedCost: {
      currency    : run.estimatedCost.currency,
      total       : round(run.estimatedCost.total),
      per10kChars : run.estimatedCost.per10kChars == null ? null : round(run.estimatedCost.per10kChars),
      missingPrice: run.estimatedCost.missingPricingEvents
    },
    throughput: {
      totalDurationMs   : run.stageLogs.totalDurationMs,
      jobDurationMs     : run.job.durationMs,
      msPer10kChars     : throughputMsPer10kChars,
      totalPredictedChars: totalTextChars
    },
    coverage: {
      chapterCount           : chapterList.length,
      missingGoldChapters,
      missingPredictedChapters,
      extraPredictedChapters
    }
  };
}

function sortByNumberDesc<T>(items: T[], getter: (item: T) => number | null) {
  return [...items].sort((left, right) => {
    const leftValue = getter(left);
    const rightValue = getter(right);
    if (leftValue == null && rightValue == null) {
      return 0;
    }
    if (leftValue == null) {
      return 1;
    }
    if (rightValue == null) {
      return -1;
    }
    return rightValue - leftValue;
  });
}

function sortByNumberAsc<T>(items: T[], getter: (item: T) => number | null) {
  return [...items].sort((left, right) => {
    const leftValue = getter(left);
    const rightValue = getter(right);
    if (leftValue == null && rightValue == null) {
      return 0;
    }
    if (leftValue == null) {
      return 1;
    }
    if (rightValue == null) {
      return -1;
    }
    return leftValue - rightValue;
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const experimentPaths = args.experimentsArg
    .split(",")
    .map((token) => buildExperimentPath(token));

  const goldsetRecords = await readGoldsetRecords(args.goldsetPath);
  const goldBookIds = Array.from(new Set(goldsetRecords.map((record) => record.bookId))).sort((a, b) => a.localeCompare(b));

  const experiments = [];
  const allRunMetrics: Array<{
    phase: string;
    experimentTag: string;
    candidateId: string;
    f1Mean: number;
    jsonSuccessRate: number | null;
    costPer10kChars: number | null;
    throughputMsPer10kChars: number | null;
  }> = [];

  for (const experimentPath of experimentPaths) {
    const experiment = await loadExperiment(experimentPath);
    const scopedGoldset = goldsetRecords.filter((record) => record.bookId === experiment.bookId);
    const selectedGoldset = scopedGoldset.length > 0 ? scopedGoldset : goldsetRecords;

    const goldByChapter = new Map<number, z.infer<typeof goldsetRecordSchema>>();
    for (const record of selectedGoldset) {
      goldByChapter.set(record.chapterNo, record);
    }

    const runMetrics = experiment.runs.map((run) => evaluateRun(run, experiment.chapterList, goldByChapter));

    for (const run of runMetrics) {
      allRunMetrics.push({
        phase                : experiment.phase,
        experimentTag        : experiment.experimentTag,
        candidateId          : run.candidateId,
        f1Mean               : run.f1Mean,
        jsonSuccessRate      : run.jsonSuccessRate,
        costPer10kChars      : run.estimatedCost.per10kChars,
        throughputMsPer10kChars: run.throughput.msPer10kChars
      });
    }

    experiments.push({
      experimentTag: experiment.experimentTag,
      phase        : experiment.phase,
      sourceFile   : experimentPath,
      bookId       : experiment.bookId,
      chapterList  : experiment.chapterList,
      dryRun       : experiment.source.dryRun,
      goldsetScope : scopedGoldset.length > 0 ? "BOOK_MATCHED" : "FALLBACK_ALL_BOOKS",
      runs         : runMetrics,
      ranking      : {
        byEntityF1            : sortByNumberDesc(runMetrics, (item) => item.entity.f1).map((item) => ({ candidateId: item.candidateId, value: item.entity.f1 })),
        byRelationF1          : sortByNumberDesc(runMetrics, (item) => item.relation.f1).map((item) => ({ candidateId: item.candidateId, value: item.relation.f1 })),
        byF1Mean              : sortByNumberDesc(runMetrics, (item) => item.f1Mean).map((item) => ({ candidateId: item.candidateId, value: item.f1Mean })),
        byCostPer10kChars     : sortByNumberAsc(runMetrics, (item) => item.estimatedCost.per10kChars).map((item) => ({ candidateId: item.candidateId, value: item.estimatedCost.per10kChars })),
        byThroughputMsPer10k  : sortByNumberAsc(runMetrics, (item) => item.throughput.msPer10kChars).map((item) => ({ candidateId: item.candidateId, value: item.throughput.msPer10kChars }))
      }
    });
  }

  const bestF1 = sortByNumberDesc(allRunMetrics, (item) => item.f1Mean)[0] ?? null;
  const bestJson = sortByNumberDesc(allRunMetrics, (item) => item.jsonSuccessRate)[0] ?? null;
  const bestCost = sortByNumberAsc(allRunMetrics, (item) => item.costPer10kChars)[0] ?? null;
  const bestThroughput = sortByNumberAsc(allRunMetrics, (item) => item.throughputMsPer10kChars)[0] ?? null;

  const output = {
    version    : "eval-metrics.v1",
    generatedAt: new Date().toISOString(),
    input: {
      goldsetPath    : path.resolve(args.goldsetPath),
      experimentPaths: experimentPaths.map((item) => path.resolve(item))
    },
    goldset: {
      recordCount: goldsetRecords.length,
      bookIds    : goldBookIds
    },
    experiments,
    aggregate: {
      runCount: allRunMetrics.length,
      best: {
        f1Mean                  : bestF1,
        jsonSuccessRate         : bestJson,
        costPer10kChars         : bestCost,
        throughputMsPer10kChars : bestThroughput
      }
    }
  };

  await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
  await fs.writeFile(args.outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  console.log(JSON.stringify({
    success       : true,
    code          : "EVAL_METRICS_COMPUTED",
    outputPath    : args.outputPath,
    experimentCount: experiments.length,
    runCount      : allRunMetrics.length
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({
    success: false,
    code   : "EVAL_METRICS_FAILED",
    message: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exit(1);
});
