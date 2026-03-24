import { describe, expect, it } from "vitest";

import { parseChapterAnalysisResponse } from "./analysis";

describe("parseChapterAnalysisResponse", () => {
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
            description: "态度明显转变"
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
          description: "态度明显转变"
        },
        {
          sourceName : "张静斋",
          targetName : "范进",
          type       : "结交",
          weight     : undefined,
          description: undefined
        }
      ]
    });
  });

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

  it("throws when top-level json is not an object", () => {
    expect(() => parseChapterAnalysisResponse("[]")).toThrowError("AI response is not a JSON object");
  });
});
