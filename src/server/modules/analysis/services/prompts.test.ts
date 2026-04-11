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

import { describe, expect, it, vi } from "vitest";
import type * as AnalysisTypes from "@/types/analysis";

import {
  buildBookValidationPrompt,
  buildChapterAnalysisPrompt,
  buildChapterValidationPrompt,
  buildEntityResolutionPrompt,
  buildIndependentExtractionPrompt,
  buildRosterDiscoveryPrompt,
  buildTitleArbitrationPrompt,
  buildTitleResolutionPrompt,
  parseValidationResponse
} from "./prompts";

const baseInput = {
  bookTitle   : "儒林外史",
  chapterNo   : 1,
  chapterTitle: "说楔子敷陈大义 借名流隐括全文",
  content     : "范进见中举，众人态度大变。",
  chunkIndex  : 0,
  chunkCount  : 3
};

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("buildChapterAnalysisPrompt", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("injects known entity context when profiles are provided", () => {
    const prompt = buildChapterAnalysisPrompt({
      ...baseInput,
      profiles: [
        {
          personaId    : "p1",
          canonicalName: "范进",
          aliases      : ["范老爷", "范相公"],
          localSummary : "晚年中举"
        }
      ]
    });

    expect(prompt.system).toContain("结构化提取专家");
    expect(prompt.user).toContain("## Known Entities");
    expect(prompt.user).toContain("[1] 范进|范老爷,范相公");
    expect(prompt.user).toContain(`${baseInput.chunkIndex + 1}/${baseInput.chunkCount}`);
    expect(prompt.user).toContain("范进见中举，众人态度大变。");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("uses fallback context text when there are no known profiles", () => {
    const prompt = buildChapterAnalysisPrompt({
      ...baseInput,
      profiles: []
    });

    expect(prompt.user).toContain("（本书目前尚无已建档人物）");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("includes at least 30 generic title examples in default prompt", () => {
    // Arrange
    const prompt = buildChapterAnalysisPrompt({
      ...baseInput,
      profiles: []
    });

    // Act
    // 从规则行提取示例串，验证“>=30”的文档约束是否真正写入 prompt 文本。
    const match = prompt.user.match(/泛化称谓[\(（](.+?)[）\)]禁止/);
    const titles = (match?.[1] ?? "")
      .replace(/等$/, "")
      .split("、")
      .map((item) => item.trim())
      .filter(Boolean);

    // Assert
    expect(match).not.toBeNull();
    // 保持下限断言而非固定值，允许词库未来扩充时无需同步改测试。
    expect(titles.length).toBeGreaterThanOrEqual(30);
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("buildRosterDiscoveryPrompt", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("includes alias annotation rules and keeps output stable", () => {
    const prompt = buildRosterDiscoveryPrompt({
      ...baseInput,
      profiles: [
        {
          personaId    : "p1",
          canonicalName: "范进",
          aliases      : ["范老爷", "范相公"],
          localSummary : "晚年中举"
        }
      ]
    });

    expect(prompt.system).toContain("命名实体专家");
    expect(prompt.user).toContain("\"aliasType\"");
    expect(prompt.user).toContain("\"contextHint\"");
    expect(prompt.user).toContain("\"suggestedRealName\"");
    expect(prompt.user).toContain("\"aliasConfidence\"");
    expect(prompt).toMatchSnapshot();
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("buildTitleArbitrationPrompt", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("builds gray-zone arbitration prompt deterministically", () => {
    const prompt = buildTitleArbitrationPrompt({
      bookTitle: "儒林外史",
      terms    : [
        {
          surfaceForm             : "老爷",
          chapterAppearanceCount  : 3,
          hasStableAliasBinding   : false,
          singlePersonaConsistency: false,
          genericRatio            : 0.5
        }
      ]
    });

    expect(prompt.system).toContain("仲裁助手");
    expect(prompt.user).toContain("灰区称谓");
    expect(prompt.user).toContain("\"surfaceForm\"");
    expect(prompt.user).toContain("老爷");
    expect(prompt).toMatchSnapshot();
  });

  // 用例语义：覆盖空灰区列表分支，确保 prompt 仍输出稳定占位文本。
  it("uses an explicit empty-state marker when there are no gray-zone terms", () => {
    const prompt = buildTitleArbitrationPrompt({
      bookTitle: "儒林外史",
      terms    : []
    });

    expect(prompt.user).toContain("## 待判定称谓");
    expect(prompt.user).toContain("（无）");
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("buildIndependentExtractionPrompt", () => {
  // 用例语义：覆盖独立提取 prompt 的规则注入分支，避免词表定制丢失。
  it("injects custom extraction rules into the independent extraction prompt", () => {
    const prompt = buildIndependentExtractionPrompt({
      bookTitle            : "儒林外史",
      chapterNo            : 2,
      chapterTitle         : "范进去省城",
      content              : "范进在省城见周学道。",
      entityExtractionRules: ["仅提取有明确姓名或稳定称谓的人物"]
    });

    expect(prompt.system).toContain("命名实体识别专家");
    expect(prompt.user).toContain("仅提取有明确姓名或稳定称谓的人物");
    expect(prompt.user).toContain("\"category\":\"PERSON\"");
    expect(prompt.user).toContain("## 原文");
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("buildEntityResolutionPrompt", () => {
  // 用例语义：覆盖候选组渲染分支，验证可选 description 缺失时格式仍稳定。
  it("renders candidate groups with and without descriptions", () => {
    const prompt = buildEntityResolutionPrompt("儒林外史", [
      {
        groupId: 1,
        members: [
          { name: "范进", description: "中举书生", chapterNos: [1, 2] },
          { name: "范老爷", chapterNos: [3] }
        ]
      },
      {
        groupId: 2,
        members: [
          { name: "娄三公子", chapterNos: [4] }
        ]
      }
    ]);

    expect(prompt.system).toContain("人物消歧专家");
    expect(prompt.user).toContain("### 候选组 1");
    expect(prompt.user).toContain("\"范进\"（中举书生），出现于第1、2回");
    expect(prompt.user).toContain("\"范老爷\"，出现于第3回");
    expect(prompt.user).toContain("### 候选组 2");
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("buildTitleResolutionPrompt", () => {
  // 用例语义：覆盖称号溯源表格行拼装分支，确保空摘要不会破坏表格结构。
  it("renders title rows even when local summaries are missing", () => {
    const prompt = buildTitleResolutionPrompt({
      bookTitle: "儒林外史",
      entries  : [
        { personaId: "title-1", title: "太祖皇帝", localSummary: "明朝开国人物" },
        { personaId: "title-2", title: "老爷", localSummary: undefined }
      ]
    });

    expect(prompt.system).toContain("历史背景专家");
    expect(prompt.user).toContain("| 太祖皇帝 | 明朝开国人物 |");
    expect(prompt.user).toContain("| 老爷 |  |");
    expect(prompt.user).toContain("\"realName\": null");
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("buildChapterValidationPrompt", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("builds chapter validation prompt with deterministic structure", () => {
    const prompt = buildChapterValidationPrompt({
      bookTitle       : "儒林外史",
      chapterNo       : 3,
      chapterTitle    : "周学道校士拔真才",
      chapterContent  : "范进与周学道在文会上再会。",
      existingPersonas: [
        {
          id        : "p-1",
          name      : "范进",
          aliases   : ["范老爷"],
          nameType  : "NAMED",
          confidence: 0.92
        }
      ],
      newlyCreated: [
        {
          id        : "p-2",
          name      : "周学道",
          nameType  : "TITLE_ONLY",
          confidence: 0.75
        }
      ],
      chapterMentions: [
        {
          personaName: "周学道",
          rawText    : "周学道命诸生作文"
        }
      ],
      chapterRelationships: [
        {
          sourceName: "范进",
          targetName: "周学道",
          type      : "同年"
        }
      ]
    });

    expect(prompt.system).toContain("质量审核专家");
    expect(prompt.user).toContain("## 检查维度");
    expect(prompt.user).toContain("ALIAS_AS_NEW_PERSONA");
    expect(prompt).toMatchSnapshot();
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("buildBookValidationPrompt", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("builds book validation prompt with deterministic structure", () => {
    const prompt = buildBookValidationPrompt({
      bookTitle: "儒林外史",
      personas : [
        {
          id          : "p-1",
          name        : "范进",
          aliases     : ["范老爷"],
          nameType    : "NAMED",
          confidence  : 0.95,
          mentionCount: 23
        }
      ],
      relationships: [
        {
          sourceName: "范进",
          targetName: "周学道",
          type      : "师生",
          count     : 4
        }
      ],
      lowConfidencePersonas: [
        {
          id        : "p-2",
          name      : "周学道",
          confidence: 0.58
        }
      ],
      sourceExcerpts: [
        {
          chapterNo   : 1,
          chapterTitle: "第一回",
          reason      : "代表性样本",
          excerpt     : "范进见中举，众人态度大变。"
        }
      ]
    });

    expect(prompt.system).toContain("全书质检专家");
    expect(prompt.user).toContain("## 检查重点");
    expect(prompt.user).toContain("DUPLICATE_PERSONA");
    expect(prompt.user).toContain("## 抽样原文证据");
    expect(prompt).toMatchSnapshot();
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("parseValidationResponse", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("keeps valid issues and filters invalid enum values", () => {
    const raw = JSON.stringify({
      issues: [
        {
          id                : "issue-keep",
          type              : "DUPLICATE_PERSONA",
          severity          : "WARNING",
          confidence        : 0.88,
          description       : "疑似重复人物",
          evidence          : "别名与关系高度重叠",
          affectedPersonaIds: ["p-1", "p-2"],
          suggestion        : {
            action         : "MERGE",
            targetPersonaId: "p-1",
            sourcePersonaId: "p-2",
            reason         : "建议合并重复人物"
          }
        },
        {
          id         : "issue-drop-type",
          type       : "NOT_ALLOWED",
          severity   : "WARNING",
          confidence : 0.9,
          description: "非法 type",
          evidence   : "x",
          suggestion : { action: "MERGE", reason: "x" }
        },
        {
          id         : "issue-drop-severity",
          type       : "DUPLICATE_PERSONA",
          severity   : "SEVERE",
          confidence : 0.9,
          description: "非法 severity",
          evidence   : "x",
          suggestion : { action: "MERGE", reason: "x" }
        },
        {
          id         : "issue-drop-action",
          type       : "DUPLICATE_PERSONA",
          severity   : "INFO",
          confidence : 0.8,
          description: "非法 action",
          evidence   : "x",
          suggestion : { action: "INVALID", reason: "x" }
        }
      ]
    });

    const result = parseValidationResponse(raw);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id        : "issue-keep",
      type      : "DUPLICATE_PERSONA",
      severity  : "WARNING",
      confidence: 0.88,
      suggestion: {
        action         : "MERGE",
        targetPersonaId: "p-1",
        sourcePersonaId: "p-2"
      }
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("repairs and parses wrapped markdown json content", () => {
    const raw = [
      "```json",
      "{",
      "  \"issues\": [",
      "    {",
      "      \"type\": \"LOW_CONFIDENCE_ENTITY\",",
      "      \"severity\": \"INFO\",",
      "      \"confidence\": 1.2,",
      "      \"description\": \"建议人工复核\",",
      "      \"evidence\": \"原文线索不足\",",
      "      \"affectedPersonaIds\": [\"p-3\"],",
      "      \"suggestion\": {",
      "        \"action\": \"MANUAL_REVIEW\",",
      "        \"reason\": \"低置信实体\"",
      "      }",
      "    }",
      "  ]",
      "}",
      "```"
    ].join("\n");

    const result = parseValidationResponse(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type              : "LOW_CONFIDENCE_ENTITY",
      severity          : "INFO",
      confidence        : 1,
      affectedPersonaIds: ["p-3"],
      suggestion        : {
        action: "MANUAL_REVIEW",
        reason: "低置信实体"
      }
    });
  });

  // 用例语义：覆盖顶层数组、空白过滤与缺省 issue id 分支。
  it("parses top-level issue arrays and filters malformed fields", () => {
    const raw = JSON.stringify([
      {
        id                : "   ",
        type              : "MISSING_NAME_MAPPING",
        severity          : "WARNING",
        confidence        : -0.4,
        description       : "需要补充别名",
        evidence          : "上下文多次出现同一称呼",
        affectedPersonaIds: ["persona-1", "", "   "],
        affectedChapterIds: ["chapter-1", "", "   "],
        suggestion        : {
          action         : "ADD_ALIAS",
          targetPersonaId: "persona-1",
          newAlias       : "范老爷",
          reason         : "补充稳定别名"
        }
      },
      "not-an-object",
      {
        type       : "DUPLICATE_PERSONA",
        severity   : "WARNING",
        confidence : 0.8,
        description: "",
        evidence   : "证据",
        suggestion : { action: "MERGE", reason: "x" }
      },
      {
        type       : "DUPLICATE_PERSONA",
        severity   : "WARNING",
        confidence : 0.8,
        description: "缺少建议原因",
        evidence   : "证据",
        suggestion : { action: "MERGE" }
      }
    ]);

    const result = parseValidationResponse(raw);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id                : "issue-1",
      type              : "MISSING_NAME_MAPPING",
      severity          : "WARNING",
      confidence        : 0,
      affectedPersonaIds: ["persona-1"],
      affectedChapterIds: ["chapter-1"],
      suggestion        : {
        action         : "ADD_ALIAS",
        targetPersonaId: "persona-1",
        newAlias       : "范老爷",
        reason         : "补充稳定别名"
      }
    });
  });

  // 用例语义：覆盖无法解析与非预期顶层结构分支，保证服务端不会抛出未处理异常。
  it("returns an empty list for unsupported response shapes", () => {
    expect(parseValidationResponse(JSON.stringify({ foo: [] }))).toEqual([]);
  });

  // 用例语义：显式打穿 repairJson 抛错后的告警降级分支，避免解析异常向上冒泡。
  it("returns an empty list and logs a warning when json repair throws", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    vi.resetModules();
    vi.doMock("@/types/analysis", async () => {
      const actual = await vi.importActual<typeof AnalysisTypes>("@/types/analysis");
      return {
        ...actual,
        repairJson: vi.fn(() => {
          throw new Error("repair failed");
        })
      };
    });

    const { parseValidationResponse: parseWithBrokenRepair } = await import("./prompts");

    expect(parseWithBrokenRepair("{broken")).toEqual([]);
    expect(warnSpy).toHaveBeenCalledOnce();

    warnSpy.mockRestore();
    vi.doUnmock("@/types/analysis");
    vi.resetModules();
  });
});
