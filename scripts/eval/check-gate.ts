import { promises as fs } from "node:fs";
import path from "node:path";

import { z } from "zod";

/**
 * 文件定位（评估门禁层）：
 * - 该脚本属于离线评估工具链的“门禁判定”步骤，通常在 `run-stage-ab` 与 `compute-metrics` 之后执行。
 * - 不参与 Next.js 请求链路，也不是路由处理器；主要被本地命令、CI 流水线调用。
 *
 * 核心职责：
 * - 基于 `metrics` 计算结果和 `baseline` 阈值，判断本轮候选模型实验是否满足上线/准入门槛（PASS/FAIL）。
 *
 * 上游输入：
 * - `metrics.json`：由 `scripts/eval/compute-metrics.ts` 生成。
 * - `baseline.json`：人工维护的历史参考值与门禁阈值。
 *
 * 下游输出：
 * - `gate.result.json`：供 CI 判定、评审报告、策略回填流程消费。
 *
 * 重要业务规则（不是技术限制）：
 * - 任何阶段没有候选通过时，整体判定必须 FAIL。
 * - “能算出值”与“达标”是两层判断：当成本/吞吐为 null 时，不可视为通过。
 */
interface CliArgs {
  // 本轮评估汇总文件（包含各阶段各候选的指标）。
  metricsPath : string;
  // 基线阈值文件（决定门禁是否通过的业务标准）。
  baselinePath: string;
  // 门禁结果输出路径（默认写入 docs/eval）。
  outputPath  : string;
}

const baselineSchema = z.object({
  // baseline 文件版本号，用于后续演进兼容。
  version    : z.string().min(1),
  // baseline 生成时间，便于审计“当前阈值来自何时”。
  generatedAt: z.string().min(1),
  thresholds : z.object({
    // JSON 成功率最低阈值：保障结构化输出质量。
    jsonSuccessRateMin   : z.number().min(0).max(1),
    // F1 相对基线的目标增量（可为负，表示允许轻微回退）。
    f1DeltaTarget        : z.number(),
    // 成本相对基线的目标增量（通常 <= 0 才代表不增本）。
    costDeltaTarget      : z.number(),
    // 吞吐耗时相对基线的目标增量（通常 <= 0 代表不变慢）。
    throughputDeltaTarget: z.number()
  }).strict(),
  reference: z.object({
    // 基线人物识别 F1。
    entityF1               : z.number().min(0).max(1),
    // 基线关系识别 F1。
    relationF1             : z.number().min(0).max(1),
    // 基线每 1 万字成本（用于比较涨跌幅）。
    costPer10kChars        : z.number().positive(),
    // 基线每 1 万字耗时（用于比较快慢）。
    throughputMsPer10kChars: z.number().positive()
  }).strict()
}).passthrough();

const metricsSchema = z.object({
  // 来自 compute-metrics 的固定版本号。
  version    : z.literal("eval-metrics.v1"),
  generatedAt: z.string().min(1),
  experiments: z.array(z.object({
    // 实验批次标识，用于溯源配置和执行参数。
    experimentTag: z.string().min(1),
    // 对应模型策略阶段（如 ROSTER_DISCOVERY 等）。
    phase        : z.string().min(1),
    runs         : z.array(z.object({
      // 候选配置的唯一标识。
      candidateId    : z.string().min(1),
      // 展示用标签。
      label          : z.string().min(1),
      // JSON 可解析率；nullable 代表该阶段没有足够样本或无终态调用。
      jsonSuccessRate: z.number().min(0).max(1).nullable(),
      entity         : z.object({
        f1: z.number().min(0).max(1)
      }).passthrough(),
      relation: z.object({
        f1: z.number().min(0).max(1)
      }).passthrough(),
      f1Mean       : z.number().min(0).max(1),
      estimatedCost: z.object({
        per10kChars: z.number().min(0).nullable()
      }).passthrough(),
      throughput: z.object({
        msPer10kChars: z.number().min(0).nullable()
      }).passthrough()
    }).passthrough())
  }).passthrough())
}).passthrough();

/**
 * 解析命令行参数。
 *
 * @param argv CLI 参数数组（`process.argv.slice(2)`）
 * @returns 结构化参数对象
 *
 * 设计原因：
 * - 使用键值对解析而非位置参数，降低脚本接入 CI 时的人为错误率。
 * - 对缺参立即抛错，避免进入半执行状态写出误导性结果。
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

  // metrics 与 baseline 是门禁的最小输入，缺一不可。
  const metricsPath = pairs.get("--metrics");
  const baselinePath = pairs.get("--baseline");
  // 输出路径允许默认值，方便本地快速执行。
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

// 统一小数精度，保证 CI 比较和版本提交 diff 稳定可读。
function round(value: number): number {
  return Number(value.toFixed(6));
}

/**
 * 计算相对基线增量：(current - baseline) / baseline。
 *
 * 返回 null 的业务语义：
 * - 当前值缺失（例如该 run 无法估算成本/吞吐）；
 * - baseline 为 0（无法做比率计算，避免除零错误与无意义指标）。
 */
function safeDelta(current: number | null, baseline: number): number | null {
  if (current == null || baseline === 0) {
    return null;
  }

  return round((current - baseline) / baseline);
}

/**
 * 可空数字升序比较器：
 * - 有值优先于 null（null 排后），避免“未知值”被误判为更优。
 */
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

/**
 * 读取并校验 JSON 文件。
 *
 * @param targetPath 目标文件路径
 * @param schema Zod 校验规则
 * @returns 通过校验的强类型数据
 *
 * 防御目的：
 * - 将“输入格式错误”在脚本最前置阶段拦截，避免后续出现难追踪的计算异常。
 */
async function readJsonFile<T>(targetPath: string, schema: z.ZodSchema<T>): Promise<T> {
  const raw = await fs.readFile(path.resolve(targetPath), "utf8");
  const parsed: unknown = JSON.parse(raw);
  const validated = schema.safeParse(parsed);
  if (!validated.success) {
    throw new Error(`${targetPath} 格式无效: ${validated.error.issues[0]?.message ?? "unknown"}`);
  }

  return validated.data;
}

/**
 * 主流程：
 * 1. 读取 metrics/baseline；
 * 2. 逐阶段逐候选计算门禁项是否达标；
 * 3. 产出阶段胜者、整体 PASS/FAIL、失败原因；
 * 4. 写入 gate 结果文件。
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));

  const metrics = await readJsonFile(args.metricsPath, metricsSchema);
  const baseline = await readJsonFile(args.baselinePath, baselineSchema);

  // 没有实验数据时继续判定没有业务意义，直接失败让上游先修复采样流程。
  if (metrics.experiments.length === 0) {
    throw new Error("metrics.experiments 为空，无法执行门禁判定");
  }

  // F1 基线采用实体与关系平均值，与 compute-metrics 的 f1Mean 保持同一口径。
  const baselineF1Mean = (baseline.reference.entityF1 + baseline.reference.relationF1) / 2;
  const phaseResults = metrics.experiments.map((experiment) => {
    const runEvaluations = experiment.runs.map((run) => {
      // 逐项指标与基线比较，输出可解释的 delta。
      const f1Delta = round(run.f1Mean - baselineF1Mean);
      const costDelta = safeDelta(run.estimatedCost.per10kChars, baseline.reference.costPer10kChars);
      const throughputDelta = safeDelta(run.throughput.msPer10kChars, baseline.reference.throughputMsPer10kChars);

      // 门禁子项：
      // - JSON 成功率保证结构化稳定性；
      // - F1 保证效果；
      // - 成本与吞吐保证可运行性。
      const jsonPass = run.jsonSuccessRate != null && run.jsonSuccessRate >= baseline.thresholds.jsonSuccessRateMin;
      const f1Pass = f1Delta >= baseline.thresholds.f1DeltaTarget;
      const costPass = costDelta != null && costDelta <= baseline.thresholds.costDeltaTarget;
      const throughputPass = throughputDelta != null && throughputDelta <= baseline.thresholds.throughputDeltaTarget;
      const pass = jsonPass && f1Pass && costPass && throughputPass;

      // 失败原因显式化，便于评审时快速定位“是效果问题还是成本问题”。
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
        metrics    : {
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

    // 排序策略：
    // 1) 先看是否通过门禁；
    // 2) 再看 F1 增量；
    // 3) 再看成本；
    // 4) 最后看吞吐。
    // 这是一个业务优先级排序，不是技术限制。
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

    // winner 用于给下游“推荐阶段模型映射”提供候选。
    const winner = sortedRuns[0] ?? null;
    // 阶段通过定义：至少一个候选 pass（给 A/B 策略留空间）。
    const passed = runEvaluations.some((run) => run.pass);
    const phaseFailReasons = passed
      ? []
      : Array.from(new Set(runEvaluations.flatMap((run) => run.failReasons)));

    return {
      phase         : experiment.phase,
      experimentTag : experiment.experimentTag,
      passed,
      winner,
      failureReasons: phaseFailReasons,
      runs          : runEvaluations
    };
  });

  // 汇总统计用于 CI 与评审快速浏览，不替代详细 runs 数据。
  const phasesPassed = phaseResults.filter((phase) => phase.passed).length;
  const runsTotal = phaseResults.reduce((sum, phase) => sum + phase.runs.length, 0);
  const runsPassed = phaseResults.reduce(
    (sum, phase) => sum + phase.runs.filter((run) => run.pass).length,
    0
  );

  // 整体门禁规则：所有阶段都必须有通过候选，才允许 PASS。
  const decision = phasesPassed === phaseResults.length ? "PASS" : "FAIL";
  const decisionReasons = decision === "PASS"
    ? ["ALL_PHASES_HAVE_PASSING_CANDIDATE"]
    : [
      `PHASES_PASSED_${phasesPassed}_OF_${phaseResults.length}`,
      ...phaseResults.filter((phase) => !phase.passed).map((phase) => `${phase.phase}_NO_PASSING_CANDIDATE`)
    ];

  // 为后续自动回填策略提供“阶段 -> 推荐候选”映射。
  // 注意：这里即使 winner 未通过，也会记录 `pass=false`，供人工判断。
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
    input      : {
      metricsPath : path.resolve(args.metricsPath),
      baselinePath: path.resolve(args.baselinePath)
    },
    thresholds       : baseline.thresholds,
    baselineReference: baseline.reference,
    summary          : {
      decision,
      phaseCount: phaseResults.length,
      phasesPassed,
      runsTotal,
      runsPassed
    },
    phaseResults,
    recommendedStageModelMap,
    decisionReasons
  };

  // 先确保目录存在，避免在干净环境执行时因目录缺失失败。
  await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
  await fs.writeFile(args.outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

  // 控制台输出保持结构化 JSON，便于 CI 机器读取。
  console.log(JSON.stringify({
    success   : true,
    code      : "EVAL_GATE_DECIDED",
    outputPath: args.outputPath,
    decision,
    phasesPassed,
    phaseCount: phaseResults.length,
    runsPassed,
    runsTotal
  }, null, 2));

  // 用退出码表达门禁结果，便于流水线做强约束。
  if (decision !== "PASS") {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  // 统一错误信封，保证上游脚本可以稳定解析失败信息。
  console.error(JSON.stringify({
    success: false,
    code   : "EVAL_GATE_FAILED",
    message: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exit(1);
});
