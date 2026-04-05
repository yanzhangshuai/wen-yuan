import { promises as fs } from "node:fs";
import path from "node:path";

import { z } from "zod";

/**
 * 文件定位（离线评估工具链）：
 * - 本文件负责把实验原始结果转成可比较的质量/成本/吞吐指标。
 * - 它不在 Next.js 的 page/route 渲染链路中运行，而是作为脚本被 CLI/CI 调用。
 *
 * 上游输入：
 * - `scripts/eval/run-stage-ab.ts` 产出的 `eval-experiment.v1` 文件。
 * - 人工维护的 goldset（JSONL，每行一个章节真值记录）。
 *
 * 下游输出：
 * - `eval-metrics.v1` 汇总文件，供 `scripts/eval/check-gate.ts` 做门禁判定。
 *
 * 关键业务规则（不是技术限制）：
 * - 评估以章节集合为边界，超出章节只记录为覆盖率异常，不参与命中加分。
 * - 实体与关系先做别名归一化，再比较 TP/FP/FN，避免“同人不同名”导致误罚。
 */
interface CliArgs {
  // 要计算的实验列表。支持 tag（自动映射路径）或直接传 JSON 路径，多个值以逗号分隔。
  experimentsArg: string;
  // goldset 文件路径（JSONL）。
  goldsetPath   : string;
  // 输出指标文件路径；未传时使用默认文档目录。
  outputPath    : string;
}

interface Counters {
  // True Positive：预测命中真值。
  tp: number;
  // False Positive：预测有但真值没有（误报）。
  fp: number;
  // False Negative：真值有但预测没有（漏报）。
  fn: number;
}

const goldsetRecordSchema = z.object({
  // 书籍 ID。用于按书匹配实验与 goldset。
  bookId      : z.string().min(1),
  // 章节号（自然数）。
  chapterNo   : z.number().int().min(1),
  // 可选标题，仅用于辅助阅读/排查。
  chapterTitle: z.string().optional(),
  // 可选文本长度，通常由预处理写入。
  textLength  : z.number().int().min(0).optional(),
  // 章节人物真值，含别名。
  personas    : z.array(z.object({
    name   : z.string().min(1),
    aliases: z.array(z.string().min(1)).optional()
  }).strict()),
  // 章节关系真值。
  relationships: z.array(z.object({
    source: z.string().min(1),
    target: z.string().min(1),
    type  : z.string().min(1)
  }).strict())
}).strict();

const experimentFileSchema = z.object({
  // run-stage-ab 产物版本号。
  version         : z.literal("eval-experiment.v1"),
  generatedAt     : z.string().min(1),
  // 实验标签，用于追踪配置与执行批次。
  experimentTag   : z.string().min(1),
  // 当前实验所属阶段（如 ROSTER_DISCOVERY）。
  phase           : z.string().min(1),
  // 实验目标书籍。
  bookId          : z.string().min(1),
  // 本次评估章节范围。
  chapterList     : z.array(z.number().int().min(1)),
  // 候选池来源路径（可选）。
  candidateSetPath: z.string().min(1).optional(),
  source          : z.object({
    baseUrl : z.string().min(1),
    dryRun  : z.boolean(),
    currency: z.string().min(1)
  }).strict(),
  runs: z.array(z.object({
    // 候选唯一标识。
    candidateId: z.string().min(1),
    // 展示用标签。
    label      : z.string().min(1),
    primary    : z.object({
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

/**
 * 解析命令行参数。
 *
 * @param argv 原始参数数组
 * @returns 结构化参数
 */
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

/**
 * 名称归一化：去掉首尾空格并压缩中间连续空白。
 * 这是实体对齐的关键步骤，避免“张三”与“ 张三 ”被误判为不同人。
 */
function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * 解析实验标识到文件路径。
 * - token 含 `/` 或以 `.json` 结尾时，视为直接路径；
 * - 否则按约定目录 `docs/eval/experiments/<token>.json` 解析。
 */
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

/**
 * 根据 TP/FP/FN 计算 precision/recall/f1。
 *
 * 注意：当分母为 0 时返回 0，而不是抛错。
 * 这是评估脚本的稳定性设计，避免某一批空样本中断整条流水线。
 */
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

// 统一保留 6 位小数，便于不同机器输出稳定对比。
function round(value: number): number {
  return Number(value.toFixed(6));
}

/**
 * 将预测集合与真值集合的差异累加到计数器。
 *
 * @param predictedSet 预测项集合
 * @param goldSet 真值项集合
 * @param counters 累加容器
 */
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

/**
 * 基于 goldset 人物列表构造“别名 -> 规范名”映射。
 *
 * @param personas goldset 中该章节的人物定义
 * @returns 别名字典
 */
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

/**
 * 关系规范化键：统一比较 source/target/type 三元组。
 */
function normalizeRelationKey(source: string, target: string, type: string): string {
  return `${normalizeName(source)}::${normalizeName(target)}::${normalizeName(type)}`;
}

/**
 * 读取并校验 goldset JSONL 文件。
 *
 * @param goldsetPath goldset 路径
 * @returns 通过 schema 校验后的记录数组
 */
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

/**
 * 读取单个实验文件并校验结构。
 *
 * @param filePath 实验 JSON 文件路径
 * @returns 校验后的实验对象
 */
async function loadExperiment(filePath: string) {
  const raw = await fs.readFile(filePath, "utf8");
  const parsed: unknown = JSON.parse(raw);
  const validated = experimentFileSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`实验文件格式无效 (${filePath}): ${validated.error.issues[0]?.message ?? "unknown"}`);
  }

  return validated.data;
}

/**
 * 评估单个候选 run。
 *
 * @param run 候选实验结果
 * @param chapterList 本次实验目标章节集合
 * @param goldByChapter 章节号到真值记录的映射
 * @returns 该候选的完整评估指标
 */
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

  // 用预测章节文本总字数计算吞吐（ms/万字）。
  let totalTextChars = 0;

  for (const chapterNo of chapterList) {
    const goldChapter = goldByChapter.get(chapterNo);
    if (!goldChapter) {
      // 缺 goldset 不直接终止，而是纳入 coverage 报告，保证整批实验可完成。
      missingGoldChapters.push(chapterNo);
    }

    const predictedChapter = predictedChapterMap.get(chapterNo);
    if (!predictedChapter) {
      // 模型漏掉章节同样记录到 coverage，避免静默丢分。
      missingPredictedChapters.push(chapterNo);
    }

    const aliasMap = buildAliasMap(goldChapter?.personas ?? []);
    const canonical = (value: string) => aliasMap.get(normalizeName(value)) ?? normalizeName(value);

    // 实体对比：先归一化，再按集合比对。
    const goldEntities = new Set((goldChapter?.personas ?? []).map((persona) => canonical(persona.name)).filter((name) => name.length > 0));
    const predictedEntities = new Set((predictedChapter?.personaNames ?? []).map((name) => canonical(name)).filter((name) => name.length > 0));
    addSetCounters(predictedEntities, goldEntities, entityCounters);

    // 关系对比：source/target/type 全部归一化后再计分。
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
    candidateId    : run.candidateId,
    label          : run.label,
    jobId          : run.job.id,
    jobStatus      : run.job.status,
    jsonSuccessRate: run.stageLogs.jsonSuccessRate == null ? null : round(run.stageLogs.jsonSuccessRate),
    entity,
    relation,
    f1Mean,
    estimatedCost  : {
      currency    : run.estimatedCost.currency,
      total       : round(run.estimatedCost.total),
      per10kChars : run.estimatedCost.per10kChars == null ? null : round(run.estimatedCost.per10kChars),
      missingPrice: run.estimatedCost.missingPricingEvents
    },
    throughput: {
      totalDurationMs    : run.stageLogs.totalDurationMs,
      jobDurationMs      : run.job.durationMs,
      msPer10kChars      : throughputMsPer10kChars,
      totalPredictedChars: totalTextChars
    },
    coverage: {
      chapterCount: chapterList.length,
      missingGoldChapters,
      missingPredictedChapters,
      extraPredictedChapters
    }
  };
}

/**
 * 数字降序排序；null 永远后置，避免“未知值”挤占最优名次。
 */
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

/**
 * 数字升序排序；null 同样后置，避免“缺失值”被误判为最低成本/最快吞吐。
 */
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

/**
 * 主流程：
 * 1. 解析实验输入并读取 goldset。
 * 2. 逐实验、逐候选计算指标。
 * 3. 输出实验级 ranking 与全局 aggregate。
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));
  const experimentPaths = args.experimentsArg
    .split(",")
    .map((token) => buildExperimentPath(token));

  const goldsetRecords = await readGoldsetRecords(args.goldsetPath);
  const goldBookIds = Array.from(new Set(goldsetRecords.map((record) => record.bookId))).sort((a, b) => a.localeCompare(b));

  const experiments = [];
  const allRunMetrics: Array<{
    phase                  : string;
    experimentTag          : string;
    candidateId            : string;
    f1Mean                 : number;
    jsonSuccessRate        : number | null;
    costPer10kChars        : number | null;
    throughputMsPer10kChars: number | null;
  }> = [];

  for (const experimentPath of experimentPaths) {
    const experiment = await loadExperiment(experimentPath);
    const scopedGoldset = goldsetRecords.filter((record) => record.bookId === experiment.bookId);
    // 优先使用同书籍真值；若当前书籍无标注，回退全量真值并在输出中标记 fallback。
    const selectedGoldset = scopedGoldset.length > 0 ? scopedGoldset : goldsetRecords;

    const goldByChapter = new Map<number, z.infer<typeof goldsetRecordSchema>>();
    for (const record of selectedGoldset) {
      goldByChapter.set(record.chapterNo, record);
    }

    const runMetrics = experiment.runs.map((run) => evaluateRun(run, experiment.chapterList, goldByChapter));

    for (const run of runMetrics) {
      allRunMetrics.push({
        phase                  : experiment.phase,
        experimentTag          : experiment.experimentTag,
        candidateId            : run.candidateId,
        f1Mean                 : run.f1Mean,
        jsonSuccessRate        : run.jsonSuccessRate,
        costPer10kChars        : run.estimatedCost.per10kChars,
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
        // ranking 用于评审与可视化，不直接代表门禁结论。
        byEntityF1          : sortByNumberDesc(runMetrics, (item) => item.entity.f1).map((item) => ({ candidateId: item.candidateId, value: item.entity.f1 })),
        byRelationF1        : sortByNumberDesc(runMetrics, (item) => item.relation.f1).map((item) => ({ candidateId: item.candidateId, value: item.relation.f1 })),
        byF1Mean            : sortByNumberDesc(runMetrics, (item) => item.f1Mean).map((item) => ({ candidateId: item.candidateId, value: item.f1Mean })),
        byCostPer10kChars   : sortByNumberAsc(runMetrics, (item) => item.estimatedCost.per10kChars).map((item) => ({ candidateId: item.candidateId, value: item.estimatedCost.per10kChars })),
        byThroughputMsPer10k: sortByNumberAsc(runMetrics, (item) => item.throughput.msPer10kChars).map((item) => ({ candidateId: item.candidateId, value: item.throughput.msPer10kChars }))
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
    input      : {
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
      best    : {
        // 仅表示“该批次最优观察值”，不是最终上线决策。
        f1Mean                 : bestF1,
        jsonSuccessRate        : bestJson,
        costPer10kChars        : bestCost,
        throughputMsPer10kChars: bestThroughput
      }
    }
  };

  await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
  await fs.writeFile(args.outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  // 统一输出机器可读 JSON，方便 CI 收集统计。
  console.log(JSON.stringify({
    success        : true,
    code           : "EVAL_METRICS_COMPUTED",
    outputPath     : args.outputPath,
    experimentCount: experiments.length,
    runCount       : allRunMetrics.length
  }, null, 2));
}

main().catch((error: unknown) => {
  // 失败也保持统一信封，便于上游报警与归档。
  console.error(JSON.stringify({
    success: false,
    code   : "EVAL_METRICS_FAILED",
    message: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exit(1);
});
