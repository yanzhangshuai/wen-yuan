import { describe, expect, it, vi } from "vitest";

import { createPersonaResolver, GENERIC_TITLES } from "@/server/modules/analysis/services/PersonaResolver";

function createPrismaMock() {
  const personaFindMany = vi.fn();
  const personaUpdate = vi.fn().mockResolvedValue({});
  const personaCreate = vi.fn().mockResolvedValue({
    id  : "new-persona-id",
    name: "新人物"
  });
  const profileUpsert = vi.fn().mockResolvedValue({});
  const profileCreate = vi.fn().mockResolvedValue({});

  return {
    prisma: {
      persona: {
        findMany: personaFindMany,
        update  : personaUpdate,
        create  : personaCreate
      },
      profile: {
        upsert: profileUpsert,
        create: profileCreate
      }
    } as never,
    personaFindMany,
    personaUpdate,
    personaCreate,
    profileUpsert,
    profileCreate
  };
}

describe("persona resolver", () => {
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
        confidence: 1.0,
        reason    : "generic_title"
      });
    }
    expect(personaFindMany).not.toHaveBeenCalled();
  });

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

  it("resolves via rosterMap fast-path with high confidence", async () => {
    const { prisma, personaFindMany, profileUpsert } = createPrismaMock();
    const resolver = createPersonaResolver(prisma);

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
    expect(genericResult.reason).toBe("generic_title");
  });
});
