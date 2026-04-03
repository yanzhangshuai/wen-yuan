import { describe, expect, it } from "vitest";

import {
  buildBookValidationPrompt,
  buildChapterAnalysisPrompt,
  buildTitleArbitrationPrompt,
  buildChapterValidationPrompt,
  buildRosterDiscoveryPrompt,
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

describe("buildChapterAnalysisPrompt", () => {
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
    expect(prompt.user).toContain("## Known Entities (Context)");
    expect(prompt.user).toContain("[1] 范进 | 别名: 范老爷, 范相公 | 小传: 晚年中举");
    expect(prompt.user).toContain("第 1/3 段");
    expect(prompt.user).toContain("范进见中举，众人态度大变。");
  });

  it("uses fallback context text when there are no known profiles", () => {
    const prompt = buildChapterAnalysisPrompt({
      ...baseInput,
      profiles: []
    });

    expect(prompt.user).toContain("（本书目前尚无已建档人物）");
  });

  it("includes at least 30 generic title examples in default prompt", () => {
    // Arrange
    const prompt = buildChapterAnalysisPrompt({
      ...baseInput,
      profiles: []
    });

    // Act
    // 从规则行提取示例串，验证“>=30”的文档约束是否真正写入 prompt 文本。
    const match = prompt.user.match(/GENERIC TITLES:\s*(.+?)无法唯一指向具体人物/);
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

describe("buildRosterDiscoveryPrompt", () => {
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

describe("buildTitleArbitrationPrompt", () => {
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
});

describe("buildChapterValidationPrompt", () => {
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

describe("buildBookValidationPrompt", () => {
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

describe("parseValidationResponse", () => {
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
});
