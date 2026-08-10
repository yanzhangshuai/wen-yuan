import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseSkillMetadata } from "@/server/modules/skills/content-schema";
import {
  assembleSkillMarkdown,
  buildSkillGenerationUserPrompt,
  createAiSkillGenerator
} from "@/server/modules/skills/aiSkillGenerator";

const { loadDefaultModelMock, callJsonLlmMock, createSkillMock } = vi.hoisted(() => ({
  loadDefaultModelMock: vi.fn(),
  callJsonLlmMock     : vi.fn(),
  createSkillMock     : vi.fn()
}));

vi.mock("@/server/modules/models/defaultModel", () => ({
  loadSystemDefaultModel: loadDefaultModelMock
}));

vi.mock("@/server/providers/ai/callJsonLlm", () => ({
  callJsonLlm: callJsonLlmMock
}));

vi.mock("@/server/modules/skills/skillService", () => ({
  createSkillService: () => ({ createSkill: createSkillMock })
}));

const MOCK_MODEL = {
  modelId    : "model-1",
  provider   : "deepseek",
  protocol   : "openai-compatible",
  modelName  : "deepseek-chat",
  displayName: "DeepSeek",
  baseUrl    : "https://api.example.com",
  apiKey     : "sk-test",
  params     : { maxRetries: 0, retryBaseMs: 0 }
};

const VALID_OUTPUT = {
  name       : "科举知识",
  description: "科举相关的称谓与关系码知识",
  scope      : "GLOBAL" as const,
  body       : "# 科举知识\n\n正文内容。"
};

function prismaMock() {
  return {
    skill: {
      findMany: vi.fn().mockResolvedValue([])
    }
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("buildSkillGenerationUserPrompt", () => {
  it("包含用途描述与可选约束", () => {
    const prompt = buildSkillGenerationUserPrompt({
      purpose: "科举相关知识",
      name   : "科举",
      scope  : "GLOBAL"
    });
    expect(prompt).toContain("科举相关知识");
    expect(prompt).toContain("科举");
    expect(prompt).toContain("GLOBAL");
  });

  it("无约束时仅含用途", () => {
    const prompt = buildSkillGenerationUserPrompt({ purpose: "简化测试" });
    expect(prompt).toContain("简化测试");
    expect(prompt).not.toContain("约束");
  });
});

describe("assembleSkillMarkdown", () => {
  it("组装出的 frontmatter 可被装载校验解析", () => {
    const markdown = assembleSkillMarkdown(VALID_OUTPUT);
    const metadata = parseSkillMetadata(markdown);
    expect(metadata.name).toBe("科举知识");
    expect(metadata.description).toBe("科举相关的称谓与关系码知识");
    expect(markdown).toContain("# 科举知识");
  });
});

describe("createAiSkillGenerator.generateSkillFromPrompt", () => {
  it("调用默认模型并创建技能（默认启用）", async () => {
    loadDefaultModelMock.mockResolvedValue(MOCK_MODEL);
    callJsonLlmMock.mockResolvedValue({ data: VALID_OUTPUT, usage: null });
    createSkillMock.mockResolvedValue({ id: "skill-ai", slug: "ai-科举知识", name: "科举知识" });

    const generator = createAiSkillGenerator(prismaMock() as never);
    const result = await generator.generateSkillFromPrompt({ purpose: "科举相关知识" });

    expect(result.status).toBe("ENABLED");
    expect(result.skillId).toBe("skill-ai");
    expect(loadDefaultModelMock).toHaveBeenCalledTimes(1);
    expect(callJsonLlmMock).toHaveBeenCalledTimes(1);
    expect(createSkillMock).toHaveBeenCalledWith(expect.objectContaining({
      slug : "ai-科举知识",
      scope: "GLOBAL"
    }));
  });

  it("空用途抛错且不调用模型", async () => {
    const generator = createAiSkillGenerator(prismaMock() as never);
    await expect(generator.generateSkillFromPrompt({ purpose: "   " })).rejects.toThrow("请描述技能用途");
    expect(callJsonLlmMock).not.toHaveBeenCalled();
  });

  it("AI 输出结构非法时抛错", async () => {
    loadDefaultModelMock.mockResolvedValue(MOCK_MODEL);
    callJsonLlmMock.mockResolvedValue({ data: { name: "缺字段" }, usage: null });

    const generator = createAiSkillGenerator(prismaMock() as never);
    await expect(generator.generateSkillFromPrompt({ purpose: "测试" })).rejects.toThrow("结构不合法");
    expect(createSkillMock).not.toHaveBeenCalled();
  });

  it("generateSkillMarkdown 只生成不落库", async () => {
    loadDefaultModelMock.mockResolvedValue(MOCK_MODEL);
    callJsonLlmMock.mockResolvedValue({ data: VALID_OUTPUT, usage: null });

    const generator = createAiSkillGenerator(prismaMock() as never);
    const { draft, markdown } = await generator.generateSkillMarkdown({ purpose: "科举相关知识" });

    expect(draft.name).toBe("科举知识");
    expect(markdown).toContain("# 科举知识");
    expect(createSkillMock).not.toHaveBeenCalled();
  });
});
