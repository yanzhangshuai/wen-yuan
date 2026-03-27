import { describe, expect, it, vi } from "vitest";

import { createPersonaResolver } from "@/server/modules/analysis/services/PersonaResolver";

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
        name   : "赵六",
        type   : "PERSON",
        aliases: ["赵六"]
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
});
