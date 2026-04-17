import { beforeEach, describe, expect, it, vi } from "vitest";

import type {
  AiCallExecutor,
  ExecuteAiCallInput
} from "@/server/modules/analysis/services/AiCallExecutor";
import type { ResolvedStageModel } from "@/server/modules/analysis/services/ModelStrategyResolver";
import type { ChapterEntityList } from "@/types/analysis";

import { createGlobalEntityResolver } from "@/server/modules/analysis/pipelines/twopass/GlobalEntityResolver";

const {
  createAiProviderClientMock,
  resolvePromptTemplateMock
} = vi.hoisted(() => ({
  createAiProviderClientMock: vi.fn(),
  resolvePromptTemplateMock : vi.fn().mockImplementation(async () => ({ system: "mock-system", user: "mock-user" }))
}));

vi.mock("@/server/providers/ai", () => ({
  createAiProviderClient: createAiProviderClientMock
}));

vi.mock("@/server/modules/knowledge", () => ({
  resolvePromptTemplate: resolvePromptTemplateMock
}));

function buildChapterEntityList(
  chapterNo: number,
  entities: ChapterEntityList["entities"]
): ChapterEntityList {
  return {
    chapterId: `chapter-${chapterNo}`,
    chapterNo,
    entities
  };
}

function buildResolvedStageModel(
  params: Partial<ResolvedStageModel["params"]> = {}
): ResolvedStageModel {
  return {
    modelId    : "model-1",
    provider   : "deepseek",
    modelName  : "deepseek-chat",
    displayName: "DeepSeek Chat",
    baseUrl    : "https://api.deepseek.com",
    apiKey     : "secret-key",
    source     : "GLOBAL",
    params     : {
      temperature    : 0.2,
      maxOutputTokens: 512,
      topP           : 0.9,
      maxRetries     : 2,
      retryBaseMs    : 600,
      ...params
    }
  };
}

function createAiCallExecutorMock(
  model: ResolvedStageModel
): Pick<AiCallExecutor, "execute"> {
  return {
    execute: (vi.fn(async <TData>(input: ExecuteAiCallInput<TData>) => {
      const result = await input.callFn({
        model,
        prompt: input.prompt
      });

      return {
        ...result,
        modelId   : model.modelId,
        isFallback: false
      };
    }) as AiCallExecutor["execute"])
  };
}

describe("GlobalEntityResolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("collects a global dictionary with merged chapters, aliases and longest descriptions", () => {
    const resolver = createGlobalEntityResolver({} as never, {} as never);

    const dict = resolver._collectGlobalDictionary([
      buildChapterEntityList(1, [{
        name       : "范进",
        aliases    : ["范举人"],
        description: "寒门书生",
        category   : "PERSON"
      }]),
      buildChapterEntityList(3, [{
        name       : "范举人",
        aliases    : ["范进士"],
        description: "中举后境遇骤变的寒门书生",
        category   : "PERSON"
      }])
    ]);

    const canonicalEntry = dict.get("范进");
    const aliasEntry = dict.get("范举人");
    if (!canonicalEntry || !aliasEntry) {
      throw new Error("expected 范进 and 范举人 to be collected");
    }

    expect(canonicalEntry.canonicalName).toBe("范进");
    expect(Array.from(canonicalEntry.chapterNos)).toEqual([1]);
    expect(Array.from(canonicalEntry.allNames).sort()).toEqual(["范举人", "范进"]);

    expect(aliasEntry.canonicalName).toBe("范举人");
    expect(Array.from(aliasEntry.chapterNos).sort((a, b) => a - b)).toEqual([1, 3]);
    expect(aliasEntry.description).toBe("中举后境遇骤变的寒门书生");
    expect(Array.from(aliasEntry.allNames).sort()).toEqual(["范举人", "范进", "范进士"]);
  });

  it("builds candidate groups from knowledge-base aliases and surname overlap", () => {
    const resolver = createGlobalEntityResolver({} as never, {} as never);
    const dict = resolver._collectGlobalDictionary([
      buildChapterEntityList(1, [{ name: "范进", aliases: [], description: "书生", category: "PERSON" }]),
      buildChapterEntityList(2, [{ name: "范举人", aliases: [], description: "中举人物", category: "PERSON" }]),
      buildChapterEntityList(3, [{ name: "李四", aliases: [], description: "甲", category: "PERSON" }]),
      buildChapterEntityList(4, [{ name: "李似", aliases: [], description: "乙", category: "PERSON" }]),
      buildChapterEntityList(5, [{ name: "王惠", aliases: ["王太守"], description: "官员", category: "PERSON" }]),
      buildChapterEntityList(6, [{ name: "王老爷", aliases: ["王太守"], description: "敬称", category: "PERSON" }])
    ]);

    const aliasLookup = new Map<string, string>([
      ["范进", "范进"],
      ["范举人", "范进"],
      ["王惠", "王惠"],
      ["王老爷", "王惠"]
    ]);

    const groups = resolver._buildCandidateGroups(dict, aliasLookup);
    const memberSets = groups.map((group) => new Set(group.members.map((member) => member.name)));

    // 范进/范举人 grouped via alias lookup; 王惠/王老爷 grouped via alias lookup + surname+allNames overlap
    // 李四/李似 are NOT grouped: no alias overlap, no allNames overlap (edit distance removed)
    expect(groups).toHaveLength(2);
    expect(memberSets.some((members) => members.has("范进") && members.has("范举人"))).toBe(true);
    expect(memberSets.some((members) => members.has("王惠") && members.has("王老爷"))).toBe(true);
    expect(memberSets.some((members) => members.has("李四") && members.has("李似"))).toBe(false);
  });

  it("creates independent personas without invoking AI when there are no candidate groups", async () => {
    const prismaClient = {
      persona: {
        create: vi.fn()
          .mockResolvedValueOnce({ id: "persona-1" })
          .mockResolvedValueOnce({ id: "persona-2" })
      }
    };
    const aiCallExecutor = {
      execute: vi.fn()
    };
    const resolver = createGlobalEntityResolver(prismaClient as never, aiCallExecutor as never);

    const result = await resolver.resolveGlobalEntities(
      "book-1",
      "测试书籍",
      [
        buildChapterEntityList(1, [{ name: "张宝", aliases: [], description: "甲", category: "PERSON" }]),
        buildChapterEntityList(2, [{ name: "李桂", aliases: [], description: "乙", category: "PERSON" }])
      ],
      { bookId: "book-1", jobId: "job-1" }
    );

    expect(aiCallExecutor.execute).not.toHaveBeenCalled();
    expect(prismaClient.persona.create).toHaveBeenCalledTimes(2);
    expect(result.globalPersonaMap.get("张宝")).toBe("persona-1");
    expect(result.globalPersonaMap.get("李桂")).toBe("persona-2");
    expect(result.profiles).toEqual([
      {
        personaId    : "persona-1",
        canonicalName: "张宝",
        aliases      : ["张宝"],
        localSummary : "甲"
      },
      {
        personaId    : "persona-2",
        canonicalName: "李桂",
        aliases      : ["李桂"],
        localSummary : "乙"
      }
    ]);
  });

  it("merges a KB-covered candidate group directly without invoking LLM and preserves the best description", async () => {
    // Fix T3: KB alias covers all members → directMerge, LLM not called
    const generateJsonMock = vi.fn();
    createAiProviderClientMock.mockReturnValue({
      generateJson: generateJsonMock
    });

    const prismaClient = {
      persona: {
        create: vi.fn()
          .mockResolvedValueOnce({ id: "persona-merged" })
          .mockResolvedValueOnce({ id: "persona-2" })
      }
    };
    const aiCallExecutor = createAiCallExecutorMock(buildResolvedStageModel({
      enableThinking : true,
      reasoningEffort: "medium"
    }));
    const resolver = createGlobalEntityResolver(prismaClient as never, aiCallExecutor as never);

    const result = await resolver.resolveGlobalEntities(
      "book-1",
      "儒林外史",
      [
        buildChapterEntityList(1, [{ name: "范进", aliases: [], description: "寒门书生", category: "PERSON" }]),
        buildChapterEntityList(2, [{ name: "范举人", aliases: [], description: "中举后境遇骤变的寒门书生", category: "PERSON" }]),
        buildChapterEntityList(3, [{ name: "王惠", aliases: [], description: "地方官员", category: "PERSON" }])
      ],
      { bookId: "book-1", jobId: "job-1" },
      {
        aliasLookup: new Map<string, string>([
          ["范进", "范进"],
          ["范举人", "范进"]
        ])
      }
    );

    // KB-covered group: LLM should NOT be called
    expect(generateJsonMock).not.toHaveBeenCalled();

    // Direct merge should use longest name as canonical
    expect(prismaClient.persona.create).toHaveBeenNthCalledWith(1, {
      data: {
        name        : "范举人",
        type        : "PERSON",
        nameType    : "NAMED",
        aliases     : ["范进"],
        confidence  : 0.8,
        recordSource: "AI",
        profiles    : {
          create: {
            bookId      : "book-1",
            localName   : "范举人",
            localSummary: "中举后境遇骤变的寒门书生"
          }
        }
      }
    });
    expect(result.globalPersonaMap.get("范进")).toBe("persona-merged");
    expect(result.globalPersonaMap.get("范举人")).toBe("persona-merged");
    expect(result.globalPersonaMap.get("王惠")).toBe("persona-2");
  });

  it("merges a candidate group through the AI resolution path when aliases do not fully cover all members", async () => {
    // Fix T3: when KB alias does not cover all members, group is sent to LLM
    // Use shared alias to trigger allNames overlap grouping without aliasLookup
    const generateJsonMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        {
          groupId      : 1,
          shouldMerge  : true,
          mergedName   : "范进",
          mergedAliases: ["范进", "范举人"],
          reason       : "同一人物"
        }
      ]),
      usage: { totalTokens: 16 }
    });
    createAiProviderClientMock.mockReturnValue({
      generateJson: generateJsonMock
    });

    const prismaClient = {
      persona: {
        create: vi.fn()
          .mockResolvedValueOnce({ id: "persona-merged" })
          .mockResolvedValueOnce({ id: "persona-2" })
          .mockResolvedValueOnce({ id: "persona-3" })
      }
    };
    const aiCallExecutor = createAiCallExecutorMock(buildResolvedStageModel({
      enableThinking : true,
      reasoningEffort: "medium"
    }));
    const resolver = createGlobalEntityResolver(prismaClient as never, aiCallExecutor as never);

    // 范进/范举人 share alias 范老爷 → allNames overlap → candidate group → sendToLlm (no aliasLookup)
    const result = await resolver.resolveGlobalEntities(
      "book-1",
      "儒林外史",
      [
        buildChapterEntityList(1, [{ name: "范进", aliases: ["范老爷"], description: "寒门书生", category: "PERSON" }]),
        buildChapterEntityList(2, [{ name: "范举人", aliases: ["范老爷"], description: "中举后境遇骤变的寒门书生", category: "PERSON" }]),
        buildChapterEntityList(3, [{ name: "王惠", aliases: [], description: "地方官员", category: "PERSON" }])
      ],
      { bookId: "book-1", jobId: "job-1" },
      {
        lexiconConfig: {
          surnameSingles: ["范", "王"]
        }
      }
      // no aliasLookup → no directMerge → ambiguous group goes to LLM
    );

    expect(resolvePromptTemplateMock).toHaveBeenCalled();
    expect(generateJsonMock).toHaveBeenCalled();
    expect(result.globalPersonaMap.get("范进")).toBe("persona-merged");
    expect(result.globalPersonaMap.get("范举人")).toBe("persona-merged");
    expect(result.globalPersonaMap.get("王惠")).not.toBeUndefined();
  });

  it("keeps candidate members separate when the AI decides not to merge them", async () => {
    const generateJsonMock = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        {
          groupId      : 1,
          shouldMerge  : false,
          mergedName   : "李四",
          mergedAliases: [],
          reason       : "并非同一人物"
        }
      ]),
      usage: { totalTokens: 8 }
    });
    createAiProviderClientMock.mockReturnValue({
      generateJson: generateJsonMock
    });

    const prismaClient = {
      persona: {
        create: vi.fn()
          .mockResolvedValueOnce({ id: "persona-1" })
          .mockResolvedValueOnce({ id: "persona-2" })
      }
    };
    const aiCallExecutor = createAiCallExecutorMock(buildResolvedStageModel({
      temperature    : 0,
      maxOutputTokens: 256,
      topP           : 1
    }));
    const resolver = createGlobalEntityResolver(prismaClient as never, aiCallExecutor as never);

    const result = await resolver.resolveGlobalEntities(
      "book-1",
      "测试书籍",
      [
        buildChapterEntityList(1, [{ name: "李四", aliases: [], description: "甲", category: "PERSON" }]),
        buildChapterEntityList(2, [{ name: "李似", aliases: [], description: "乙", category: "PERSON" }])
      ],
      { bookId: "book-1", jobId: "job-1" }
    );

    expect(prismaClient.persona.create).toHaveBeenCalledTimes(2);
    expect(result.globalPersonaMap.get("李四")).toBe("persona-1");
    expect(result.globalPersonaMap.get("李似")).toBe("persona-2");
  });
});
