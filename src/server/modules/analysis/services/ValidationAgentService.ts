import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { aiCallExecutor, type AiCallExecutor } from "@/server/modules/analysis/services/AiCallExecutor";
import {
  modelStrategyResolver,
  type ModelStrategyResolver,
  type ResolvedFallbackModel,
  type ResolvedStageModel
} from "@/server/modules/analysis/services/ModelStrategyResolver";
import { createMergePersonasService } from "@/server/modules/personas/mergePersonas";
import { parseValidationResponse } from "@/server/modules/analysis/services/prompts";
import { resolvePromptTemplate } from "@/server/modules/knowledge";
import { createAiProviderClient, type AiProviderClient } from "@/server/providers/ai";
import type { AnalysisProfileContext } from "@/types/analysis";
import { ANALYSIS_PIPELINE_CONFIG } from "@/server/modules/analysis/config/pipeline";
import { PipelineStage } from "@/types/pipeline";
import type {
  ValidationIssue,
  ValidationReportData,
  ValidationSeverity,
  ValidationSummary
} from "@/types/validation";

/**
 * 文件定位（Next.js 服务端分析域）：
 * - 本文件位于 `src/server/modules/analysis/services`，负责“章节/整书自检（Validation）”能力。
 * - 它不直接参与 app router 的页面渲染，而是在解析任务执行链路中由 `runAnalysisJob` 调用。
 *
 * 核心职责：
 * - 组织 Prompt，调用 AI 校验结果，产出结构化 `ValidationIssue`；
 * - 将校验结果持久化为 `validationReport`，供后台审核页与自动修复流程复用；
 * - 在业务允许范围内执行自动修复（合并人物、补别名、更新名称）。
 *
 * 业务边界：
 * - 这里的阈值（`VALIDATION_MIN_CONFIDENCE` / `AUTO_FIX_CONFIDENCE`）属于业务规则，不是技术限制。
 * - 自动修复默认保守执行，宁可少修复也不误修复，以保护图谱一致性。
 */
export interface ChapterValidationInput {
  /** 所属书籍 ID，用于定位校验上下文。 */
  bookId          : string;
  /** 当前章节 ID，对应章节级报告绑定键。 */
  chapterId       : string;
  /** 章节序号，用于 Prompt 上下文与日志定位。 */
  chapterNo       : number;
  /** 章节内容（通常为截断后的片段），用于让模型审阅证据。 */
  chapterContent  : string;
  /** 所属分析任务 ID。 */
  jobId           : string;
  /** 本章新建人物快照（供模型检查重复/误建）。 */
  newPersonas     : Array<{ id: string; name: string; confidence: number; nameType: string }>;
  /** 本章提及快照（供模型核对人物-文本引用）。 */
  newMentions     : Array<{ personaId: string; rawText: string }>;
  /** 本章关系快照（供模型检查冲突关系或反向关系）。 */
  newRelationships: Array<{ sourceId: string; targetId: string; type: string }>;
  /** 历史已存在人物档案（用于与新结果对照）。 */
  existingProfiles: AnalysisProfileContext[];
}

/**
 * 自检服务对外契约。
 */
export interface ValidationAgentService {
  /** 章节级自检：返回单章问题清单与摘要。 */
  validateChapterResult(input: ChapterValidationInput): Promise<ValidationReportData>;
  /** 整书级自检：从全书汇总数据中识别系统性问题。 */
  validateBookResult(bookId: string, jobId: string): Promise<ValidationReportData>;
  /** 列出某书全部自检报告（按时间倒序）。 */
  listValidationReports(bookId: string): Promise<Array<{
    id       : string;
    bookId   : string;
    jobId    : string | null;
    scope    : string;
    chapterId: string | null;
    status   : string;
    summary  : ValidationSummary;
    createdAt: string;
  }>>;
  /** 获取单条报告详情（限定 bookId，防越权读取）。 */
  getValidationReportDetail(bookId: string, reportId: string): Promise<{
    id       : string;
    bookId   : string;
    jobId    : string | null;
    scope    : string;
    chapterId: string | null;
    status   : string;
    summary  : ValidationSummary;
    issues   : ValidationIssue[];
    createdAt: string;
  } | null>;
  /** 按阈值执行自动修复，返回成功应用的修复条数。 */
  applyAutoFixes(reportId: string): Promise<number>;
}

/** 允许自动执行的动作白名单。未知动作一律不自动执行，避免模型输出漂移造成误改数据。 */
const AUTO_FIX_ACTIONS = new Set(["MERGE", "ADD_ALIAS", "UPDATE_NAME"]);

/** 验证结果最低置信度阈值：低于此值的 issue 将被过滤 */
const VALIDATION_MIN_CONFIDENCE = 0.6;

/** 按 action 类型分层的自动修复置信度阈值 */
const AUTO_FIX_CONFIDENCE: Record<string, number> = {
  MERGE      : 0.9,
  ADD_ALIAS  : 0.8,
  UPDATE_NAME: 0.85
};

/** 名字输入归一化：当前仅 trim，避免把空白差异误判为新名字。 */
function normalizeName(value: string): string {
  return value.trim();
}

/** 运行时类型守卫：校验“普通对象”形态（非数组、非 null）。 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 去重并剔除空字符串。常用于聚合 personaId / alias 这类可重复输入。 */
function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((item): item is string => Boolean(item && item.trim()))));
}

/**
 * 从 Prisma JsonValue 字段直接解析 ValidationIssue[]，避免 JSON.stringify + parseValidationResponse 的双重序列化。
 * 当字段已是对象/数组时直接使用；仅在为字符串时 fallback 到 parseValidationResponse。
 */
function parseJsonFieldAsValidationIssues(field: Prisma.JsonValue): ValidationIssue[] {
  if (typeof field === "string") {
    return parseValidationResponse(field);
  }
  if (Array.isArray(field)) {
    return parseValidationResponse(JSON.stringify(field));
  }
  if (isRecord(field) && Array.isArray(field.issues)) {
    return parseValidationResponse(JSON.stringify(field.issues));
  }
  return [];
}

function parseValidationSummary(value: Prisma.JsonValue): ValidationSummary {
  // 容错：历史脏数据或字段结构异常时返回零值，保证接口稳定返回。
  if (!isRecord(value)) {
    return {
      totalIssues : 0,
      errorCount  : 0,
      warningCount: 0,
      infoCount   : 0,
      autoFixable : 0,
      needsReview : 0
    };
  }

  return {
    totalIssues : typeof value.totalIssues === "number" ? value.totalIssues : 0,
    errorCount  : typeof value.errorCount === "number" ? value.errorCount : 0,
    warningCount: typeof value.warningCount === "number" ? value.warningCount : 0,
    infoCount   : typeof value.infoCount === "number" ? value.infoCount : 0,
    autoFixable : typeof value.autoFixable === "number" ? value.autoFixable : 0,
    needsReview : typeof value.needsReview === "number" ? value.needsReview : 0
  };
}

/**
 * 对 issue 中的人物引用做“存活校验”。
 * 目的：报告生成到应用之间可能发生人物删除/合并，必须过滤失效 ID 避免后续操作报错。
 */
function sanitizeIssuesByPersona(issues: ValidationIssue[], validPersonaIds: Set<string>): ValidationIssue[] {
  return issues
    .map((issue) => {
      const affectedPersonaIds = issue.affectedPersonaIds.filter((id) => validPersonaIds.has(id));
      const targetPersonaId = issue.suggestion.targetPersonaId && validPersonaIds.has(issue.suggestion.targetPersonaId)
        ? issue.suggestion.targetPersonaId
        : undefined;
      const sourcePersonaId = issue.suggestion.sourcePersonaId && validPersonaIds.has(issue.suggestion.sourcePersonaId)
        ? issue.suggestion.sourcePersonaId
        : undefined;

      return {
        ...issue,
        affectedPersonaIds,
        suggestion: {
          ...issue.suggestion,
          targetPersonaId,
          sourcePersonaId
        }
      };
    })
    // 没有任何有效受影响人物时，该问题已无法落地处理，直接剔除。
    .filter((issue) => issue.affectedPersonaIds.length > 0);
}

/**
 * 根据 issue 列表生成汇总指标。
 * `needsReview = total - autoFixable` 是明确业务定义，用于后台待人工复核计数。
 */
function buildSummary(issues: ValidationIssue[]): ValidationSummary {
  const countBySeverity = issues.reduce<Record<ValidationSeverity, number>>((acc, issue) => {
    acc[issue.severity] += 1;
    return acc;
  }, {
    ERROR  : 0,
    WARNING: 0,
    INFO   : 0
  });

  const autoFixable = issues.filter((issue) => {
    const threshold = AUTO_FIX_CONFIDENCE[issue.suggestion.action] ?? 0.9;
    return issue.confidence >= threshold && AUTO_FIX_ACTIONS.has(issue.suggestion.action);
  }).length;

  return {
    totalIssues : issues.length,
    errorCount  : countBySeverity.ERROR,
    warningCount: countBySeverity.WARNING,
    infoCount   : countBySeverity.INFO,
    autoFixable,
    needsReview : Math.max(0, issues.length - autoFixable)
  };
}

export function createValidationAgentService(
  prismaClient: PrismaClient = prisma,
  stageAiCallExecutor: AiCallExecutor = aiCallExecutor,
  _strategyResolver: ModelStrategyResolver = modelStrategyResolver
): ValidationAgentService {
  const { mergePersonas } = createMergePersonasService(prismaClient);
  // 同一 modelId 复用同一个 provider client，减少重复初始化和连接开销。
  const runtimeAiClientCache = new Map<string, AiProviderClient>();

  /** 将策略模型参数转成 provider 调用参数，统一不同 stage 的执行入口。 */
  function toGenerateOptions(model: ResolvedStageModel | ResolvedFallbackModel) {
    return {
      temperature    : model.params.temperature,
      maxOutputTokens: model.params.maxOutputTokens,
      topP           : model.params.topP,
      ...(typeof model.params.enableThinking === "boolean"
        ? { enableThinking: model.params.enableThinking }
        : {}),
      ...(model.params.reasoningEffort
        ? { reasoningEffort: model.params.reasoningEffort }
        : {})
    };
  }

  /** 运行时获取 AI 客户端：有缓存走缓存，无缓存按模型配置创建。 */
  function getRuntimeAiClient(model: ResolvedStageModel | ResolvedFallbackModel): AiProviderClient {
    const cached = runtimeAiClientCache.get(model.modelId);
    if (cached) {
      return cached;
    }

    const client = createAiProviderClient({
      provider : model.provider,
      protocol : model.protocol,
      apiKey   : model.apiKey,
      baseUrl  : model.baseUrl,
      modelName: model.modelName
    });
    runtimeAiClientCache.set(model.modelId, client);
    return client;
  }

  async function executeValidationStage(input: {
    stage     : PipelineStage.CHAPTER_VALIDATION | PipelineStage.BOOK_VALIDATION;
    prompt    : { system: string; user: string };
    bookId    : string;
    jobId     : string;
    chapterId?: string;
  }): Promise<string> {
    // 有 jobId 时必须走 AiCallExecutor，确保 token/时长/fallback 等阶段日志可追踪。
    const result = await stageAiCallExecutor.execute({
      stage    : input.stage,
      prompt   : input.prompt,
      jobId    : input.jobId,
      chapterId: input.chapterId,
      context  : {
        jobId : input.jobId,
        bookId: input.bookId
      },
      callFn: async ({ model, prompt }) => {
        const runtimeClient = getRuntimeAiClient(model);
        const generated = await runtimeClient.generateJson(prompt, toGenerateOptions(model));
        return {
          data : generated.content,
          usage: generated.usage
        };
      }
    });

    return result.data;
  }

  /** 校验 personaId 是否仍然有效（存在且未软删）。 */
  async function ensureValidPersonaIds(personaIds: string[]): Promise<Set<string>> {
    if (personaIds.length === 0) {
      return new Set();
    }

    const rows = await prismaClient.persona.findMany({
      where : { id: { in: personaIds }, deletedAt: null },
      select: { id: true }
    });

    return new Set(rows.map((row) => row.id));
  }

  /** 创建并持久化自检报告。 */
  async function createValidationReport(input: {
    bookId    : string;
    jobId?    : string;
    scope     : string;
    chapterId?: string;
    issues    : ValidationIssue[];
    summary   : ValidationSummary;
  }): Promise<ValidationReportData> {
    const report = await prismaClient.validationReport.create({
      data: {
        bookId   : input.bookId,
        jobId    : input.jobId ?? null,
        scope    : input.scope,
        chapterId: input.chapterId ?? null,
        status   : "PENDING",
        issues   : input.issues as unknown as Prisma.InputJsonValue,
        summary  : input.summary as unknown as Prisma.InputJsonValue
      },
      select: { id: true }
    });

    return {
      id     : report.id,
      issues : input.issues,
      summary: input.summary
    };
  }

  /**
   * 章节级自检流程：
   * 1. 校验书籍与章节存在；
   * 2. 组装 prompt 所需上下文；
   * 3. 调用 AI 并解析 issues；
   * 4. 过滤低置信与失效 persona；
   * 5. 落库生成章节级报告。
   */
  async function validateChapterResult(input: ChapterValidationInput): Promise<ValidationReportData> {
    const [book, chapter] = await Promise.all([
      prismaClient.book.findUnique({
        where : { id: input.bookId },
        select: { id: true, title: true }
      }),
      prismaClient.chapter.findUnique({
        where : { id: input.chapterId },
        select: { title: true }
      })
    ]);

    if (!book) {
      throw new Error(`书籍不存在: ${input.bookId}`);
    }
    if (!chapter) {
      throw new Error(`章节不存在: ${input.chapterId}`);
    }

    const existingPersonaIds = input.existingProfiles.map((profile) => profile.personaId);
    const existingPersonaRows = existingPersonaIds.length === 0
      ? []
      : await prismaClient.persona.findMany({
        where : { id: { in: existingPersonaIds }, deletedAt: null },
        select: {
          id        : true,
          name      : true,
          aliases   : true,
          nameType  : true,
          confidence: true
        }
      });
    const existingPersonaMap = new Map(existingPersonaRows.map((row) => [row.id, row]));

    const personaNameRows = await prismaClient.persona.findMany({
      where: {
        id: {
          in: unique([
            ...input.newMentions.map((item) => item.personaId),
            ...input.newRelationships.map((item) => item.sourceId),
            ...input.newRelationships.map((item) => item.targetId),
            ...input.newPersonas.map((item) => item.id)
          ])
        },
        deletedAt: null
      },
      select: {
        id  : true,
        name: true
      }
    });
    const personaNameMap = new Map(personaNameRows.map((row) => [row.id, row.name]));

    // 把数据库快照映射成提示词上下文，避免让模型直接依赖原始表结构。
    const chapterPromptInput = {
      bookTitle       : book.title,
      chapterNo       : input.chapterNo,
      chapterTitle    : chapter.title,
      chapterContent  : input.chapterContent,
      existingPersonas: input.existingProfiles.map((profile) => {
        const row = existingPersonaMap.get(profile.personaId);
        return {
          id        : profile.personaId,
          name      : profile.canonicalName,
          aliases   : profile.aliases,
          nameType  : row?.nameType ?? "NAMED",
          confidence: row?.confidence ?? 1
        };
      }),
      newlyCreated: input.newPersonas.map((persona) => ({
        id        : persona.id,
        name      : normalizeName(persona.name),
        nameType  : persona.nameType,
        confidence: persona.confidence
      })),
      chapterMentions: input.newMentions.map((mention) => ({
        personaName: personaNameMap.get(mention.personaId) ?? mention.personaId,
        rawText    : mention.rawText
      })),
      chapterRelationships: input.newRelationships.map((relation) => ({
        sourceName: personaNameMap.get(relation.sourceId) ?? relation.sourceId,
        targetName: personaNameMap.get(relation.targetId) ?? relation.targetId,
        type      : relation.type
      }))
    };
    const prompt = await resolvePromptTemplate({
      slug        : "CHAPTER_VALIDATION",
      replacements: {
        bookTitle           : chapterPromptInput.bookTitle,
        chapterNo           : String(chapterPromptInput.chapterNo),
        chapterTitle        : chapterPromptInput.chapterTitle,
        chapterContent      : chapterPromptInput.chapterContent,
        existingPersonas    : chapterPromptInput.existingPersonas.map((p) => `- ${p.name} (${p.nameType}, 置信度:${p.confidence}) 别名:[${p.aliases.join(",")}]`).join("\n"),
        newlyCreated        : chapterPromptInput.newlyCreated.map((p) => `- ${p.name} (${p.nameType}, 置信度:${p.confidence})`).join("\n"),
        chapterMentions     : chapterPromptInput.chapterMentions.map((m) => `- ${m.personaName}: \"${m.rawText.slice(0, 80)}\"`).join("\n"),
        chapterRelationships: chapterPromptInput.chapterRelationships.map((r) => `- ${r.sourceName} → ${r.targetName}: ${r.type}`).join("\n")
      }
    });

    const content = await executeValidationStage({
      stage    : PipelineStage.CHAPTER_VALIDATION,
      prompt,
      bookId   : input.bookId,
      jobId    : input.jobId,
      chapterId: input.chapterId
    });

    // 先做“置信度门槛”，再做“persona 存活过滤”，两层都通过才进入最终报告。
    const parsedIssues = parseValidationResponse(content).filter((issue) => issue.confidence >= VALIDATION_MIN_CONFIDENCE);
    const validPersonaIds = await ensureValidPersonaIds(
      unique(parsedIssues.flatMap((issue) => [
        ...issue.affectedPersonaIds,
        issue.suggestion.targetPersonaId,
        issue.suggestion.sourcePersonaId
      ]))
    );
    const issues = sanitizeIssuesByPersona(parsedIssues, validPersonaIds);
    const summary = buildSummary(issues);

    return await createValidationReport({
      bookId   : input.bookId,
      jobId    : input.jobId,
      scope    : "CHAPTER",
      chapterId: input.chapterId,
      issues,
      summary
    });
  }

  /**
   * 整书级自检流程：
   * - 汇总人物、提及、关系、章节样本后交给模型做全局一致性检查。
   * - 与章节级不同，这里关注“跨章节累计问题”（重复人物、关系冲突、低置信人物等）。
   */
  async function validateBookResult(bookId: string, jobId: string): Promise<ValidationReportData> {
    const book = await prismaClient.book.findUnique({
      where : { id: bookId },
      select: { title: true }
    });
    if (!book) {
      throw new Error(`书籍不存在: ${bookId}`);
    }

    const [profiles, mentionStats, relationships, sampledChapters] = await Promise.all([
      prismaClient.profile.findMany({
        where: {
          bookId,
          deletedAt: null,
          persona  : { deletedAt: null }
        },
        select: {
          personaId: true,
          persona  : {
            select: {
              id        : true,
              name      : true,
              aliases   : true,
              nameType  : true,
              confidence: true
            }
          }
        }
      }),
      prismaClient.mention.groupBy({
        by   : ["personaId"],
        where: {
          deletedAt: null,
          chapter  : { bookId }
        },
        _count: { id: true }
      }),
      prismaClient.relationship.findMany({
        where: {
          deletedAt: null,
          chapter  : { bookId }
        },
        select: {
          sourceId: true,
          targetId: true,
          type    : true
        }
      }),
      prismaClient.chapter.findMany({
        where  : { bookId, parseStatus: "SUCCEEDED" },
        orderBy: { no: "asc" },
        select : { no: true, title: true, content: true },
        take   : ANALYSIS_PIPELINE_CONFIG.bookValidationSampleLimit
      })
    ]);

    const mentionCountMap = new Map(mentionStats.map((item) => [item.personaId, item._count.id]));
    const personaNameMap = new Map(profiles.map((item) => [item.persona.id, item.persona.name]));

    const relationCounter = new Map<string, { sourceId: string; targetId: string; type: string; count: number }>();
    for (const relation of relationships) {
      const key = [relation.sourceId, relation.targetId, relation.type].join("|");
      const previous = relationCounter.get(key);
      if (previous) {
        // 同类型关系按 pair 聚合计数，避免把重复边逐条喂给模型导致噪音过大。
        previous.count += 1;
      } else {
        relationCounter.set(key, {
          sourceId: relation.sourceId,
          targetId: relation.targetId,
          type    : relation.type,
          count   : 1
        });
      }
    }

    // 章节采样用于给模型提供可验证的文本证据，限制长度控制 token 成本。
    const sourceExcerpts = sampledChapters.map((chapter, index) => ({
      chapterNo   : chapter.no,
      chapterTitle: chapter.title,
      reason      : index === 0 ? "代表性样本" : "覆盖更多章节",
      excerpt     : chapter.content.slice(0, ANALYSIS_PIPELINE_CONFIG.bookValidationExcerptChars)
    }));

    const bookPromptInput = {
      bookTitle: book.title,
      personas : profiles.map((profile) => ({
        id          : profile.persona.id,
        name        : profile.persona.name,
        aliases     : profile.persona.aliases,
        nameType    : profile.persona.nameType,
        confidence  : profile.persona.confidence,
        mentionCount: mentionCountMap.get(profile.persona.id) ?? 0
      })),
      relationships: Array.from(relationCounter.values()).map((item) => ({
        sourceName: personaNameMap.get(item.sourceId) ?? item.sourceId,
        targetName: personaNameMap.get(item.targetId) ?? item.targetId,
        type      : item.type,
        count     : item.count
      })),
      lowConfidencePersonas: profiles
        .map((profile) => ({
          id        : profile.persona.id,
          name      : profile.persona.name,
          confidence: profile.persona.confidence
        }))
        .filter((item) => item.confidence < 0.7),
      sourceExcerpts
    };
    const prompt = await resolvePromptTemplate({
      slug        : "BOOK_VALIDATION",
      replacements: {
        bookTitle            : bookPromptInput.bookTitle,
        personas             : bookPromptInput.personas.map((p) => `- ${p.name} [${p.id}] (${p.nameType}, 置信度:${p.confidence}, 提及:${p.mentionCount}) 别名:[${p.aliases.join(",")}]`).join("\n"),
        relationships        : bookPromptInput.relationships.map((r) => `- ${r.sourceName} → ${r.targetName}: ${r.type} (出现 ${r.count} 次)`).join("\n"),
        lowConfidencePersonas: bookPromptInput.lowConfidencePersonas.map((p) => `- ${p.name} [${p.id}] (置信度:${p.confidence})`).join("\n"),
        sourceExcerpts       : bookPromptInput.sourceExcerpts.map((item) => `- 第${item.chapterNo}章「${item.chapterTitle}」(${item.reason})：${item.excerpt}`).join("\n")
      }
    });

    const content = await executeValidationStage({
      stage: PipelineStage.BOOK_VALIDATION,
      prompt,
      bookId,
      jobId
    });

    const parsedIssues = parseValidationResponse(content).filter((issue) => issue.confidence >= VALIDATION_MIN_CONFIDENCE);
    const validPersonaIds = await ensureValidPersonaIds(
      unique(parsedIssues.flatMap((issue) => [
        ...issue.affectedPersonaIds,
        issue.suggestion.targetPersonaId,
        issue.suggestion.sourcePersonaId
      ]))
    );
    const issues = sanitizeIssuesByPersona(parsedIssues, validPersonaIds);
    const summary = buildSummary(issues);

    return await createValidationReport({
      bookId,
      jobId,
      scope: "BOOK",
      issues,
      summary
    });
  }

  /**
   * 自动修复执行器。
   * 仅处理白名单动作，并对每种动作做二次防御校验，避免“报告过期”导致错误写入。
   */
  async function applyAutoFixes(reportId: string): Promise<number> {
    const report = await prismaClient.validationReport.findUnique({
      where : { id: reportId },
      select: {
        id    : true,
        issues: true
      }
    });

    if (!report) {
      throw new Error(`自检报告不存在: ${reportId}`);
    }

    const issues = parseJsonFieldAsValidationIssues(report.issues);
    let applied = 0;
    // UPDATE_NAME 每个 persona 每轮只执行一次，防止同一轮出现连环改名。
    const updatedNameIds = new Set<string>();

    for (const issue of issues) {
      const threshold = AUTO_FIX_CONFIDENCE[issue.suggestion.action] ?? 0.9;
      // 未达阈值或不在白名单的动作全部跳过，保持自动修复保守策略。
      if (issue.confidence < threshold || !AUTO_FIX_ACTIONS.has(issue.suggestion.action)) {
        continue;
      }

      if (issue.suggestion.action === "MERGE") {
        if (!issue.suggestion.targetPersonaId || !issue.suggestion.sourcePersonaId) {
          continue;
        }
        // 防止自合并
        if (issue.suggestion.targetPersonaId === issue.suggestion.sourcePersonaId) {
          continue;
        }
        // 校验双方 persona 仍然存活（报告生成后可能已被删除/合并）
        const [target, source] = await Promise.all([
          prismaClient.persona.findUnique({
            where : { id: issue.suggestion.targetPersonaId },
            select: { id: true, deletedAt: true }
          }),
          prismaClient.persona.findUnique({
            where : { id: issue.suggestion.sourcePersonaId },
            select: { id: true, deletedAt: true }
          })
        ]);
        if (!target || target.deletedAt || !source || source.deletedAt) {
          continue;
        }

        await mergePersonas({
          targetId: issue.suggestion.targetPersonaId,
          sourceId: issue.suggestion.sourcePersonaId
        });
        applied += 1;
        continue;
      }

      if (issue.suggestion.action === "ADD_ALIAS") {
        const targetPersonaId = issue.suggestion.targetPersonaId ?? issue.affectedPersonaIds[0];
        const newAlias = issue.suggestion.newAlias?.trim();
        if (!targetPersonaId || !newAlias) {
          continue;
        }

        const persona = await prismaClient.persona.findUnique({
          where : { id: targetPersonaId },
          select: { aliases: true, deletedAt: true }
        });
        if (!persona || persona.deletedAt) {
          continue;
        }

        const nextAliases = unique([...persona.aliases, newAlias]);
        await prismaClient.persona.update({
          where: { id: targetPersonaId },
          data : { aliases: nextAliases }
        });
        applied += 1;
        continue;
      }

      if (issue.suggestion.action === "UPDATE_NAME") {
        const targetPersonaId = issue.suggestion.targetPersonaId ?? issue.affectedPersonaIds[0];
        const newName = issue.suggestion.newName?.trim();
        if (!targetPersonaId || !newName) {
          continue;
        }

        // 每轮 auto-fix 中只允许对同一 persona 执行一次 UPDATE_NAME，防止别名链
        if (updatedNameIds.has(targetPersonaId)) {
          continue;
        }

        const persona = await prismaClient.persona.findUnique({
          where : { id: targetPersonaId },
          select: { name: true, aliases: true, deletedAt: true }
        });
        if (!persona || persona.deletedAt) {
          continue;
        }

        const nextAliases = unique([...persona.aliases, persona.name]);
        await prismaClient.persona.update({
          where: { id: targetPersonaId },
          data : {
            name   : newName,
            aliases: nextAliases
          }
        });
        updatedNameIds.add(targetPersonaId);
        applied += 1;
      }
    }

    // 报告状态改为 APPLIED，表示已执行过自动修复（无论 applied 是否为 0）。
    await prismaClient.validationReport.update({
      where: { id: reportId },
      data : { status: "APPLIED" }
    });

    return applied;
  }

  async function listValidationReports(bookId: string): Promise<Array<{
    id       : string;
    bookId   : string;
    jobId    : string | null;
    scope    : string;
    chapterId: string | null;
    status   : string;
    summary  : ValidationSummary;
    createdAt: string;
  }>> {
    const rows = await prismaClient.validationReport.findMany({
      where  : { bookId },
      orderBy: { createdAt: "desc" },
      select : {
        id       : true,
        bookId   : true,
        jobId    : true,
        scope    : true,
        chapterId: true,
        status   : true,
        summary  : true,
        createdAt: true
      }
    });

    // summary/createdAt 做统一归一化，避免调用方直接处理 JsonValue/Date。
    return rows.map((row) => ({
      id       : row.id,
      bookId   : row.bookId,
      jobId    : row.jobId,
      scope    : row.scope,
      chapterId: row.chapterId,
      status   : row.status,
      summary  : parseValidationSummary(row.summary),
      createdAt: row.createdAt.toISOString()
    }));
  }

  /** 获取报告详情（限定 bookId + reportId 双条件，防止跨书读取）。 */
  async function getValidationReportDetail(
    bookId: string,
    reportId: string
  ): Promise<{
    id       : string;
    bookId   : string;
    jobId    : string | null;
    scope    : string;
    chapterId: string | null;
    status   : string;
    summary  : ValidationSummary;
    issues   : ValidationIssue[];
    createdAt: string;
  } | null> {
    const row = await prismaClient.validationReport.findFirst({
      where : { id: reportId, bookId },
      select: {
        id       : true,
        bookId   : true,
        jobId    : true,
        scope    : true,
        chapterId: true,
        status   : true,
        summary  : true,
        issues   : true,
        createdAt: true
      }
    });

    if (!row) {
      return null;
    }

    // issues/summary 字段都来自 JsonValue，返回前统一转换为强类型结构。
    return {
      id       : row.id,
      bookId   : row.bookId,
      jobId    : row.jobId,
      scope    : row.scope,
      chapterId: row.chapterId,
      status   : row.status,
      summary  : parseValidationSummary(row.summary),
      issues   : parseJsonFieldAsValidationIssues(row.issues),
      createdAt: row.createdAt.toISOString()
    };
  }

  return {
    validateChapterResult,
    validateBookResult,
    listValidationReports,
    getValidationReportDetail,
    applyAutoFixes
  };
}

export const validationAgentService = createValidationAgentService();
