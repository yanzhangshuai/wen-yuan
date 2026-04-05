import "dotenv/config";

import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";

import {
  AnalysisJobStatus,
  PrismaClient
} from "../../src/generated/prisma/client.ts";

/**
 * 文件定位（离线实验执行层）：
 * - 本脚本用于执行“阶段级 A/B 候选模型实验”，是评估流水线里的“数据采集器”。
 * - 不是 Next.js route/page，不参与线上请求路径；通常由本地或 CI 调用。
 *
 * 它解决的业务问题：
 * - 在同一本书、同一批章节、同一分析阶段下，比较多组模型候选的产出质量/成本/吞吐。
 * - 输出 `eval-experiment.v1` 结构化结果，供后续 `compute-metrics` 与 `check-gate` 使用。
 *
 * 上游输入：
 * - 候选集配置（candidate-set）。
 * - 管理员凭据（真实运行时用于触发后台分析任务）。
 * - 数据库连接（读取任务状态、阶段日志、预测结果）。
 *
 * 下游输出：
 * - docs/eval/experiments/*.json（实验记录），作为后续门禁决策依据。
 */
type EvalPhase = "ROSTER_DISCOVERY" | "CHUNK_EXTRACTION" | "TITLE_RESOLUTION" | "BOOK_VALIDATION";

interface CliArgs {
  // 要评估的阶段（模型策略中的阶段枚举）。
  phase         : EvalPhase;
  // 目标书籍 ID。
  bookId        : string;
  // 参与评估的章节号列表（去重、升序后的结果）。
  chapterList   : number[];
  // 候选集 JSON 路径。
  candidatePath : string;
  // 实验标签（用于关联任务与输出文件）。
  experimentTag : string;
  // 实验结果输出路径。
  outputPath    : string;
  // 目标服务地址（用于调用 API 启动分析任务）。
  baseUrl       : string;
  // 管理员账号（真实运行模式下必填）。
  adminUsername : string;
  // 管理员密码（真实运行模式下必填）。
  adminPassword : string;
  // 轮询任务状态的间隔（毫秒）。
  pollIntervalMs: number;
  // 单候选任务超时时间（毫秒）。
  timeoutMs     : number;
  // 干跑模式：不触发真实任务，仅验证配置与输出结构。
  dryRun        : boolean;
}

interface HttpResult {
  // HTTP 状态码。
  status : number;
  // 原始响应文本（用于错误排查）。
  text   : string;
  // 响应头（用于读取 set-cookie 等）。
  headers: Headers;
  // 尝试解析后的 JSON（失败时为 null）。
  json   : unknown;
}

interface ResolvedModel {
  // 候选集中定义的模型键。
  key            : string;
  // 展示名（优先使用数据库中的模型名）。
  displayName    : string;
  // 模型供应商标识。
  provider       : string;
  // 调用端模型 ID（API 层使用）。
  apiModelId     : string;
  // 数据库模型 ID（策略写入时使用）。
  dbModelId      : string;
  // 输入 token 单价（每百万）。
  promptPer1M    : number;
  // 输出 token 单价（每百万）。
  completionPer1M: number;
}

interface CandidateRun {
  // 候选 ID。
  candidateId: string;
  // 候选标签。
  label      : string;
  // 主模型解析结果。
  primary    : ResolvedModel;
  // 回退模型解析结果（可空）。
  fallback   : ResolvedModel | null;
  job        : {
    // 分析任务 ID。
    id        : string;
    // 任务状态终态（或 dry-run 占位状态）。
    status    : AnalysisJobStatus;
    // 任务开始时间（ISO 字符串）。
    startedAt : string | null;
    // 任务完成时间（ISO 字符串）。
    finishedAt: string | null;
    // 任务耗时（毫秒）。
    durationMs: number | null;
    // 任务错误日志（失败时用于定位）。
    errorLog  : string | null;
  };
  stageLogs: {
    // 该阶段调用总数（按章节+分片聚合）。
    totalCalls      : number;
    // 最终成功调用数。
    successCalls    : number;
    // RETRIED 事件次数。
    retriedCalls    : number;
    // 最终失败调用数。
    errorCalls      : number;
    // 由回退模型成功兜底的调用次数。
    fallbackCalls   : number;
    // 输入 token 总量。
    promptTokens    : number;
    // 输出 token 总量。
    completionTokens: number;
    // 调用累计耗时（毫秒）。
    totalDurationMs : number;
    // JSON 成功率（success / terminal calls）。
    jsonSuccessRate : number | null;
  };
  estimatedCost: {
    // 币种（来自候选集配置）。
    currency            : string;
    // 估算总成本。
    total               : number;
    // 每万字成本（用于跨章节可比）。
    per10kChars         : number | null;
    // 缺少定价映射的事件数量。
    missingPricingEvents: number;
  };
  predictions: {
    // 覆盖章节数。
    chapterCount     : number;
    // 预测人物总数（按章节求和）。
    personaCount     : number;
    // 预测关系总数（按章节求和）。
    relationshipCount: number;
    chapters: Array<{
      // 章节号。
      chapterNo    : number;
      // 章节文本长度。
      textLength   : number;
      // 章节人物名称列表（排序后）。
      personaNames : string[];
      relationships: Array<{
        // 关系起点人物名。
        source: string;
        // 关系终点人物名。
        target: string;
        // 关系类型。
        type  : string;
      }>;
    }>;
  };
}

const PHASE_VALUES = [
  "ROSTER_DISCOVERY",
  "CHUNK_EXTRACTION",
  "TITLE_RESOLUTION",
  "BOOK_VALIDATION"
] as const;

const modelCatalogSchema = z.object({
  displayName: z.string().min(1),
  provider   : z.string().min(1),
  modelId    : z.string().min(1),
  pricing    : z.object({
    promptPer1M    : z.number().nonnegative(),
    completionPer1M: z.number().nonnegative()
  })
}).strict();

const candidateSchema = z.object({
  candidateId     : z.string().min(1),
  label           : z.string().min(1),
  primaryModelKey : z.string().min(1),
  fallbackModelKey: z.string().min(1).optional()
}).strict();

const candidateSetSchema = z.object({
  // 候选集配置版本号。
  version        : z.literal("v1"),
  // 成本展示币种。
  currency       : z.string().min(1).default("CNY"),
  // 模型目录：key -> 模型定义。
  models         : z.record(z.string().min(1), modelCatalogSchema),
  // 分阶段候选列表。
  phaseCandidates: z.object({
    ROSTER_DISCOVERY: z.array(candidateSchema).default([]),
    CHUNK_EXTRACTION: z.array(candidateSchema).default([]),
    TITLE_RESOLUTION: z.array(candidateSchema).default([]),
    BOOK_VALIDATION : z.array(candidateSchema).default([])
  }),
  // 全局默认回退模型键（可选）。
  defaults: z.object({
    fallbackModelKey: z.string().min(1).optional()
  }).optional(),
  // 备注字段（不参与逻辑）。
  notes: z.string().optional()
}).strict();

function parseArgs(argv: string[]): CliArgs {
  const pairs = new Map<string, string>();
  const flags = new Set<string>();

  // 支持 `--key value` 与独立 flag（如 `--dry-run`）两种参数形态。
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags.add(token);
      continue;
    }

    pairs.set(token, next);
    index += 1;
  }

  const phase = pairs.get("--phase") as EvalPhase | undefined;
  const bookId = pairs.get("--book-id");
  const chapterListInput = pairs.get("--chapter-list");
  const candidatePath = pairs.get("--candidate-set");
  const experimentTag = pairs.get("--experiment-tag");

  // phase 必须限制在白名单，确保后续策略键与日志 stage 对齐。
  if (!phase || !PHASE_VALUES.includes(phase)) {
    throw new Error(`--phase 必填，且必须是: ${PHASE_VALUES.join(", ")}`);
  }

  if (!bookId || !chapterListInput || !candidatePath || !experimentTag) {
    throw new Error(
      "用法: pnpm ts-node scripts/eval/run-stage-ab.ts --phase <PHASE> --book-id <BOOK_ID> --chapter-list <jsonPath|csv> --candidate-set <jsonPath> --experiment-tag <tag>"
    );
  }

  const chapterList = parseChapterListArg(chapterListInput);
  if (chapterList.length === 0) {
    throw new Error("chapter-list 不能为空");
  }

  // 轮询配置需要可计算且 >0，避免无限快轮询或永不超时。
  const pollIntervalMs = Number(pairs.get("--poll-interval-ms") ?? 3000);
  const timeoutMs = Number(pairs.get("--timeout-ms") ?? 30 * 60 * 1000);

  if (!Number.isFinite(pollIntervalMs) || pollIntervalMs <= 0) {
    throw new Error("--poll-interval-ms 必须是正数");
  }

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("--timeout-ms 必须是正数");
  }

  const baseUrl = pairs.get("--base-url") ?? process.env.ACCEPTANCE_BASE_URL ?? "http://127.0.0.1:3060";
  const adminUsername = pairs.get("--admin-username") ?? process.env.ADMIN_USERNAME ?? "";
  const adminPassword = pairs.get("--admin-password") ?? process.env.ADMIN_PASSWORD ?? "";

  // 真实执行必须有管理员凭据；dry-run 允许跳过，便于先验证配置与输出结构。
  if (!flags.has("--dry-run") && (!adminUsername || !adminPassword)) {
    throw new Error("缺少管理员账号。请提供 --admin-username/--admin-password 或设置 ADMIN_USERNAME/ADMIN_PASSWORD");
  }

  const outputPath = pairs.get("--output") ?? path.resolve("docs/eval/experiments", `${experimentTag}.json`);

  return {
    phase,
    bookId,
    chapterList,
    candidatePath,
    experimentTag,
    outputPath,
    baseUrl,
    adminUsername,
    adminPassword,
    pollIntervalMs,
    timeoutMs,
    dryRun: flags.has("--dry-run")
  };
}

/**
 * 解析章节列表参数。
 * - 支持 JSON 文件（数组）或 CSV 文本；
 * - 返回值会交给 `normalizeChapterList` 做统一清洗。
 */
function parseChapterListArg(input: string): number[] {
  if (input.endsWith(".json")) {
    const fileRaw = readFileSync(path.resolve(input), "utf8");
    const parsed: unknown = JSON.parse(fileRaw);
    if (!Array.isArray(parsed)) {
      throw new Error("chapter-list JSON 必须是数字数组");
    }

    const list = parsed.map((item) => Number(item));
    return normalizeChapterList(list);
  }

  const list = input
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));

  return normalizeChapterList(list);
}

/**
 * 章节列表归一化：
 * 1. 去重；
 * 2. 校验必须是正整数；
 * 3. 升序排序，保证输出稳定。
 */
function normalizeChapterList(chapterList: number[]): number[] {
  const dedup = Array.from(new Set(chapterList));
  for (const value of dedup) {
    if (!Number.isInteger(value) || value < 1) {
      throw new Error(`chapter-list 存在非法章节号: ${value}`);
    }
  }

  dedup.sort((a, b) => a - b);
  return dedup;
}

/**
 * 统一 HTTP 请求封装。
 *
 * @returns 包含状态码、文本、头和可选 JSON 的结构化响应，便于错误场景打印原文。
 */
async function request(baseUrl: string, pathName: string, init?: RequestInit): Promise<HttpResult> {
  const response = await fetch(`${baseUrl}${pathName}`, init);
  const text = await response.text();

  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    status : response.status,
    text,
    headers: response.headers,
    json
  };
}

/**
 * 从登录响应提取 cookie。
 * - 若 set-cookie 缺失或格式异常，直接报错，避免后续请求在“未登录”状态下产生误判。
 */
function extractCookie(setCookieHeader: string | null): string {
  if (!setCookieHeader) {
    throw new Error("登录响应缺少 set-cookie");
  }

  const cookie = setCookieHeader.split(";")[0]?.trim();
  if (!cookie || !cookie.includes("=")) {
    throw new Error(`登录 set-cookie 无效: ${setCookieHeader}`);
  }

  return cookie;
}

/**
 * 构造可能通过 Origin 校验的来源列表。
 * 业务背景：
 * - 某些环境下服务端会校验 origin 与 host；
 * - 本地测试常见 `localhost` / `127.0.0.1` 混用，因此这里做候选尝试。
 */
function candidateOrigins(baseUrl: string): string[] {
  const parsed = new URL(baseUrl);
  const origins = new Set<string>();

  origins.add(parsed.origin);
  origins.add(`${parsed.protocol}//localhost${parsed.port ? `:${parsed.port}` : ""}`);
  origins.add(`${parsed.protocol}//127.0.0.1${parsed.port ? `:${parsed.port}` : ""}`);

  return Array.from(origins);
}

/**
 * 管理员登录并获取 cookie。
 *
 * @returns 可用于后续管理接口调用的 cookie 字符串
 */
async function login(baseUrl: string, username: string, password: string): Promise<string> {
  let lastError = "";

  for (const origin of candidateOrigins(baseUrl)) {
    const result = await request(baseUrl, "/api/auth/login", {
      method : "POST",
      headers: {
        "content-type": "application/json",
        origin
      },
      body: JSON.stringify({
        identifier: username,
        password,
        redirect  : "/admin"
      })
    });

    if (result.status === 200) {
      return extractCookie(result.headers.get("set-cookie"));
    }

    lastError = `${result.status}: ${result.text.slice(0, 200)}`;
  }

  throw new Error(`管理员登录失败: ${lastError}`);
}

/**
 * 在真实运行模式下，将候选集中的模型键解析到数据库中的已启用模型。
 * 这样可确保实际分析任务使用的是“已在系统启用”的模型，而不是仅存在于配置文件中的占位定义。
 */
async function resolveModel(
  prisma: PrismaClient,
  modelKey: string,
  modelCatalog: z.infer<typeof modelCatalogSchema>
): Promise<ResolvedModel> {
  const dbModel = await prisma.aiModel.findFirst({
    where: {
      provider : modelCatalog.provider,
      modelId  : modelCatalog.modelId,
      isEnabled: true
    },
    select: {
      id      : true,
      name    : true,
      provider: true,
      modelId : true
    }
  });

  if (!dbModel) {
    throw new Error(`候选模型未在 ai_models 中启用: ${modelCatalog.provider}/${modelCatalog.modelId}`);
  }

  return {
    key            : modelKey,
    displayName    : dbModel.name,
    provider       : dbModel.provider,
    apiModelId     : dbModel.modelId,
    dbModelId      : dbModel.id,
    promptPer1M    : modelCatalog.pricing.promptPer1M,
    completionPer1M: modelCatalog.pricing.completionPer1M
  };
}

/**
 * 干跑模式的模型解析：
 * - 不依赖数据库；
 * - 生成可追踪但不会被线上策略误用的占位 `dbModelId`。
 */
function resolveDryRunModel(
  modelKey: string,
  modelCatalog: z.infer<typeof modelCatalogSchema>
): ResolvedModel {
  return {
    key            : modelKey,
    displayName    : modelCatalog.displayName,
    provider       : modelCatalog.provider,
    apiModelId     : modelCatalog.modelId,
    dbModelId      : `DRY_RUN::${modelCatalog.provider}::${modelCatalog.modelId}`,
    promptPer1M    : modelCatalog.pricing.promptPer1M,
    completionPer1M: modelCatalog.pricing.completionPer1M
  };
}

/**
 * 轮询等待任务结束。
 *
 * @returns 任务终态快照（含耗时）
 *
 * 设计原因：
 * - 后台分析是异步任务，HTTP 202 仅代表入队成功；
 * - 评估脚本必须拿到终态，才能继续采集预测与成本数据。
 */
async function waitJobFinished(
  prisma: PrismaClient,
  jobId: string,
  pollIntervalMs: number,
  timeoutMs: number
) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    const job = await prisma.analysisJob.findUnique({
      where : { id: jobId },
      select: {
        id        : true,
        status    : true,
        startedAt : true,
        finishedAt: true,
        errorLog  : true
      }
    });

    if (!job) {
      throw new Error(`任务不存在: ${jobId}`);
    }

    if (
      job.status === AnalysisJobStatus.SUCCEEDED
      || job.status === AnalysisJobStatus.FAILED
      || job.status === AnalysisJobStatus.CANCELED
    ) {
      const durationMs = job.startedAt && job.finishedAt
        ? Math.max(0, job.finishedAt.getTime() - job.startedAt.getTime())
        : null;

      return {
        id        : job.id,
        status    : job.status,
        startedAt : job.startedAt?.toISOString() ?? null,
        finishedAt: job.finishedAt?.toISOString() ?? null,
        durationMs,
        errorLog  : job.errorLog
      };
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(`任务超时未完成: ${jobId}`);
}

/**
 * 汇总某本书指定章节的预测产物。
 * - 人物来源：AI mention；
 * - 关系来源：AI relationship；
 * - 输出按章节稳定排序，保证实验结果可复现比对。
 */
async function collectPredictions(prisma: PrismaClient, bookId: string, chapterList: number[]) {
  const chapters = await prisma.chapter.findMany({
    where: {
      bookId,
      no: { in: chapterList }
    },
    select: {
      id     : true,
      no     : true,
      content: true
    }
  });

  const chapterMap = new Map<number, {
    chapterNo    : number;
    textLength   : number;
    personaNames : Set<string>;
    relationships: Map<string, { source: string; target: string; type: string }>;
  }>();

  for (const chapter of chapters) {
    chapterMap.set(chapter.no, {
      chapterNo    : chapter.no,
      textLength   : chapter.content.length,
      personaNames : new Set<string>(),
      relationships: new Map<string, { source: string; target: string; type: string }>()
    });
  }

  const chapterIds = chapters.map((item) => item.id);
  if (chapterIds.length > 0) {
    const mentions = await prisma.mention.findMany({
      where: {
        deletedAt   : null,
        recordSource: "AI",
        chapterId   : { in: chapterIds }
      },
      select: {
        chapterId: true,
        chapter  : {
          select: { no: true }
        },
        persona: {
          select: {
            name: true
          }
        }
      }
    });

    for (const mention of mentions) {
      const chapterNo = mention.chapter.no;
      const chapter = chapterMap.get(chapterNo);
      if (!chapter) {
        // 保护性分支：理论上不会出现，但保留以容忍脏数据。
        continue;
      }

      chapter.personaNames.add(mention.persona.name.trim());
    }

    const relationships = await prisma.relationship.findMany({
      where: {
        deletedAt   : null,
        recordSource: "AI",
        chapterId   : { in: chapterIds }
      },
      select: {
        type   : true,
        chapter: {
          select: { no: true }
        },
        source: {
          select: { name: true }
        },
        target: {
          select: { name: true }
        }
      }
    });

    for (const relation of relationships) {
      const chapterNo = relation.chapter.no;
      const chapter = chapterMap.get(chapterNo);
      if (!chapter) {
        // 同上，避免异常数据导致整批评估中断。
        continue;
      }

      const source = relation.source.name.trim();
      const target = relation.target.name.trim();
      const type = relation.type.trim();
      const key = `${source}::${target}::${type}`;

      chapter.relationships.set(key, {
        source,
        target,
        type
      });
    }
  }

  const orderedChapters = chapterList.map((chapterNo) => {
    const chapter = chapterMap.get(chapterNo);
    if (!chapter) {
      return {
        chapterNo,
        textLength   : 0,
        personaNames : [],
        relationships: []
      };
    }

    return {
      chapterNo,
      textLength   : chapter.textLength,
      personaNames : Array.from(chapter.personaNames).sort((a, b) => a.localeCompare(b, "zh-Hans-CN")),
      relationships: Array.from(chapter.relationships.values()).sort((a, b) => {
        const left = `${a.source}|${a.target}|${a.type}`;
        const right = `${b.source}|${b.target}|${b.type}`;
        return left.localeCompare(right, "zh-Hans-CN");
      })
    };
  });

  return {
    chapterCount     : orderedChapters.length,
    personaCount     : orderedChapters.reduce((sum, item) => sum + item.personaNames.length, 0),
    relationshipCount: orderedChapters.reduce((sum, item) => sum + item.relationships.length, 0),
    chapters         : orderedChapters,
    totalTextChars   : orderedChapters.reduce((sum, item) => sum + item.textLength, 0)
  };
}

/**
 * 汇总阶段日志并估算成本。
 *
 * @param prisma Prisma 客户端
 * @param jobId 分析任务 ID
 * @param phase 当前评估阶段
 * @param primary 主模型定价信息
 * @param fallback 回退模型定价信息
 * @param totalTextChars 预测总文本字数（用于计算每万字成本）
 * @param currency 币种
 * @returns 阶段调用统计与成本估算
 */
async function collectStageLogs(
  prisma: PrismaClient,
  jobId: string,
  phase: EvalPhase,
  primary: ResolvedModel,
  fallback: ResolvedModel | null,
  totalTextChars: number,
  currency: string
) {
  // 仅采集当前任务、当前阶段的日志，防止跨阶段污染统计。
  const logs = await prisma.analysisPhaseLog.findMany({
    where: {
      jobId,
      stage: phase
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select : {
      chapterId       : true,
      chunkIndex      : true,
      status          : true,
      isFallback      : true,
      promptTokens    : true,
      completionTokens: true,
      durationMs      : true,
      model           : {
        select: {
          provider: true,
          modelId : true
        }
      }
    }
  });

  let successCalls = 0;
  let retriedCalls = 0;
  let errorCalls = 0;
  let fallbackCalls = 0;
  let promptTokens = 0;
  let completionTokens = 0;
  let totalDurationMs = 0;
  let totalCost = 0;
  let missingPricingEvents = 0;

  // 定价映射来自当前候选主/回退模型，避免拿错模型价格。
  const pricingMap = new Map<string, { prompt: number; completion: number }>();
  pricingMap.set(`${primary.provider}::${primary.apiModelId}`, {
    prompt    : primary.promptPer1M,
    completion: primary.completionPer1M
  });

  if (fallback) {
    pricingMap.set(`${fallback.provider}::${fallback.apiModelId}`, {
      prompt    : fallback.promptPer1M,
      completion: fallback.completionPer1M
    });
  }

  // 按“章节+分片”聚合调用序列，用于判定单次调用终态与重试次数。
  const groupedCalls = new Map<string, typeof logs>();
  for (const log of logs) {
    const key = `${phase}::${log.chapterId ?? "_"}::${log.chunkIndex ?? "_"}`;
    const group = groupedCalls.get(key);
    if (group) {
      group.push(log);
    } else {
      groupedCalls.set(key, [log]);
    }
  }

  for (const groupLogs of groupedCalls.values()) {
    // 最后一条日志视为该调用的终态。
    const finalLog = groupLogs[groupLogs.length - 1];
    if (finalLog.status === "SUCCESS") {
      successCalls += 1;
    } else if (finalLog.status === "ERROR") {
      errorCalls += 1;
    }

    if (finalLog.isFallback && finalLog.status === "SUCCESS") {
      // 只统计“最终成功并走了回退模型”的情况。
      fallbackCalls += 1;
    }

    for (const log of groupLogs) {
      if (log.status === "RETRIED") {
        retriedCalls += 1;
      }

      const prompt = log.promptTokens ?? 0;
      const completion = log.completionTokens ?? 0;
      promptTokens += prompt;
      completionTokens += completion;
      totalDurationMs += log.durationMs ?? 0;

      const provider = log.model?.provider;
      const modelId = log.model?.modelId;
      if (!provider || !modelId) {
        // 缺少模型信息时无法估算成本，记录缺失事件但不中断流程。
        missingPricingEvents += 1;
        continue;
      }

      const pricing = pricingMap.get(`${provider}::${modelId}`);
      if (!pricing) {
        // 模型不在候选定价表中，同样记缺失。
        missingPricingEvents += 1;
        continue;
      }

      totalCost += (prompt / 1_000_000) * pricing.prompt;
      totalCost += (completion / 1_000_000) * pricing.completion;
    }
  }

  // 终态调用分母不包含 RETRIED（它是中间状态）。
  const terminalCalls = successCalls + errorCalls;

  return {
    stageLogs: {
      totalCalls     : groupedCalls.size,
      successCalls,
      retriedCalls,
      errorCalls,
      fallbackCalls,
      promptTokens,
      completionTokens,
      totalDurationMs,
      jsonSuccessRate: terminalCalls > 0 ? successCalls / terminalCalls : null
    },
    estimatedCost: {
      currency,
      total      : Number(totalCost.toFixed(6)),
      per10kChars: totalTextChars > 0 ? Number(((totalCost / totalTextChars) * 10000).toFixed(6)) : null,
      missingPricingEvents
    }
  };
}

/**
 * 脚本主入口：
 * - 负责串起参数解析、候选执行、结果输出三个阶段。
 */
async function main() {
  const args = parseArgs(process.argv.slice(2));

  // 候选集是实验执行的契约输入，先做强校验防止半途失败。
  const candidateSetRaw = await fs.readFile(path.resolve(args.candidatePath), "utf8");
  const parsedCandidateSet = candidateSetSchema.safeParse(JSON.parse(candidateSetRaw));
  if (!parsedCandidateSet.success) {
    throw new Error(`candidate-set 格式无效: ${parsedCandidateSet.error.issues[0]?.message ?? "unknown"}`);
  }

  const candidateSet = parsedCandidateSet.data;
  const candidates = candidateSet.phaseCandidates[args.phase];
  if (!candidates || candidates.length === 0) {
    // 当前阶段没有候选属于配置错误，不能输出空结果“假成功”。
    throw new Error(`阶段 ${args.phase} 在候选池中没有配置候选项`);
  }

  const databaseUrl = process.env.DATABASE_URL;
  const prisma = args.dryRun
    ? null
    : (() => {
      if (!databaseUrl) {
        throw new Error("缺少 DATABASE_URL 环境变量");
      }

      // 仅真实执行需要数据库：读取任务状态、阶段日志、预测数据。
      return new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl })
      });
    })();

  let cookie = "";

  try {
    if (!args.dryRun) {
      // 真实执行先登录拿 cookie，后续管理接口都依赖该会话。
      cookie = await login(args.baseUrl, args.adminUsername, args.adminPassword);
    }

    const runs: CandidateRun[] = [];

    for (const candidate of candidates) {
      // 主模型必须在候选集 models 中定义，这是最基本的配置完整性约束。
      const primaryModelCatalog = candidateSet.models[candidate.primaryModelKey];
      if (!primaryModelCatalog) {
        throw new Error(`候选项 ${candidate.candidateId} 的 primaryModelKey 未在 models 中定义`);
      }

      // fallbackKey 优先取候选局部配置，否则回退全局默认配置。
      const fallbackKey = candidate.fallbackModelKey ?? candidateSet.defaults?.fallbackModelKey;
      const fallbackModelCatalog = fallbackKey ? candidateSet.models[fallbackKey] : undefined;
      if (fallbackKey && !fallbackModelCatalog) {
        throw new Error(`候选项 ${candidate.candidateId} 的 fallbackModelKey 未在 models 中定义: ${fallbackKey}`);
      }

      const primary = args.dryRun
        ? resolveDryRunModel(candidate.primaryModelKey, primaryModelCatalog)
        : await resolveModel(prisma!, candidate.primaryModelKey, primaryModelCatalog);
      const fallback = args.dryRun
        ? (fallbackModelCatalog ? resolveDryRunModel(fallbackKey!, fallbackModelCatalog) : null)
        : (fallbackModelCatalog ? await resolveModel(prisma!, fallbackKey!, fallbackModelCatalog) : null);

      // 仅覆盖当前阶段策略，避免无意影响其他阶段的模型选择。
      const modelStrategy: Record<string, { modelId: string }> = {
        [args.phase]: {
          modelId: primary.dbModelId
        }
      };

      if (fallback) {
        modelStrategy.FALLBACK = {
          modelId: fallback.dbModelId
        };
      }

      if (args.dryRun) {
        // dry-run 仅验证候选解析与输出结构，不发起真实分析任务。
        runs.push({
          candidateId: candidate.candidateId,
          label      : candidate.label,
          primary,
          fallback,
          job        : {
            id        : "DRY_RUN",
            status    : AnalysisJobStatus.QUEUED,
            startedAt : null,
            finishedAt: null,
            durationMs: null,
            errorLog  : null
          },
          stageLogs: {
            totalCalls      : 0,
            successCalls    : 0,
            retriedCalls    : 0,
            errorCalls      : 0,
            fallbackCalls   : 0,
            promptTokens    : 0,
            completionTokens: 0,
            totalDurationMs : 0,
            jsonSuccessRate : null
          },
          estimatedCost: {
            currency            : candidateSet.currency,
            total               : 0,
            per10kChars         : null,
            missingPricingEvents: 0
          },
          predictions: {
            chapterCount     : args.chapterList.length,
            personaCount     : 0,
            relationshipCount: 0,
            chapters         : args.chapterList.map((chapterNo) => ({
              chapterNo,
              textLength   : 0,
              personaNames : [],
              relationships: []
            }))
          }
        });
        continue;
      }

      // 真实模式下触发分析任务，接口约定成功时返回 202（已受理）。
      const startResult = await request(args.baseUrl, `/api/books/${args.bookId}/analyze`, {
        method : "POST",
        headers: {
          "content-type": "application/json",
          cookie
        },
        body: JSON.stringify({
          scope           : "CHAPTER_LIST",
          chapterIndices  : args.chapterList,
          overrideStrategy: "ALL_DRAFTS",
          keepHistory     : false,
          modelStrategy
        })
      });

      if (startResult.status !== 202) {
        throw new Error(`启动任务失败(${candidate.candidateId}): HTTP ${startResult.status} ${startResult.text.slice(0, 240)}`);
      }

      const startBody = startResult.json as {
        success?: boolean;
        data?: {
          jobId?: string;
        };
      };

      const jobId = startBody?.data?.jobId;
      if (!jobId) {
        throw new Error(`启动任务返回缺少 jobId (${candidate.candidateId})`);
      }

      // 把实验标签回写任务记录，方便线上任务与离线实验报告互相追溯。
      await prisma!.analysisJob.update({
        where: { id: jobId },
        data : {
          experimentTag: `${args.experimentTag}:${args.phase}:${candidate.candidateId}`
        }
      });

      // 先拿终态，再采集预测与成本，确保统计口径完整一致。
      const job = await waitJobFinished(prisma!, jobId, args.pollIntervalMs, args.timeoutMs);
      const predictions = await collectPredictions(prisma!, args.bookId, args.chapterList);
      const costAndLogs = await collectStageLogs(
        prisma!,
        jobId,
        args.phase,
        primary,
        fallback,
        predictions.totalTextChars,
        candidateSet.currency
      );

      runs.push({
        candidateId  : candidate.candidateId,
        label        : candidate.label,
        primary,
        fallback,
        job,
        stageLogs    : costAndLogs.stageLogs,
        estimatedCost: costAndLogs.estimatedCost,
        predictions  : {
          chapterCount     : predictions.chapterCount,
          personaCount     : predictions.personaCount,
          relationshipCount: predictions.relationshipCount,
          chapters         : predictions.chapters
        }
      });
    }

    // 输出结构是下游 `compute-metrics` 的输入契约，字段不可随意改名。
    const output = {
      version         : "eval-experiment.v1",
      generatedAt     : new Date().toISOString(),
      experimentTag   : args.experimentTag,
      phase           : args.phase,
      bookId          : args.bookId,
      chapterList     : args.chapterList,
      candidateSetPath: path.resolve(args.candidatePath),
      source          : {
        baseUrl : args.baseUrl,
        dryRun  : args.dryRun,
        currency: candidateSet.currency
      },
      runs
    };

    await fs.mkdir(path.dirname(args.outputPath), { recursive: true });
    await fs.writeFile(args.outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");

    // 结构化摘要便于 CI 直接解析。
    console.log(JSON.stringify({
      success       : true,
      code          : "EVAL_STAGE_AB_COMPLETED",
      outputPath    : args.outputPath,
      phase         : args.phase,
      experimentTag : args.experimentTag,
      candidateCount: runs.length,
      dryRun        : args.dryRun
    }, null, 2));
  } finally {
    // 无论成功失败都释放连接，避免脚本进程挂住。
    await prisma?.$disconnect();
  }
}

main().catch((error: unknown) => {
  // 异常统一包装成 JSON，便于上游日志系统聚合。
  console.error(JSON.stringify({
    success: false,
    code   : "EVAL_STAGE_AB_FAILED",
    message: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exit(1);
});
