/**
 * 文件定位（类型与契约测试）：
 * - 覆盖 TypeScript 类型层的业务契约与辅助行为，属于跨层公共定义验证。
 * - 该文件用于防止类型漂移导致前后端字段语义不一致。
 *
 * 业务职责：
 * - 约束关键枚举/结构在演进过程中的兼容性。
 * - 让维护者在修改类型时能及时感知破坏性变更。
 */

import { describe, expect, it } from "vitest";

import { parseChapterAnalysisResponse, parseEnhancedChapterRosterResponse, repairJson, parseTitleResolutionResponse } from "./analysis";

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("parseChapterAnalysisResponse", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("normalizes valid items and drops invalid records", () => {
    const result = parseChapterAnalysisResponse(
      JSON.stringify({
        biographies: [
          {
            personaName: "范进",
            category   : "CAREER",
            event      : "中举后仕途起步",
            title      : "举人",
            location   : "广东",
            virtualYear: "万历年间",
            ironyNote  : "众人态度骤变"
          },
          {
            personaName: "胡屠户",
            category   : "INVALID",
            event      : "不应保留"
          },
          "not-an-object"
        ],
        mentions: [
          {
            personaName: "范进",
            rawText    : "范进见中举，众人态度大变。",
            summary    : "范进中举",
            paraIndex  : 3
          },
          {
            personaName: "张静斋",
            rawText    : "张静斋来访。",
            summary    : 123,
            paraIndex  : "4"
          },
          {
            personaName: 1,
            rawText    : "不会通过过滤"
          }
        ],
        relationships: [
          {
            sourceName : "胡屠户",
            targetName : "范进",
            type       : "姻亲",
            weight     : 0.8,
            description: "态度明显转变",
            evidence   : "胡屠户在范进中举后态度骤变"
          },
          {
            sourceName : "张静斋",
            targetName : "范进",
            type       : "结交",
            weight     : "heavy",
            description: 0
          },
          {
            sourceName: "无效关系",
            type      : "缺少目标"
          }
        ]
      })
    );

    expect(result).toEqual({
      biographies: [
        {
          personaName: "范进",
          category   : "CAREER",
          event      : "中举后仕途起步",
          title      : "举人",
          location   : "广东",
          virtualYear: "万历年间",
          ironyNote  : "众人态度骤变"
        }
      ],
      mentions: [
        {
          personaName: "范进",
          rawText    : "范进见中举，众人态度大变。",
          summary    : "范进中举",
          paraIndex  : 3
        },
        {
          personaName: "张静斋",
          rawText    : "张静斋来访。",
          summary    : undefined,
          paraIndex  : undefined
        }
      ],
      relationships: [
        {
          sourceName : "胡屠户",
          targetName : "范进",
          type       : "姻亲",
          weight     : 0.8,
          description: "态度明显转变",
          evidence   : "胡屠户在范进中举后态度骤变"
        },
        {
          sourceName : "张静斋",
          targetName : "范进",
          type       : "结交",
          weight     : undefined,
          description: undefined,
          evidence   : undefined
        }
      ]
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("falls back to empty arrays when sections are missing or malformed", () => {
    const result = parseChapterAnalysisResponse(
      JSON.stringify({
        biographies  : null,
        mentions     : {},
        relationships: "not-array"
      })
    );

    expect(result).toEqual({
      biographies  : [],
      mentions     : [],
      relationships: []
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws when top-level json is not an object", () => {
    expect(() => parseChapterAnalysisResponse("[]")).toThrowError("AI response is not a JSON object");
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("parseEnhancedChapterRosterResponse", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("parses alias fields when enhanced attributes are provided", () => {
    const result = parseEnhancedChapterRosterResponse(JSON.stringify([
      {
        surfaceForm        : "太祖皇帝",
        isNew              : true,
        isTitleOnly        : true,
        aliasType          : "TITLE",
        contextHint        : "文中提及明朝开国，与朱元璋事迹吻合",
        suggestedRealName  : "朱元璋",
        aliasConfidence    : 0.9,
        coOccurringPersonas: ["范进"]
      }
    ]));

    expect(result).toEqual([
      {
        surfaceForm      : "太祖皇帝",
        entityId         : undefined,
        isNew            : true,
        generic          : false,
        isTitleOnly      : true,
        aliasType        : "TITLE",
        suggestedRealName: "朱元璋",
        aliasConfidence  : 0.9,
        contextHint      : {
          alias              : "太祖皇帝",
          aliasType          : "TITLE",
          coOccurringPersonas: ["范进"],
          contextClue        : "文中提及明朝开国，与朱元璋事迹吻合",
          suggestedRealName  : "朱元璋",
          confidence         : 0.9
        }
      }
    ]);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("remains backward-compatible when alias fields are absent", () => {
    const result = parseEnhancedChapterRosterResponse(JSON.stringify([
      {
        surfaceForm: "范举人",
        entityId   : 1
      },
      {
        surfaceForm: "那人",
        generic    : true
      }
    ]));

    expect(result).toEqual([
      {
        surfaceForm      : "范举人",
        entityId         : 1,
        isNew            : false,
        generic          : false,
        isTitleOnly      : false,
        aliasType        : undefined,
        contextHint      : undefined,
        suggestedRealName: undefined,
        aliasConfidence  : undefined
      },
      {
        surfaceForm      : "那人",
        entityId         : undefined,
        isNew            : false,
        generic          : true,
        isTitleOnly      : false,
        aliasType        : undefined,
        contextHint      : undefined,
        suggestedRealName: undefined,
        aliasConfidence  : undefined
      }
    ]);
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("repairJson", () => {
  

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns valid JSON unchanged", () => {
    const input = JSON.stringify([{ a: 1 }]);
    expect(repairJson(input)).toBe(input);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("strips Markdown code block wrappers", () => {
    const inner = JSON.stringify([{ b: 2 }]);
    const wrapped = "```json\n" + inner + "\n```";
    expect(JSON.parse(repairJson(wrapped))).toEqual([{ b: 2 }]);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("repairs truncated array by closing brackets", () => {
    // 截断到第一个完整对象之后
    const truncated = '[{"name":"范进","id":1},{"name":"胡屠户"},"extra';
    const result = repairJson(truncated);
    const parsed = JSON.parse(result);
    expect(parsed).toEqual([{ name: "范进", id: 1 }, { name: "胡屠户" }]);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns empty array for unrecoverable truncation", () => {
    const broken = "[{";
    expect(repairJson(broken)).toBe("[]");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns empty object for unrecoverable object truncation", () => {
    const broken = '{"key';
    expect(repairJson(broken)).toBe("{}");
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("parseTitleResolutionResponse", () => {
  

  const personaIdByTitle = new Map([
    ["太祖皇帝", "persona-taizu"],
    ["丞相", "persona-chengxiang"]
  ]);

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("parses valid resolutions with persona mapping", () => {
    const raw = JSON.stringify([
      { title: "太祖皇帝", realName: "朱元璋", confidence: 0.95, historicalNote: "明太祖" },
      { title: "丞相", realName: null, confidence: 0.3 }
    ]);
    const result = parseTitleResolutionResponse(raw, personaIdByTitle);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      personaId     : "persona-taizu",
      title         : "太祖皇帝",
      realName      : "朱元璋",
      confidence    : 0.95,
      historicalNote: "明太祖"
    });
    expect(result[1].realName).toBeNull();
    expect(result[1].confidence).toBe(0.3);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("skips entries without matching persona ID", () => {
    const raw = JSON.stringify([
      { title: "未知称号", realName: "某人", confidence: 0.8 }
    ]);
    const result = parseTitleResolutionResponse(raw, personaIdByTitle);
    expect(result).toHaveLength(0);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("clamps confidence to [0, 1]", () => {
    const raw = JSON.stringify([
      { title: "太祖皇帝", realName: "朱元璋", confidence: 1.5 }
    ]);
    const result = parseTitleResolutionResponse(raw, personaIdByTitle);
    expect(result[0].confidence).toBe(1);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns empty array for invalid JSON", () => {
    const result = parseTitleResolutionResponse("not json", personaIdByTitle);
    expect(result).toEqual([]);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns empty array for non-array JSON", () => {
    const result = parseTitleResolutionResponse('{"key":"value"}', personaIdByTitle);
    expect(result).toEqual([]);
  });
});
