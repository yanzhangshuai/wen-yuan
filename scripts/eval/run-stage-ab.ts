import "dotenv/config";

import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";

import { PrismaPg } from "@prisma/adapter-pg";
import { z } from "zod";

import {
  AnalysisJobStatus,
  PrismaClient
} from "../../src/generated/prisma/client.ts";

type EvalPhase = "ROSTER_DISCOVERY" | "CHUNK_EXTRACTION" | "TITLE_RESOLUTION" | "BOOK_VALIDATION";

interface CliArgs {
  phase         : EvalPhase;
  bookId        : string;
  chapterList   : number[];
  candidatePath : string;
  experimentTag : string;
  outputPath    : string;
  baseUrl       : string;
  adminUsername : string;
  adminPassword : string;
  pollIntervalMs: number;
  timeoutMs     : number;
  dryRun        : boolean;
}

interface HttpResult {
  status : number;
  text   : string;
  headers: Headers;
  json   : unknown;
}

interface ResolvedModel {
  key            : string;
  displayName    : string;
  provider       : string;
  apiModelId     : string;
  dbModelId      : string;
  promptPer1M    : number;
  completionPer1M: number;
}

interface CandidateRun {
  candidateId: string;
  label      : string;
  primary    : ResolvedModel;
  fallback   : ResolvedModel | null;
  job        : {
    id        : string;
    status    : AnalysisJobStatus;
    startedAt : string | null;
    finishedAt: string | null;
    durationMs: number | null;
    errorLog  : string | null;
  };
  stageLogs: {
    totalCalls      : number;
    successCalls    : number;
    retriedCalls    : number;
    errorCalls      : number;
    fallbackCalls   : number;
    promptTokens    : number;
    completionTokens: number;
    totalDurationMs : number;
    jsonSuccessRate : number | null;
  };
  estimatedCost: {
    currency            : string;
    total               : number;
    per10kChars         : number | null;
    missingPricingEvents: number;
  };
  predictions: {
    chapterCount     : number;
    personaCount     : number;
    relationshipCount: number;
    chapters: Array<{
      chapterNo    : number;
      textLength   : number;
      personaNames : string[];
      relationships: Array<{
        source: string;
        target: string;
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
  version        : z.literal("v1"),
  currency       : z.string().min(1).default("CNY"),
  models         : z.record(z.string().min(1), modelCatalogSchema),
  phaseCandidates: z.object({
    ROSTER_DISCOVERY: z.array(candidateSchema).default([]),
    CHUNK_EXTRACTION: z.array(candidateSchema).default([]),
    TITLE_RESOLUTION: z.array(candidateSchema).default([]),
    BOOK_VALIDATION : z.array(candidateSchema).default([])
  }),
  defaults: z.object({
    fallbackModelKey: z.string().min(1).optional()
  }).optional(),
  notes: z.string().optional()
}).strict();

function parseArgs(argv: string[]): CliArgs {
  const pairs = new Map<string, string>();
  const flags = new Set<string>();

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

function candidateOrigins(baseUrl: string): string[] {
  const parsed = new URL(baseUrl);
  const origins = new Set<string>();

  origins.add(parsed.origin);
  origins.add(`${parsed.protocol}//localhost${parsed.port ? `:${parsed.port}` : ""}`);
  origins.add(`${parsed.protocol}//127.0.0.1${parsed.port ? `:${parsed.port}` : ""}`);

  return Array.from(origins);
}

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

async function collectStageLogs(
  prisma: PrismaClient,
  jobId: string,
  phase: EvalPhase,
  primary: ResolvedModel,
  fallback: ResolvedModel | null,
  totalTextChars: number,
  currency: string
) {
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
    const finalLog = groupLogs[groupLogs.length - 1];
    if (finalLog.status === "SUCCESS") {
      successCalls += 1;
    } else if (finalLog.status === "ERROR") {
      errorCalls += 1;
    }

    if (finalLog.isFallback && finalLog.status === "SUCCESS") {
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
        missingPricingEvents += 1;
        continue;
      }

      const pricing = pricingMap.get(`${provider}::${modelId}`);
      if (!pricing) {
        missingPricingEvents += 1;
        continue;
      }

      totalCost += (prompt / 1_000_000) * pricing.prompt;
      totalCost += (completion / 1_000_000) * pricing.completion;
    }
  }

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

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const candidateSetRaw = await fs.readFile(path.resolve(args.candidatePath), "utf8");
  const parsedCandidateSet = candidateSetSchema.safeParse(JSON.parse(candidateSetRaw));
  if (!parsedCandidateSet.success) {
    throw new Error(`candidate-set 格式无效: ${parsedCandidateSet.error.issues[0]?.message ?? "unknown"}`);
  }

  const candidateSet = parsedCandidateSet.data;
  const candidates = candidateSet.phaseCandidates[args.phase];
  if (!candidates || candidates.length === 0) {
    throw new Error(`阶段 ${args.phase} 在候选池中没有配置候选项`);
  }

  const databaseUrl = process.env.DATABASE_URL;
  const prisma = args.dryRun
    ? null
    : (() => {
      if (!databaseUrl) {
        throw new Error("缺少 DATABASE_URL 环境变量");
      }

      return new PrismaClient({
        adapter: new PrismaPg({ connectionString: databaseUrl })
      });
    })();

  let cookie = "";

  try {
    if (!args.dryRun) {
      cookie = await login(args.baseUrl, args.adminUsername, args.adminPassword);
    }

    const runs: CandidateRun[] = [];

    for (const candidate of candidates) {
      const primaryModelCatalog = candidateSet.models[candidate.primaryModelKey];
      if (!primaryModelCatalog) {
        throw new Error(`候选项 ${candidate.candidateId} 的 primaryModelKey 未在 models 中定义`);
      }

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

      await prisma!.analysisJob.update({
        where: { id: jobId },
        data : {
          experimentTag: `${args.experimentTag}:${args.phase}:${candidate.candidateId}`
        }
      });

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
    await prisma?.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({
    success: false,
    code   : "EVAL_STAGE_AB_FAILED",
    message: error instanceof Error ? error.message : String(error)
  }, null, 2));
  process.exit(1);
});
