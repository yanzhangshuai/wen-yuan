import { NameType } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import { createBookPersonaCache, loadBookPersonaCache } from "@/server/modules/analysis/services/BookPersonaCache";

function createPrismaMock() {
  const profileFindMany = vi.fn();

  return {
    prisma: {
      profile: {
        findMany: profileFindMany
      }
    } as never,
    profileFindMany
  };
}

describe("BookPersonaCache", () => {
  it("lookupByName checks canonical name then alias", () => {
    const cache = createBookPersonaCache();
    cache.addPersona({
      id      : "persona-1",
      name    : "范进",
      aliases : ["范老爷"],
      nameType: NameType.NAMED
    });

    expect(cache.lookupByName("范进")).toBe("persona-1");
    expect(cache.lookupByName("范老爷")).toBe("persona-1");
  });

  it("lookupByAlias checks alias and profile index", () => {
    const cache = createBookPersonaCache();
    cache.addAlias("周学道", "persona-2");
    cache.profileIndex.set("周大人", new Set(["persona-2"]));

    expect(cache.lookupByAlias("周学道")).toBe("persona-2");
    expect(cache.lookupByAlias("周大人")).toBe("persona-2");
  });

  it("returns undefined when alias collides across personas", () => {
    const cache = createBookPersonaCache();
    cache.addPersona({
      id      : "persona-1",
      name    : "范进",
      aliases : ["老爷"],
      nameType: NameType.NAMED
    });
    cache.addPersona({
      id      : "persona-2",
      name    : "严监生",
      aliases : ["老爷"],
      nameType: NameType.NAMED
    });

    expect(cache.lookupByAlias("老爷")).toBeUndefined();
  });

  it("loadBookPersonaCache builds persona and index maps", async () => {
    const { prisma, profileFindMany } = createPrismaMock();
    profileFindMany.mockResolvedValueOnce([
      {
        personaId: "persona-1",
        localName: "范举人",
        persona  : {
          id      : "persona-1",
          name    : "范进",
          aliases : ["范老爷"],
          nameType: NameType.NAMED
        }
      },
      {
        personaId: "persona-2",
        localName: "太祖皇帝",
        persona  : {
          id      : "persona-2",
          name    : "太祖皇帝",
          aliases : ["洪武皇帝"],
          nameType: NameType.TITLE_ONLY
        }
      }
    ]);

    const cache = await loadBookPersonaCache(prisma, "book-1");

    expect(cache.personas.size).toBe(2);
    expect(cache.lookupByName("范进")).toBe("persona-1");
    expect(cache.lookupByAlias("范举人")).toBe("persona-1");
    expect(cache.lookupByAlias("洪武皇帝")).toBe("persona-2");
    expect(profileFindMany).toHaveBeenCalledWith({
      where: {
        bookId   : "book-1",
        deletedAt: null,
        persona  : { deletedAt: null }
      },
      select: {
        personaId: true,
        localName: true,
        persona  : {
          select: {
            id      : true,
            name    : true,
            aliases : true,
            nameType: true
          }
        }
      }
    });
  });
});
