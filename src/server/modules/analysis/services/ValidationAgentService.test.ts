/**
 * 文件定位（分析流水线模块单测）：
 * - 覆盖 analysis 域服务/作业/配置解析能力，属于服务端核心业务逻辑层。
 * - 该模块是小说结构化解析的主链路，直接影响人物、关系、生平等下游数据质量。
 *
 * 业务职责：
 * - 验证模型调用策略、提示词拼装、结果归并、异常降级与任务状态流转。
 * - 约束输入归一化与输出契约，避免分析链路重构时出现隐性行为漂移。
 *
 * 维护提示：
 * - 这里的断言大多是业务规则（如状态推进、去重策略、容错路径），不是简单技术实现细节。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createValidationAgentService } from "@/server/modules/analysis/services/ValidationAgentService";
import { createMergePersonasService } from "@/server/modules/personas/mergePersonas";
import { createAiProviderClient } from "@/server/providers/ai";

const hoisted = vi.hoisted(() => ({
  mergePersonas         : vi.fn(),
  createAiProviderClient: vi.fn()
}));

vi.mock("@/server/modules/personas/mergePersonas", () => ({
  createMergePersonasService: vi.fn(() => ({ mergePersonas: hoisted.mergePersonas }))
}));

vi.mock("@/server/providers/ai", () => ({
  createAiProviderClient: hoisted.createAiProviderClient
}));

function createStageExecutorMock() {
  const resolvedModel = {
    modelId    : "deepseek-chat",
    provider   : "deepseek",
    modelName  : "deepseek-chat",
    displayName: "DeepSeek Chat",
    baseUrl    : "https://api.deepseek.com",
    apiKey     : "sk-test",
    source     : "JOB",
    params     : {
      temperature    : 0.2,
      maxOutputTokens: 4096,
      topP           : 1,
      maxRetries     : 1,
      retryBaseMs    : 300
    }
  } as const;

  return {
    execute: vi.fn(async (input: {
      prompt: { system: string; user: string };
      callFn: (args: { model: typeof resolvedModel; prompt: { system: string; user: string } }) => Promise<{ data: string; usage: null }>;
    }) => {
      const result = await input.callFn({
        model : resolvedModel,
        prompt: input.prompt
      });
      return {
        ...result,
        modelId   : resolvedModel.modelId,
        isFallback: false
      };
    })
  };
}

function createPrismaMock() {
  const bookFindUnique = vi.fn();
  const chapterFindUnique = vi.fn();
  const profileFindMany = vi.fn();
  const mentionGroupBy = vi.fn();
  const relationshipFindMany = vi.fn();
  const chapterFindMany = vi.fn();
  const personaFindMany = vi.fn();
  const personaFindUnique = vi.fn();
  const personaUpdate = vi.fn();
  const validationReportCreate = vi.fn();
  const validationReportFindUnique = vi.fn();
  const validationReportFindMany = vi.fn();
  const validationReportFindFirst = vi.fn();
  const validationReportUpdate = vi.fn();

  return {
    prisma: {
      book: {
        findUnique: bookFindUnique
      },
      chapter: {
        findUnique: chapterFindUnique,
        findMany  : chapterFindMany
      },
      profile: {
        findMany: profileFindMany
      },
      mention: {
        groupBy: mentionGroupBy
      },
      relationship: {
        findMany: relationshipFindMany
      },
      persona: {
        findMany  : personaFindMany,
        findUnique: personaFindUnique,
        update    : personaUpdate
      },
      validationReport: {
        create    : validationReportCreate,
        findUnique: validationReportFindUnique,
        findMany  : validationReportFindMany,
        findFirst : validationReportFindFirst,
        update    : validationReportUpdate
      }
    } as never,
    bookFindUnique,
    chapterFindUnique,
    profileFindMany,
    mentionGroupBy,
    relationshipFindMany,
    chapterFindMany,
    personaFindMany,
    personaFindUnique,
    personaUpdate,
    validationReportCreate,
    validationReportFindUnique,
    validationReportFindMany,
    validationReportFindFirst,
    validationReportUpdate
  };
}

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("ValidationAgentService", () => {
  const mockedCreateMergePersonasService = vi.mocked(createMergePersonasService);
  const mockedCreateAiProviderClient = vi.mocked(createAiProviderClient);

  beforeEach(() => {
    vi.clearAllMocks();
    mockedCreateMergePersonasService.mockReturnValue({ mergePersonas: hoisted.mergePersonas } as never);
    mockedCreateAiProviderClient.mockReset();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("validateChapterResult filters low-confidence issues and persists report", async () => {
    const {
      prisma,
      bookFindUnique,
      chapterFindUnique,
      personaFindMany,
      validationReportCreate
    } = createPrismaMock();
    const generateJson = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        issues: [
          {
            id                : "issue-1",
            type              : "DUPLICATE_PERSONA",
            severity          : "WARNING",
            confidence        : 0.82,
            description       : "疑似重复",
            evidence          : "别名重叠",
            affectedPersonaIds: ["persona-a", "ghost-persona"],
            suggestion        : {
              action         : "MERGE",
              targetPersonaId: "persona-a",
              sourcePersonaId: "ghost-persona",
              reason         : "建议合并"
            }
          },
          {
            id                : "issue-low",
            type              : "LOW_CONFIDENCE_ENTITY",
            severity          : "INFO",
            confidence        : 0.4,
            description       : "低置信",
            evidence          : "线索不足",
            affectedPersonaIds: ["persona-a"],
            suggestion        : {
              action: "MANUAL_REVIEW",
              reason: "人工复核"
            }
          }
        ]
      }),
      usage: null
    });

    bookFindUnique.mockResolvedValueOnce({
      id       : "book-1",
      title    : "儒林外史",
      aiModelId: null
    });
    chapterFindUnique.mockResolvedValueOnce({ title: "第一回" });
    personaFindMany
      .mockResolvedValueOnce([{
        id        : "persona-a",
        name      : "范进",
        aliases   : ["范老爷"],
        nameType  : "NAMED",
        confidence: 0.93
      }])
      .mockResolvedValueOnce([{
        id  : "persona-new",
        name: "周学道"
      }])
      .mockResolvedValueOnce([{ id: "persona-a" }]);
    validationReportCreate.mockResolvedValueOnce({ id: "report-1" });

    const stageExecutor = createStageExecutorMock();
    mockedCreateAiProviderClient.mockReturnValue({ generateJson } as never);
    const service = createValidationAgentService(prisma, stageExecutor as never);
    const report = await service.validateChapterResult({
      bookId          : "book-1",
      chapterId       : "chapter-1",
      chapterNo       : 1,
      chapterContent  : "范进与周学道相见",
      jobId           : "job-1",
      newPersonas     : [{ id: "persona-new", name: "周学道", confidence: 0.72, nameType: "TITLE_ONLY" }],
      newMentions     : [{ personaId: "persona-new", rawText: "周学道来了" }],
      newRelationships: [{ sourceId: "persona-a", targetId: "persona-new", type: "同年" }],
      existingProfiles: [{
        personaId    : "persona-a",
        canonicalName: "范进",
        aliases      : ["范老爷"],
        localSummary : "中举后发达"
      }]
    });

    expect(generateJson).toHaveBeenCalledTimes(1);
    expect(report.id).toBe("report-1");
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]?.affectedPersonaIds).toEqual(["persona-a"]);
    expect(report.issues[0]?.suggestion.sourcePersonaId).toBeUndefined();
    expect(report.summary.totalIssues).toBe(1);
    expect(report.summary.warningCount).toBe(1);
    expect(validationReportCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookId   : "book-1",
        jobId    : "job-1",
        scope    : "CHAPTER",
        chapterId: "chapter-1"
      }),
      select: { id: true }
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("validateBookResult builds full-book prompt and persists report", async () => {
    const {
      prisma,
      bookFindUnique,
      profileFindMany,
      mentionGroupBy,
      relationshipFindMany,
      chapterFindMany,
      personaFindMany,
      validationReportCreate
    } = createPrismaMock();
    const generateJson = vi.fn().mockResolvedValue({
      content: JSON.stringify({
        issues: [
          {
            id                : "book-issue-1",
            type              : "DUPLICATE_PERSONA",
            severity          : "WARNING",
            confidence        : 0.91,
            description       : "全书层面疑似重复人物",
            evidence          : "关系图与别名高度重叠",
            affectedPersonaIds: ["persona-a", "persona-b"],
            suggestion        : {
              action         : "MERGE",
              targetPersonaId: "persona-a",
              sourcePersonaId: "persona-b",
              reason         : "建议合并"
            }
          }
        ]
      }),
      usage: null
    });

    bookFindUnique.mockResolvedValueOnce({
      title    : "儒林外史",
      aiModelId: null
    });
    profileFindMany.mockResolvedValueOnce([
      {
        personaId: "persona-a",
        persona  : {
          id        : "persona-a",
          name      : "范进",
          aliases   : ["范老爷"],
          nameType  : "NAMED",
          confidence: 0.95
        }
      },
      {
        personaId: "persona-b",
        persona  : {
          id        : "persona-b",
          name      : "范举人",
          aliases   : [],
          nameType  : "NAMED",
          confidence: 0.62
        }
      }
    ]);
    mentionGroupBy.mockResolvedValueOnce([
      { personaId: "persona-a", _count: { id: 12 } },
      { personaId: "persona-b", _count: { id: 4 } }
    ]);
    relationshipFindMany.mockResolvedValueOnce([
      { sourceId: "persona-a", targetId: "persona-b", type: "同乡" },
      { sourceId: "persona-a", targetId: "persona-b", type: "同乡" }
    ]);
    chapterFindMany.mockResolvedValueOnce([
      { no: 1, title: "第一回", content: "范进中举，众人相贺。" }
    ]);
    personaFindMany.mockResolvedValueOnce([{ id: "persona-a" }, { id: "persona-b" }]);
    validationReportCreate.mockResolvedValueOnce({ id: "report-book-1" });

    const stageExecutor = createStageExecutorMock();
    mockedCreateAiProviderClient.mockReturnValue({ generateJson } as never);
    const service = createValidationAgentService(prisma, stageExecutor as never);
    const report = await service.validateBookResult("book-1", "job-1");

    expect(generateJson).toHaveBeenCalledTimes(1);
    expect(generateJson.mock.calls[0]?.[0].user).toContain("## 全书人物列表");
    expect(generateJson.mock.calls[0]?.[0].user).toContain("## 抽样原文证据");
    expect(report.id).toBe("report-book-1");
    expect(report.summary.autoFixable).toBe(1);
    expect(validationReportCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookId: "book-1",
        jobId : "job-1",
        scope : "BOOK"
      }),
      select: { id: true }
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("applyAutoFixes executes MERGE/ADD_ALIAS/UPDATE_NAME and marks report applied", async () => {
    const {
      prisma,
      validationReportFindUnique,
      validationReportUpdate,
      personaFindUnique,
      personaUpdate
    } = createPrismaMock();

    validationReportFindUnique.mockResolvedValueOnce({
      id    : "report-1",
      issues: {
        issues: [
          {
            id                : "fix-merge",
            type              : "DUPLICATE_PERSONA",
            severity          : "WARNING",
            confidence        : 0.95,
            description       : "重复人物",
            evidence          : "证据1",
            affectedPersonaIds: ["persona-a", "persona-b"],
            suggestion        : {
              action         : "MERGE",
              targetPersonaId: "persona-a",
              sourcePersonaId: "persona-b",
              reason         : "建议合并"
            }
          },
          {
            id                : "fix-alias",
            type              : "MISSING_NAME_MAPPING",
            severity          : "INFO",
            confidence        : 0.94,
            description       : "缺少别名",
            evidence          : "证据2",
            affectedPersonaIds: ["persona-c"],
            suggestion        : {
              action         : "ADD_ALIAS",
              targetPersonaId: "persona-c",
              newAlias       : "周大人",
              reason         : "补充别名"
            }
          },
          {
            id                : "fix-name",
            type              : "ALIAS_AS_NEW_PERSONA",
            severity          : "ERROR",
            confidence        : 0.93,
            description       : "名称应修正",
            evidence          : "证据3",
            affectedPersonaIds: ["persona-d"],
            suggestion        : {
              action         : "UPDATE_NAME",
              targetPersonaId: "persona-d",
              newName        : "朱元璋",
              reason         : "回填真名"
            }
          },
          {
            id                : "skip-low",
            type              : "LOW_CONFIDENCE_ENTITY",
            severity          : "INFO",
            confidence        : 0.5,
            description       : "低置信",
            evidence          : "证据4",
            affectedPersonaIds: ["persona-e"],
            suggestion        : {
              action: "MANUAL_REVIEW",
              reason: "人工审核"
            }
          }
        ]
      }
    });
    personaFindUnique
      // MERGE: 校验双方 persona 存活（target 和 source）
      .mockResolvedValueOnce({ id: "persona-a", deletedAt: null })
      .mockResolvedValueOnce({ id: "persona-b", deletedAt: null })
      // ADD_ALIAS: 查询 persona-c
      .mockResolvedValueOnce({ aliases: ["周学道"], deletedAt: null })
      // UPDATE_NAME: 查询 persona-d
      .mockResolvedValueOnce({ name: "太祖皇帝", aliases: ["洪武帝"], deletedAt: null });
    validationReportUpdate.mockResolvedValueOnce({});

    const service = createValidationAgentService(prisma);
    const appliedCount = await service.applyAutoFixes("report-1");

    expect(hoisted.mergePersonas).toHaveBeenCalledWith({
      targetId: "persona-a",
      sourceId: "persona-b"
    });
    expect(personaUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "persona-c" },
      data : { aliases: ["周学道", "周大人"] }
    });
    expect(personaUpdate).toHaveBeenNthCalledWith(2, {
      where: { id: "persona-d" },
      data : {
        name   : "朱元璋",
        aliases: ["洪武帝", "太祖皇帝"]
      }
    });
    expect(validationReportUpdate).toHaveBeenCalledWith({
      where: { id: "report-1" },
      data : { status: "APPLIED" }
    });
    expect(appliedCount).toBe(3);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("applyAutoFixes skips self-merge and deleted personas", async () => {
    const { prisma, validationReportFindUnique, validationReportUpdate, personaFindUnique } = createPrismaMock();

    validationReportFindUnique.mockResolvedValueOnce({
      id    : "report-2",
      issues: {
        issues: [
          {
            id                : "self-merge",
            type              : "DUPLICATE_PERSONA",
            severity          : "WARNING",
            confidence        : 0.95,
            description       : "自合并",
            evidence          : "证据",
            affectedPersonaIds: ["persona-x"],
            suggestion        : {
              action: "MERGE", targetPersonaId: "persona-x", sourcePersonaId: "persona-x", reason: "same"
            }
          },
          {
            id                : "deleted-persona",
            type              : "MISSING_NAME_MAPPING",
            severity          : "WARNING",
            confidence        : 0.92,
            description       : "已删除",
            evidence          : "证据",
            affectedPersonaIds: ["persona-deleted"],
            suggestion        : {
              action: "ADD_ALIAS", targetPersonaId: "persona-deleted", newAlias: "test", reason: "补充"
            }
          }
        ]
      }
    });

    // 自合并校验：返回两次相同 persona
    personaFindUnique
      // ADD_ALIAS 的 persona 已被软删
      .mockResolvedValueOnce({ aliases: [], deletedAt: new Date() });
    validationReportUpdate.mockResolvedValueOnce({});

    const service = createValidationAgentService(prisma);
    const appliedCount = await service.applyAutoFixes("report-2");

    // 自合并被跳过，已删除 persona 被跳过
    expect(appliedCount).toBe(0);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("listValidationReports returns reports ordered by createdAt", async () => {
    const { prisma, validationReportFindMany } = createPrismaMock();

    const now = new Date();
    const earlier = new Date(now.getTime() - 3600_000);
    validationReportFindMany.mockResolvedValueOnce([
      {
        id       : "report-a",
        bookId   : "book-1",
        jobId    : "job-1",
        scope    : "BOOK",
        chapterId: null,
        status   : "PENDING",
        summary  : { totalIssues: 5, errorCount: 1, warningCount: 3, infoCount: 1, autoFixable: 2, needsReview: 3 },
        createdAt: now
      },
      {
        id       : "report-b",
        bookId   : "book-1",
        jobId    : "job-1",
        scope    : "CHAPTER",
        chapterId: "ch-1",
        status   : "APPLIED",
        summary  : { totalIssues: 2, errorCount: 0, warningCount: 1, infoCount: 1, autoFixable: 0, needsReview: 2 },
        createdAt: earlier
      }
    ]);

    const service = createValidationAgentService(prisma);
    const reports = await service.listValidationReports("book-1");

    expect(reports).toHaveLength(2);
    expect(reports[0].id).toBe("report-a");
    expect(reports[0].summary.totalIssues).toBe(5);
    expect(reports[1].id).toBe("report-b");
    expect(reports[1].scope).toBe("CHAPTER");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("getValidationReportDetail returns null when not found", async () => {
    const { prisma, validationReportFindFirst } = createPrismaMock();

    validationReportFindFirst.mockResolvedValueOnce(null);

    const service = createValidationAgentService(prisma);
    const detail = await service.getValidationReportDetail("book-1", "nonexistent");

    expect(detail).toBeNull();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("getValidationReportDetail returns structured data for existing report", async () => {
    const { prisma, validationReportFindFirst } = createPrismaMock();

    validationReportFindFirst.mockResolvedValueOnce({
      id       : "report-detail",
      bookId   : "book-1",
      jobId    : "job-1",
      scope    : "BOOK",
      chapterId: null,
      status   : "PENDING",
      summary  : { totalIssues: 1, errorCount: 1, warningCount: 0, infoCount: 0, autoFixable: 1, needsReview: 0 },
      issues   : [
        {
          id                : "issue-1",
          type              : "DUPLICATE_PERSONA",
          severity          : "ERROR",
          confidence        : 0.95,
          description       : "重复人物",
          evidence          : "证据",
          affectedPersonaIds: ["p1", "p2"],
          suggestion        : { action: "MERGE", targetPersonaId: "p1", sourcePersonaId: "p2", reason: "合并" }
        }
      ],
      createdAt: new Date("2026-03-31T10:00:00Z")
    });

    const service = createValidationAgentService(prisma);
    const detail = await service.getValidationReportDetail("book-1", "report-detail");

    expect(detail).not.toBeNull();
    expect(detail!.id).toBe("report-detail");
    expect(detail!.issues).toHaveLength(1);
    expect(detail!.issues[0].type).toBe("DUPLICATE_PERSONA");
    expect(detail!.summary.totalIssues).toBe(1);
  });
});
