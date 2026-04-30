import { beforeEach, describe, expect, it, vi } from "vitest";

import { reviewGeneratedRelationshipTypes } from "@/server/modules/knowledge/generateRelationshipTypes";

interface SchemaParseInput {
  schema: {
    parse: (payload: unknown) => unknown;
  };
}

const modelInfo = {
  id       : "model-1",
  provider : "DEEPSEEK",
  protocol : "openai-compatible",
  modelName: "deepseek-chat"
};

const hoisted = vi.hoisted(() => ({
  prisma: {
    relationshipTypeDefinition: {
      findMany: vi.fn()
    }
  },
  executeKnowledgeJsonGeneration: vi.fn()
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: hoisted.prisma
}));

vi.mock("@/server/modules/knowledge/generation-utils", () => ({
  executeKnowledgeJsonGeneration: hoisted.executeKnowledgeJsonGeneration
}));

describe("generateRelationshipTypes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    hoisted.executeKnowledgeJsonGeneration.mockResolvedValue({
      parsed    : [],
      rawContent: "[]",
      model     : modelInfo
    });
  });

  it("rejects behavior or attitude words because they belong in relationship archives", async () => {
    hoisted.prisma.relationshipTypeDefinition.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    hoisted.executeKnowledgeJsonGeneration.mockResolvedValueOnce({
      parsed: [
        {
          name           : "奉承",
          group          : "利益关系",
          directionMode  : "DIRECTED",
          sourceRoleLabel: "奉承者",
          edgeLabel      : "奉承",
          aliases        : ["讨好"],
          examples       : [],
          confidence     : 0.9
        }
      ],
      rawContent: "[]",
      model     : modelInfo
    });

    const result = await reviewGeneratedRelationshipTypes({ targetCount: 1 });

    expect(result.candidates[0]).toMatchObject({
      name             : "奉承",
      defaultSelected  : false,
      recommendedAction: "REJECT",
      rejectionReason  : "“奉承”是行为/态度词，应进入关系档案事件标签"
    });
  });

  it("rejects inverse candidates that do not provide both role labels", async () => {
    hoisted.prisma.relationshipTypeDefinition.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    hoisted.executeKnowledgeJsonGeneration.mockResolvedValueOnce({
      parsed: [
        {
          name           : "师徒",
          group          : "师承",
          directionMode  : "INVERSE",
          sourceRoleLabel: "师父",
          edgeLabel      : "师徒",
          aliases        : [],
          examples       : [],
          confidence     : 0.85
        }
      ],
      rawContent: "[]",
      model     : modelInfo
    });

    const result = await reviewGeneratedRelationshipTypes({ targetCount: 1 });

    expect(result.candidates[0]).toMatchObject({
      name             : "师徒",
      defaultSelected  : false,
      recommendedAction: "REJECT",
      rejectionReason  : "互逆关系缺少双向称谓"
    });
  });

  it("filters candidates whose name or aliases conflict with active existing entries", async () => {
    hoisted.prisma.relationshipTypeDefinition.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ name: "岳婿", aliases: ["丈人"] }]);
    hoisted.executeKnowledgeJsonGeneration.mockResolvedValueOnce({
      parsed: [
        {
          name           : "翁婿",
          group          : "姻亲",
          directionMode  : "INVERSE",
          sourceRoleLabel: "岳父",
          targetRoleLabel: "女婿",
          edgeLabel      : "翁婿",
          aliases        : ["丈人"],
          examples       : [],
          confidence     : 0.92
        }
      ],
      rawContent: "[]",
      model     : modelInfo
    });

    const result = await reviewGeneratedRelationshipTypes({ targetCount: 1 });

    expect(result.candidates).toHaveLength(0);
    expect(result.candidates.map((candidate) => candidate.name)).not.toContain("翁婿");
    expect(result.skipped).toBe(1);
    expect(result.skippedExisting).toBe(1);
  });

  it("filters existing entries while keeping valid new candidates", async () => {
    hoisted.prisma.relationshipTypeDefinition.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ name: "岳婿", aliases: ["丈人"] }]);
    hoisted.executeKnowledgeJsonGeneration.mockResolvedValueOnce({
      parsed: [
        {
          name           : "岳婿",
          group          : "姻亲",
          directionMode  : "INVERSE",
          sourceRoleLabel: "岳父",
          targetRoleLabel: "女婿",
          edgeLabel      : "岳婿",
          aliases        : ["丈人"],
          examples       : [],
          confidence     : 0.92
        },
        {
          name         : "义兄弟",
          group        : "情感关系",
          directionMode: "SYMMETRIC",
          edgeLabel    : "义兄弟",
          aliases      : ["结义兄弟"],
          examples     : [],
          confidence   : 0.88
        }
      ],
      rawContent: "[]",
      model     : modelInfo
    });

    const result = await reviewGeneratedRelationshipTypes({ targetCount: 2 });

    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      name             : "义兄弟",
      defaultSelected  : true,
      recommendedAction: "SELECT"
    });
    expect(result.candidates.map((candidate) => candidate.name)).not.toContain("岳婿");
    expect(result.skipped).toBe(1);
    expect(result.skippedExisting).toBe(1);
  });

  it("accepts null optional text fields for symmetric candidates and normalizes them to null", async () => {
    hoisted.prisma.relationshipTypeDefinition.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    hoisted.executeKnowledgeJsonGeneration.mockImplementationOnce((input: SchemaParseInput) => {
      const payload = [
        {
          name            : "同盟",
          group           : "利益关系",
          directionMode   : "SYMMETRIC",
          sourceRoleLabel : null,
          targetRoleLabel : null,
          edgeLabel       : "同盟",
          reverseEdgeLabel: null,
          aliases         : ["  盟友  ", null],
          description     : null,
          usageNotes      : null,
          examples        : ["  共同对敌  ", null],
          confidence      : 0.82
        }
      ];

      return Promise.resolve({
        parsed    : input.schema.parse(payload),
        rawContent: JSON.stringify(payload),
        model     : modelInfo
      });
    });

    const result = await reviewGeneratedRelationshipTypes({ targetCount: 1 });

    expect(result.candidates[0]).toMatchObject({
      name             : "同盟",
      sourceRoleLabel  : null,
      targetRoleLabel  : null,
      reverseEdgeLabel : null,
      description      : null,
      usageNotes       : null,
      aliases          : ["盟友"],
      examples         : ["共同对敌"],
      defaultSelected  : true,
      recommendedAction: "SELECT"
    });
  });

  it("rejects inverse and directed candidates with null required role labels after schema validation", async () => {
    hoisted.prisma.relationshipTypeDefinition.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    hoisted.executeKnowledgeJsonGeneration.mockImplementationOnce((input: SchemaParseInput) => {
      const payload = [
        {
          name           : "师徒",
          group          : "师承",
          directionMode  : "INVERSE",
          sourceRoleLabel: "师父",
          targetRoleLabel: null,
          edgeLabel      : "师徒",
          aliases        : [],
          examples       : [],
          confidence     : 0.88
        },
        {
          name           : "保护",
          group          : "权力关系",
          directionMode  : "DIRECTED",
          sourceRoleLabel: null,
          targetRoleLabel: "受保护者",
          edgeLabel      : "保护",
          aliases        : [],
          examples       : [],
          confidence     : 0.86
        }
      ];

      return Promise.resolve({
        parsed    : input.schema.parse(payload),
        rawContent: JSON.stringify(payload),
        model     : modelInfo
      });
    });

    const result = await reviewGeneratedRelationshipTypes({ targetCount: 2 });

    expect(result.candidates).toHaveLength(2);
    expect(result.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name             : "师徒",
        targetRoleLabel  : null,
        defaultSelected  : false,
        recommendedAction: "REJECT",
        rejectionReason  : "互逆关系缺少双向称谓"
      }),
      expect.objectContaining({
        name             : "保护",
        sourceRoleLabel  : null,
        defaultSelected  : false,
        recommendedAction: "REJECT",
        rejectionReason  : "单向关系缺少 source 侧称谓"
      })
    ]));
  });
});
