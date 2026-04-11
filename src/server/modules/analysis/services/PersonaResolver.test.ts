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

import { calculateSubstringMatchScore, createPersonaResolver, GENERIC_TITLES } from "@/server/modules/analysis/services/PersonaResolver";
import type { AliasRegistryService } from "@/server/modules/analysis/services/AliasRegistryService";
import { ANALYSIS_PIPELINE_CONFIG } from "@/server/modules/analysis/config/pipeline";
import { classifyPersonalization, DEFAULT_SOFT_BLOCK_SUFFIXES, HARD_BLOCK_SUFFIXES } from "@/server/modules/analysis/config/lexicon";

function createPrismaMock() {
  const personaFindMany = vi.fn();
  const personaFindUnique = vi.fn().mockResolvedValue(null);
  const personaUpdate = vi.fn().mockResolvedValue({});
  const personaCreate = vi.fn().mockResolvedValue({
    id  : "new-persona-id",
    name: "新人物"
  });
  const profileUpsert = vi.fn().mockResolvedValue({});
  const profileCreate = vi.fn().mockResolvedValue({});
  const aliasMappingFindMany = vi.fn().mockResolvedValue([]);
  const mentionFindMany = vi.fn().mockResolvedValue([]);

  return {
    prisma: {
      persona: {
        findMany  : personaFindMany,
        findUnique: personaFindUnique,
        update    : personaUpdate,
        create    : personaCreate
      },
      profile: {
        upsert: profileUpsert,
        create: profileCreate
      },
      aliasMapping: { findMany: aliasMappingFindMany },
      mention     : { findMany: mentionFindMany }
    } as never,
    personaFindMany,
    personaFindUnique,
    personaUpdate,
    personaCreate,
    profileUpsert,
    profileCreate,
    aliasMappingFindMany,
    mentionFindMany
  };
}

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("persona resolver", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("resolves by alias registry fast-path when confidence is high enough", async () => {
    const { prisma, personaFindMany, profileUpsert } = createPrismaMock();
    const lookupAlias = vi.fn().mockResolvedValue({
      alias       : "范老爷",
      resolvedName: "范进",
      personaId   : "persona-fanjin",
      aliasType   : "NICKNAME",
      confidence  : 0.86,
      evidence    : "上下文共现",
      status      : "CONFIRMED"
    });
    const aliasRegistry: AliasRegistryService = {
      lookupAlias,
      registerAlias      : vi.fn(),
      loadBookAliasCache : vi.fn(),
      listPendingMappings: vi.fn(),
      listReviewMappings : vi.fn(),
      updateMappingStatus: vi.fn()
    };
    const resolver = createPersonaResolver(prisma, aliasRegistry);

    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "范老爷",
      chapterContent: "范老爷今日登门。",
      chapterNo     : 3
    });

    expect(result).toEqual({
      status     : "resolved",
      personaId  : "persona-fanjin",
      confidence : 0.86,
      matchedName: "范进"
    });
    expect(lookupAlias).toHaveBeenCalledWith("book-1", "范老爷", 3);
    expect(profileUpsert).toHaveBeenCalledTimes(1);
    expect(personaFindMany).not.toHaveBeenCalled();
  });

  // 用例语义：单字称呼误报率极高，应在任何 DB 查询前直接拦截。
  it("marks too-short extracted names as hallucinated", async () => {
    const { prisma, personaFindMany } = createPrismaMock();
    const resolver = createPersonaResolver(prisma);

    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "张",
      chapterContent: "张在门外。"
    });

    expect(result).toEqual({
      status    : "hallucinated",
      confidence: 0,
      reason    : "name_too_short"
    });
    expect(personaFindMany).not.toHaveBeenCalled();
  });

  // 用例语义：超长字符串通常是整句误切，必须在解析主流程前直接过滤。
  it("marks overlong extracted names as hallucinated", async () => {
    const { prisma, personaFindMany } = createPrismaMock();
    const resolver = createPersonaResolver(prisma);

    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "这是一个明显过长的人名片段",
      chapterContent: "这是一个明显过长的人名片段出现在正文里。"
    });

    expect(result).toEqual({
      status    : "hallucinated",
      confidence: 0,
      reason    : "name_too_long"
    });
    expect(personaFindMany).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("marks empty extracted name as hallucinated", async () => {
    const { prisma, personaFindMany } = createPrismaMock();
    const resolver = createPersonaResolver(prisma);

    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "  ，  ",
      chapterContent: "任意内容"
    });

    expect(result).toEqual({
      status    : "hallucinated",
      confidence: 0,
      reason    : "empty_name"
    });
    expect(personaFindMany).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("resolves to existing persona and appends alias when needed", async () => {
    const {
      prisma,
      personaFindMany,
      personaUpdate,
      profileUpsert
    } = createPrismaMock();

    personaFindMany.mockResolvedValueOnce([
      {
        id      : "persona-1",
        name    : "zhangsan",
        aliases : ["老张"],
        profiles: [{ localName: "张三" }]
      }
    ]);

    const resolver = createPersonaResolver(prisma);

    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "zhang-san",
      chapterContent: "zhang-san 出现在章节里"
    });

    expect(result.status).toBe("resolved");
    expect(result.personaId).toBe("persona-1");
    expect(result.confidence).toBe(1);
    expect(profileUpsert).toHaveBeenCalledTimes(1);
    expect(personaUpdate).toHaveBeenCalledWith({
      where: { id: "persona-1" },
      data : { aliases: { push: "zhang-san" } }
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("resolves without alias update when extracted name already in aliases", async () => {
    const {
      prisma,
      personaFindMany,
      personaUpdate,
      profileUpsert
    } = createPrismaMock();

    personaFindMany.mockResolvedValueOnce([
      {
        id      : "persona-2",
        name    : "王五",
        aliases : ["王五大人"],
        profiles: [{ localName: "王五" }]
      }
    ]);

    const resolver = createPersonaResolver(prisma);

    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "王五大人",
      chapterContent: "王五大人来到书院。"
    });

    expect(result.status).toBe("resolved");
    expect(profileUpsert).toHaveBeenCalledTimes(1);
    expect(personaUpdate).not.toHaveBeenCalled();
  });

  it("boosts ranked honorific alias to unique same-surname canonical candidate", async () => {
    const {
      prisma,
      personaFindMany,
      personaUpdate,
      profileUpsert
    } = createPrismaMock();

    personaFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id      : "persona-machunshang",
          name    : "马纯上",
          aliases : [],
          profiles: [{ localName: "马纯上" }]
        },
        {
          id      : "persona-fanjin",
          name    : "范进",
          aliases : [],
          profiles: [{ localName: "范进" }]
        }
      ]);

    const resolver = createPersonaResolver(prisma);
    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "马二先生",
      chapterContent: "马二先生摇头叹气。"
    });

    expect(result.status).toBe("resolved");
    expect(result.personaId).toBe("persona-machunshang");
    expect(result.matchedName).toBe("马纯上");
    expect(result.confidence).toBeGreaterThanOrEqual(ANALYSIS_PIPELINE_CONFIG.personaResolveMinScore);
    expect(profileUpsert).toHaveBeenCalledTimes(1);
    expect(personaUpdate).toHaveBeenCalledWith({
      where: { id: "persona-machunshang" },
      data : { aliases: { push: "马二先生" } }
    });
  });

  it("does not boost ranked honorific alias when same-surname canonical candidates are ambiguous", async () => {
    const {
      prisma,
      personaFindMany,
      personaCreate,
      personaUpdate,
      profileCreate
    } = createPrismaMock();

    personaFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id      : "persona-machunshang",
          name    : "马纯上",
          aliases : [],
          profiles: [{ localName: "马纯上" }]
        },
        {
          id      : "persona-majingzhai",
          name    : "马静斋",
          aliases : [],
          profiles: [{ localName: "马静斋" }]
        }
      ]);
    personaCreate.mockResolvedValueOnce({
      id  : "created-maerxiansheng",
      name: "马二先生"
    });

    const resolver = createPersonaResolver(prisma);
    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "马二先生",
      chapterContent: "马二先生在县学门口等候。"
    });

    expect(result.status).toBe("created");
    expect(result.personaId).toBe("created-maerxiansheng");
    expect(personaUpdate).not.toHaveBeenCalled();
    expect(profileCreate).toHaveBeenCalledTimes(1);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("marks as hallucinated when score is low and name is absent in chapter", async () => {
    const {
      prisma,
      personaFindMany,
      personaCreate,
      profileCreate
    } = createPrismaMock();

    // no direct match -> fallback candidates
    personaFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id      : "persona-3",
          name    : "李四",
          aliases : ["李四郎"],
          profiles: [{ localName: "李四" }]
        }
      ]);

    const resolver = createPersonaResolver(prisma);
    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "赵六",
      chapterContent: "这一段没有对应名字。"
    });

    expect(result).toEqual({
      status     : "hallucinated",
      confidence : expect.any(Number),
      matchedName: "李四",
      reason     : "name_not_in_chapter"
    });
    expect(personaCreate).not.toHaveBeenCalled();
    expect(profileCreate).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("creates a new persona when score is low but name appears in chapter", async () => {
    const {
      prisma,
      personaFindMany,
      personaCreate,
      profileCreate
    } = createPrismaMock();

    personaFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id      : "persona-4",
          name    : "苏轼",
          aliases : ["苏子瞻"],
          profiles: [{ localName: "东坡" }]
        }
      ]);
    personaCreate.mockResolvedValueOnce({
      id  : "created-1",
      name: "赵六"
    });

    const resolver = createPersonaResolver(prisma);
    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "赵六",
      chapterContent: "赵六在此处首次出现。"
    });

    expect(result).toEqual({
      status     : "created",
      personaId  : "created-1",
      confidence : expect.any(Number),
      matchedName: "赵六"
    });
    expect(personaCreate).toHaveBeenCalledWith({
      data: {
        name      : "赵六",
        type      : "PERSON",
        nameType  : "NAMED",
        aliases   : ["赵六"],
        confidence: expect.any(Number)
      }
    });
    expect(profileCreate).toHaveBeenCalledWith({
      data: {
        personaId: "created-1",
        bookId   : "book-1",
        localName: "赵六"
      }
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("uses explicit transaction client when provided", async () => {
    const { prisma, personaFindMany } = createPrismaMock();
    const txPersonaFindMany = vi.fn().mockResolvedValueOnce([
      {
        id      : "persona-tx",
        name    : "tx-user",
        aliases : [],
        profiles: []
      }
    ]);
    const txProfileUpsert = vi.fn().mockResolvedValue({});
    const txPersonaUpdate = vi.fn().mockResolvedValue({});

    const resolver = createPersonaResolver(prisma);

    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "tx-user",
      chapterContent: "tx-user 出现"
    }, {
      persona: {
        findMany: txPersonaFindMany,
        update  : txPersonaUpdate
      },
      profile: {
        upsert: txProfileUpsert
      }
    } as never);

    expect(result.status).toBe("resolved");
    expect(txPersonaFindMany).toHaveBeenCalledTimes(1);
    expect(txProfileUpsert).toHaveBeenCalledTimes(1);
    expect(personaFindMany).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("marks generic titles as hallucinated without DB queries", async () => {
    const { prisma, personaFindMany } = createPrismaMock();
    const resolver = createPersonaResolver(prisma);

    for (const title of ["老爷", "夫人", "众人", "掌柜的", "丫鬟"]) {
      const result = await resolver.resolve({
        bookId        : "book-1",
        extractedName : title,
        chapterContent: `${title}出现了`
      });
      expect(result).toEqual({
        status    : "hallucinated",
        confidence: title === "众人" || title === "丫鬟" ? 1.0 : 0.9,
        reason    : title === "众人" || title === "丫鬟" ? "safety_generic" : "config_generic"
      });
    }
    expect(personaFindMany).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("GENERIC_TITLES set contains expected common titles", () => {
    expect(GENERIC_TITLES.has("老爷")).toBe(true);
    expect(GENERIC_TITLES.has("夫人")).toBe(true);
    expect(GENERIC_TITLES.has("众人")).toBe(true);
    expect(GENERIC_TITLES.has("书办")).toBe(true);
    expect(GENERIC_TITLES.has("掌舵")).toBe(true);
    expect(GENERIC_TITLES.has("按察司")).toBe(true);
    expect(GENERIC_TITLES.has("范进")).toBe(false);
    expect(GENERIC_TITLES.has("严监生")).toBe(false);
    expect(GENERIC_TITLES.has("蒋书办")).toBe(false);  // 有姓前缀，不是泛称
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("不将[姓名 + 亲属后缀]字符串合并到原始姓名 persona", async () => {
    const {
      prisma,
      personaFindMany,
      personaCreate,
      profileCreate
    } = createPrismaMock();

    // 已存在 persona "蘧公孙"
    personaFindMany
      .mockResolvedValueOnce([{  // 直接召回
        id      : "persona-qugongson",
        name    : "蘧公孙",
        aliases : [],
        profiles: [{ localName: "蘧公孙" }]
      }])
      .mockResolvedValueOnce([]); // 兜底候选空

    // "蘧公孙父亲" 不应与 "蘧公孙" 合并，应新建 persona
    personaCreate.mockResolvedValueOnce({
      id  : "persona-qugongson-father",
      name: "蘧公孙父亲"
    });

    const resolver = createPersonaResolver(prisma);
    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "蘧公孙父亲",
      chapterContent: "蘧公孙父亲也到了场上。"
    });

    // 因为后缀是亲属词，不应解析为"蘧公孙"，应新建
    expect(result.status).toBe("created");
    expect(personaCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ name: "蘧公孙父亲" })
    }));
    expect(profileCreate).toHaveBeenCalledTimes(1);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("通过 titleOnlyNames 创建 TITLE_ONLY persona", async () => {
    const {
      prisma,
      personaFindMany,
      personaCreate,
      profileCreate
    } = createPrismaMock();

    personaFindMany
      .mockResolvedValueOnce([])  // no direct match
      .mockResolvedValueOnce([]); // no fallback candidates
    personaCreate.mockResolvedValueOnce({
      id  : "title-persona-1",
      name: "太祖皇帝"
    });

    const resolver = createPersonaResolver(prisma);
    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "太祖皇帝",
      chapterContent: "太祖皇帝颂布科举评假。",
      titleOnlyNames: new Set(["太祖皇帝"])
    });

    expect(result.status).toBe("created");
    expect(result.personaId).toBe("title-persona-1");
    expect(personaCreate).toHaveBeenCalledWith({
      data: {
        name      : "太祖皇帝",
        type      : "PERSON",
        nameType  : "TITLE_ONLY",
        aliases   : ["太祖皇帝"],
        confidence: expect.any(Number)
      }
    });
    expect(profileCreate).toHaveBeenCalledTimes(1);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("resolves via rosterMap fast-path with high confidence", async () => {
    const { prisma, personaFindMany, personaFindUnique, profileUpsert } = createPrismaMock();
    const resolver = createPersonaResolver(prisma);

    // rosterMap 名义检查需要 persona.findUnique 返回匹配的 persona
    personaFindUnique.mockResolvedValue({
      name   : "范进",
      aliases: ["范举人"]
    });

    const rosterMap = new Map<string, string>([
      ["范举人", "persona-fangjin-uuid"],
      ["老爷", "GENERIC"]
    ]);

    const resolvedResult = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "范举人",
      chapterContent: "范举人中举之后...",
      rosterMap
    });
    expect(resolvedResult.status).toBe("resolved");
    expect(resolvedResult.personaId).toBe("persona-fangjin-uuid");
    expect(resolvedResult.confidence).toBe(0.97);
    expect(personaFindMany).not.toHaveBeenCalled();
    expect(profileUpsert).toHaveBeenCalledTimes(1);

    const genericResult = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "老爷",
      chapterContent: "老爷走过来...",
      rosterMap
    });
    expect(genericResult.status).toBe("hallucinated");
    expect(genericResult.reason).toBe("config_generic");
  });

  it("treats roster GENERIC markers as generic_title even for non-config names", async () => {
    const { prisma, personaFindMany } = createPrismaMock();
    const resolver = createPersonaResolver(prisma);

    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "周老爷",
      chapterContent: "周老爷拍案而起。",
      rosterMap     : new Map([["周老爷", "GENERIC"]])
    });

    expect(result).toEqual({
      status    : "hallucinated",
      confidence: 1,
      reason    : "generic_title"
    });
    expect(personaFindMany).not.toHaveBeenCalled();
  });

  it("falls through when rosterMap points to a missing persona", async () => {
    const {
      prisma,
      personaFindMany,
      personaFindUnique,
      personaCreate,
      profileCreate,
      profileUpsert
    } = createPrismaMock();
    personaFindUnique.mockResolvedValueOnce(null);
    personaFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    personaCreate.mockResolvedValueOnce({
      id  : "created-zhoulaoye",
      name: "周老爷"
    });

    const resolver = createPersonaResolver(prisma);
    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "周老爷",
      chapterContent: "周老爷怒斥众人。",
      rosterMap     : new Map([["周老爷", "persona-missing"]])
    });

    expect(result.status).toBe("created");
    expect(result.personaId).toBe("created-zhoulaoye");
    expect(profileUpsert).not.toHaveBeenCalled();
    expect(profileCreate).toHaveBeenCalledTimes(1);
  });

  it("rejects unrelated rosterMap targets and continues with normal creation flow", async () => {
    const {
      prisma,
      personaFindMany,
      personaFindUnique,
      personaCreate
    } = createPrismaMock();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    personaFindUnique.mockResolvedValueOnce({
      name   : "范进",
      aliases: ["范举人"]
    });
    personaFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    personaCreate.mockResolvedValueOnce({
      id  : "created-jinglanjiang",
      name: "景兰江"
    });

    const resolver = createPersonaResolver(prisma);
    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "景兰江",
      chapterContent: "景兰江在堂下回话。",
      rosterMap     : new Map([["景兰江", "persona-fanjin"]])
    });

    expect(result.status).toBe("created");
    expect(result.personaId).toBe("created-jinglanjiang");
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it("accepts rosterMap targets when the same-surname safety check passes", async () => {
    const { prisma, personaFindUnique, profileUpsert } = createPrismaMock();
    personaFindUnique.mockResolvedValueOnce({
      name   : "范进",
      aliases: []
    });

    const resolver = createPersonaResolver(prisma);
    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "范老爷",
      chapterContent: "范老爷缓步入席。",
      rosterMap     : new Map([["范老爷", "persona-fanjin"]])
    });

    expect(result).toEqual({
      status    : "resolved",
      personaId : "persona-fanjin",
      confidence: 0.97
    });
    expect(profileUpsert).toHaveBeenCalledTimes(1);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("registers alias mapping when creating TITLE_ONLY persona with alias registry", async () => {
    const {
      prisma,
      personaFindMany,
      personaCreate
    } = createPrismaMock();
    const registerAlias = vi.fn().mockResolvedValue(undefined);
    const aliasRegistry: AliasRegistryService = {
      lookupAlias        : vi.fn().mockResolvedValue(null),
      registerAlias,
      loadBookAliasCache : vi.fn(),
      listPendingMappings: vi.fn(),
      listReviewMappings : vi.fn(),
      updateMappingStatus: vi.fn()
    };

    personaFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    personaCreate.mockResolvedValueOnce({
      id  : "title-persona-2",
      name: "太祖皇帝"
    });

    const resolver = createPersonaResolver(prisma, aliasRegistry);
    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "太祖皇帝",
      chapterContent: "太祖皇帝颁布恩诏。",
      chapterNo     : 8,
      titleOnlyNames: new Set(["太祖皇帝"])
    });

    expect(result.status).toBe("created");
    expect(registerAlias).toHaveBeenCalledWith({
      bookId      : "book-1",
      personaId   : "title-persona-2",
      alias       : "太祖皇帝",
      resolvedName: undefined,
      aliasType   : "TITLE",
      confidence  : expect.any(Number),
      evidence    : "来自章节解析自动注册",
      chapterStart: 8,
      status      : "PENDING"
    }, expect.any(Object));
  });

  it("falls through when alias registry confidence is below the runtime threshold", async () => {
    const {
      prisma,
      personaFindMany,
      personaCreate
    } = createPrismaMock();
    const aliasRegistry: AliasRegistryService = {
      lookupAlias: vi.fn().mockResolvedValue({
        alias       : "周老爷",
        resolvedName: "周进",
        personaId   : "persona-zhoujin",
        aliasType   : "NICKNAME",
        confidence  : ANALYSIS_PIPELINE_CONFIG.aliasRegistryMinConfidence - 0.01,
        evidence    : "低置信映射",
        status      : "LLM_INFERRED"
      }),
      registerAlias      : vi.fn(),
      loadBookAliasCache : vi.fn(),
      listPendingMappings: vi.fn(),
      listReviewMappings : vi.fn(),
      updateMappingStatus: vi.fn()
    };
    personaFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    personaCreate.mockResolvedValueOnce({
      id  : "created-zhoulaoye",
      name: "周老爷"
    });

    const resolver = createPersonaResolver(prisma, aliasRegistry);
    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "周老爷",
      chapterContent: "周老爷慢慢走来。",
      chapterNo     : 5
    });

    expect(result.status).toBe("created");
    expect(result.personaId).toBe("created-zhoulaoye");
    expect(personaFindMany).toHaveBeenCalled();
  });

  it("falls through when alias registry returns no persona id", async () => {
    const {
      prisma,
      personaFindMany,
      personaCreate,
      profileUpsert
    } = createPrismaMock();
    const aliasRegistry: AliasRegistryService = {
      lookupAlias: vi.fn().mockResolvedValue({
        alias       : "周老爷",
        resolvedName: "周进",
        personaId   : null,
        aliasType   : "NICKNAME",
        confidence  : 0.9,
        evidence    : "缺少 personaId",
        status      : "LLM_INFERRED"
      }),
      registerAlias      : vi.fn(),
      loadBookAliasCache : vi.fn(),
      listPendingMappings: vi.fn(),
      listReviewMappings : vi.fn(),
      updateMappingStatus: vi.fn()
    };
    personaFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    personaCreate.mockResolvedValueOnce({
      id  : "created-zhoulaoye",
      name: "周老爷"
    });

    const resolver = createPersonaResolver(prisma, aliasRegistry);
    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "周老爷",
      chapterContent: "周老爷缓缓回头。",
      chapterNo     : 6
    });

    expect(result.status).toBe("created");
    expect(profileUpsert).not.toHaveBeenCalled();
  });

  it("registers non-title created aliases with resolvedName when title stems are present", async () => {
    const {
      prisma,
      personaFindMany,
      personaCreate
    } = createPrismaMock();
    const registerAlias = vi.fn().mockResolvedValue(undefined);
    const aliasRegistry: AliasRegistryService = {
      lookupAlias        : vi.fn().mockResolvedValue(null),
      registerAlias,
      loadBookAliasCache : vi.fn(),
      listPendingMappings: vi.fn(),
      listReviewMappings : vi.fn(),
      updateMappingStatus: vi.fn()
    };
    personaFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    personaCreate.mockResolvedValueOnce({
      id  : "created-wangzhixian",
      name: "王知县"
    });

    const resolver = createPersonaResolver(prisma, aliasRegistry);
    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "王知县",
      chapterContent: "王知县升堂问案。",
      chapterNo     : 9
    });

    expect(result.status).toBe("created");
    expect(registerAlias).toHaveBeenCalledWith({
      bookId      : "book-1",
      personaId   : "created-wangzhixian",
      alias       : "王知县",
      resolvedName: "王知县",
      aliasType   : "TITLE",
      confidence  : 0.35,
      evidence    : "来自章节解析自动注册",
      chapterStart: 9,
      status      : "PENDING"
    }, expect.any(Object));
  });

  it("can escalate created alias registration to confirmed when the creation threshold is raised temporarily", async () => {
    const originalMinScore = ANALYSIS_PIPELINE_CONFIG.personaResolveMinScore;
    (ANALYSIS_PIPELINE_CONFIG as { personaResolveMinScore: number }).personaResolveMinScore = 1.1;

    const {
      prisma,
      personaFindMany,
      personaCreate
    } = createPrismaMock();
    const registerAlias = vi.fn().mockResolvedValue(undefined);
    const aliasRegistry: AliasRegistryService = {
      lookupAlias        : vi.fn().mockResolvedValue(null),
      registerAlias,
      loadBookAliasCache : vi.fn(),
      listPendingMappings: vi.fn(),
      listReviewMappings : vi.fn(),
      updateMappingStatus: vi.fn()
    };
    personaFindMany
      .mockResolvedValueOnce([
        {
          id      : "persona-existing",
          name    : "吴王",
          aliases : [],
          profiles: [{ localName: "吴王" }]
        }
      ]);
    personaCreate.mockResolvedValueOnce({
      id  : "created-wuwang",
      name: "吴王"
    });

    const resolver = createPersonaResolver(prisma, aliasRegistry);
    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "吴王",
      chapterContent: "吴王即日升殿。",
      chapterNo     : 12
    });

    expect(result.status).toBe("created");
    expect(registerAlias).toHaveBeenCalledWith(expect.objectContaining({
      alias : "吴王",
      status: "CONFIRMED"
    }), expect.any(Object));
    (ANALYSIS_PIPELINE_CONFIG as { personaResolveMinScore: number }).personaResolveMinScore = originalMinScore;
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("classifies config generic title as gray_zone when evidence is uncertain", async () => {
    const original = ANALYSIS_PIPELINE_CONFIG.dynamicTitleResolutionEnabled;
    (ANALYSIS_PIPELINE_CONFIG as { dynamicTitleResolutionEnabled: boolean }).dynamicTitleResolutionEnabled = true;
    const { prisma, aliasMappingFindMany, mentionFindMany } = createPrismaMock();
    aliasMappingFindMany.mockResolvedValueOnce([]);
    mentionFindMany.mockResolvedValueOnce([]);
    const resolver = createPersonaResolver(prisma);

    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "老爷",
      chapterContent: "老爷在堂上发话。",
      genericRatios : new Map([["老爷", { generic: 1, nonGeneric: 1 }]])
    });

    expect(result.status).toBe("hallucinated");
    expect(result.reason).toBe("gray_zone");
    expect(result.personalizationTier).toBe("gray_zone");
    expect(result.grayZoneEvidence?.surfaceForm).toBe("老爷");
    (ANALYSIS_PIPELINE_CONFIG as { dynamicTitleResolutionEnabled: boolean }).dynamicTitleResolutionEnabled = original;
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("scorePair soft block uses normalScore × softBlockPenalty", () => {
    const normalScore = 0.60 + 0.37 * ("王五".length / "王五大人".length);
    const score = calculateSubstringMatchScore(
      "王五大人",
      "王五",
      HARD_BLOCK_SUFFIXES,
      DEFAULT_SOFT_BLOCK_SUFFIXES
    );

    expect(score).toBeCloseTo(normalScore * ANALYSIS_PIPELINE_CONFIG.softBlockPenalty, 8);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("scorePair hard block returns 0", () => {
    const score = calculateSubstringMatchScore(
      "蘧公孙父亲",
      "蘧公孙",
      HARD_BLOCK_SUFFIXES,
      DEFAULT_SOFT_BLOCK_SUFFIXES
    );

    expect(score).toBe(0);
  });

  it("calculateSubstringMatchScore returns 0 when the shorter string is not contained", () => {
    const score = calculateSubstringMatchScore(
      "范进中举",
      "严监生",
      HARD_BLOCK_SUFFIXES,
      DEFAULT_SOFT_BLOCK_SUFFIXES
    );

    expect(score).toBe(0);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("collectPersonalizationEvidence supports personalized/generic/gray_zone classification", async () => {
    const original = ANALYSIS_PIPELINE_CONFIG.dynamicTitleResolutionEnabled;
    (ANALYSIS_PIPELINE_CONFIG as { dynamicTitleResolutionEnabled: boolean }).dynamicTitleResolutionEnabled = true;
    const { prisma, aliasMappingFindMany, mentionFindMany, personaFindMany } = createPrismaMock();
    personaFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const resolver = createPersonaResolver(prisma);

    aliasMappingFindMany.mockResolvedValueOnce([{ personaId: "p-1" }]);
    mentionFindMany.mockResolvedValueOnce([{ chapterId: "c-1", personaId: "p-1" }]);
    const personalized = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "老爷",
      chapterContent: "老爷来了",
      genericRatios : new Map([["老爷", { generic: 0, nonGeneric: 5 }]])
    });
    expect(personalized.reason).not.toBe("config_generic");
    expect(classifyPersonalization({
      surfaceForm             : "老爷",
      hasStableAliasBinding   : true,
      chapterAppearanceCount  : 1,
      singlePersonaConsistency: true,
      genericRatio            : 0.1
    })).toBe("personalized");

    aliasMappingFindMany.mockResolvedValueOnce([]);
    mentionFindMany.mockResolvedValueOnce([]);
    const generic = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "老爷",
      chapterContent: "老爷来了",
      genericRatios : new Map([["老爷", { generic: 8, nonGeneric: 1 }]])
    });
    expect(generic.reason).toBe("config_generic");

    aliasMappingFindMany.mockResolvedValueOnce([]);
    mentionFindMany.mockResolvedValueOnce([{ chapterId: "c-1", personaId: "p-1" }, { chapterId: "c-2", personaId: "p-2" }]);
    const gray = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "老爷",
      chapterContent: "老爷来了",
      genericRatios : new Map([["老爷", { generic: 1, nonGeneric: 1 }]])
    });
    expect(gray.reason).toBe("gray_zone");

    (ANALYSIS_PIPELINE_CONFIG as { dynamicTitleResolutionEnabled: boolean }).dynamicTitleResolutionEnabled = original;
  });

  it("boosts surname+title alias to unique same-surname canonical candidate", async () => {
    // "范举人" = "范" (姓) + "举人" (泛称) → 应与唯一同姓正式人名"范进"合并
    const {
      prisma,
      personaFindMany,
      personaUpdate,
      profileUpsert
    } = createPrismaMock();

    personaFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id      : "persona-fanjin",
          name    : "范进",
          aliases : [],
          profiles: [{ localName: "范进" }]
        },
        {
          id      : "persona-zhoupuzheng",
          name    : "周蒲正",
          aliases : [],
          profiles: [{ localName: "周蒲正" }]
        }
      ]);

    const resolver = createPersonaResolver(prisma);
    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "范举人",
      chapterContent: "范举人今日风光无限。"
    });

    expect(result.status).toBe("resolved");
    expect(result.personaId).toBe("persona-fanjin");
    expect(result.matchedName).toBe("范进");
    expect(result.confidence).toBeGreaterThanOrEqual(ANALYSIS_PIPELINE_CONFIG.personaResolveMinScore);
    expect(profileUpsert).toHaveBeenCalledTimes(1);
    expect(personaUpdate).toHaveBeenCalledWith({
      where: { id: "persona-fanjin" },
      data : { aliases: { push: "范举人" } }
    });
  });

  it("does not boost surname+title when same-surname candidates are ambiguous", async () => {
    // "贾太太"有两个贾姓候选（贾政、贾赦）→ 不加权，新建 persona
    const {
      prisma,
      personaFindMany,
      personaCreate,
      personaUpdate,
      profileCreate
    } = createPrismaMock();

    personaFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id      : "persona-jiazheng",
          name    : "贾政",
          aliases : [],
          profiles: [{ localName: "贾政" }]
        },
        {
          id      : "persona-jiashe",
          name    : "贾赦",
          aliases : [],
          profiles: [{ localName: "贾赦" }]
        }
      ]);
    personaCreate.mockResolvedValueOnce({
      id  : "created-jiataitai",
      name: "贾太太"
    });

    const resolver = createPersonaResolver(prisma);
    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "贾太太",
      chapterContent: "贾太太在堂上落座。"
    });

    expect(result.status).toBe("created");
    expect(result.personaId).toBe("created-jiataitai");
    expect(personaUpdate).not.toHaveBeenCalled();
    expect(profileCreate).toHaveBeenCalledTimes(1);
  });

  it("does not boost surname+hardBlockSuffix (e.g. 范之父)", async () => {
    // "范之父" 中"之父"是 hardBlockSuffix → 不应触发 surname+title boost
    const {
      prisma,
      personaFindMany,
      personaCreate
    } = createPrismaMock();

    personaFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id      : "persona-fanjin",
          name    : "范进",
          aliases : [],
          profiles: [{ localName: "范进" }]
        }
      ]);
    personaCreate.mockResolvedValueOnce({
      id  : "created-fanzhifu",
      name: "范之父"
    });

    const resolver = createPersonaResolver(prisma);
    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "范之父",
      chapterContent: "范之父在家等候消息。"
    });

    // 不应合并到"范进"，应新建
    expect(result.status).toBe("created");
    expect(result.personaId).toBe("created-fanzhifu");
  });

  it("falls back to edit-distance scoring for long non-substring candidates", async () => {
    const {
      prisma,
      personaFindMany,
      personaCreate
    } = createPrismaMock();
    personaFindMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id      : "persona-1",
          name    : "京城范进先生",
          aliases : [],
          profiles: [{ localName: "京城范进先生" }]
        }
      ]);
    personaCreate.mockResolvedValueOnce({
      id  : "created-fanjinlaoshi",
      name: "范进老师"
    });

    const resolver = createPersonaResolver(prisma);
    const result = await resolver.resolve({
      bookId        : "book-1",
      extractedName : "范进老师",
      chapterContent: "范进老师正在堂上答话。"
    });

    expect(result.status).toBe("created");
    expect(result.personaId).toBe("created-fanjinlaoshi");
  });
});
