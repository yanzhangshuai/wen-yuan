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
  parseValidationResponse
} from "./prompts";

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
