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
import { buildBookValidationPrompt, buildChapterValidationPrompt, parseValidationResponse } from "@/server/modules/analysis/services/prompts";
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

export interface ChapterValidationInput {
  bookId          : string;
  chapterId       : string;
  chapterNo       : number;
  chapterContent  : string;
  jobId?          : string;
  newPersonas     : Array<{ id: string; name: string; confidence: number; nameType: string }>;
  newMentions     : Array<{ personaId: string; rawText: string }>;
  newRelationships: Array<{ sourceId: string; targetId: string; type: string }>;
  existingProfiles: AnalysisProfileContext[];
}

export interface ValidationAgentService {
  validateChapterResult(input: ChapterValidationInput): Promise<ValidationReportData>;
  validateBookResult(bookId: string, jobId: string): Promise<ValidationReportData>;
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
  applyAutoFixes(reportId: string): Promise<number>;
}

const AUTO_FIX_ACTIONS = new Set(["MERGE", "ADD_ALIAS", "UPDATE_NAME"]);

/** 验证结果最低置信度阈值：低于此值的 issue 将被过滤 */
const VALIDATION_MIN_CONFIDENCE = 0.6;

/** 按 action 类型分层的自动修复置信度阈值 */
const AUTO_FIX_CONFIDENCE: Record<string, number> = {
  MERGE      : 0.9,
  ADD_ALIAS  : 0.8,
  UPDATE_NAME: 0.85
};

function normalizeName(value: string): string {
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
    .filter((issue) => issue.affectedPersonaIds.length > 0);
}

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
  strategyResolver: ModelStrategyResolver = modelStrategyResolver
): ValidationAgentService {
  const { mergePersonas } = createMergePersonasService(prismaClient);
  const runtimeAiClientCache = new Map<string, AiProviderClient>();

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

  function getRuntimeAiClient(model: ResolvedStageModel | ResolvedFallbackModel): AiProviderClient {
    const cached = runtimeAiClientCache.get(model.modelId);
    if (cached) {
      return cached;
    }

    const client = createAiProviderClient({
      provider : model.provider,
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
    jobId?    : string;
    chapterId?: string;
  }): Promise<string> {
    if (!input.jobId) {
      const model = await strategyResolver.resolveForStage(input.stage, { bookId: input.bookId });
      const client = getRuntimeAiClient(model);
      const result = await client.generateJson(input.prompt, toGenerateOptions(model));
      return result.content;
    }

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

    const prompt = buildChapterValidationPrompt({
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
    });

    const content = await executeValidationStage({
      stage    : PipelineStage.CHAPTER_VALIDATION,
      prompt,
      bookId   : input.bookId,
      jobId    : input.jobId,
      chapterId: input.chapterId
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
      bookId   : input.bookId,
      jobId    : input.jobId,
      scope    : "CHAPTER",
      chapterId: input.chapterId,
      issues,
      summary
    });
  }

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

    const sourceExcerpts = sampledChapters.map((chapter, index) => ({
      chapterNo   : chapter.no,
      chapterTitle: chapter.title,
      reason      : index === 0 ? "代表性样本" : "覆盖更多章节",
      excerpt     : chapter.content.slice(0, ANALYSIS_PIPELINE_CONFIG.bookValidationExcerptChars)
    }));

    const prompt = buildBookValidationPrompt({
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
    const updatedNameIds = new Set<string>();

    for (const issue of issues) {
      const threshold = AUTO_FIX_CONFIDENCE[issue.suggestion.action] ?? 0.9;
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
