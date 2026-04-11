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

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("BookPersonaCache", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("lookupByAlias checks alias and profile index", () => {
    const cache = createBookPersonaCache();
    cache.addAlias("周学道", "persona-2");
    cache.profileIndex.set("周大人", new Set(["persona-2"]));

    expect(cache.lookupByAlias("周学道")).toBe("persona-2");
    expect(cache.lookupByAlias("周大人")).toBe("persona-2");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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

  // 用例语义：覆盖空输入与空别名防御分支，避免脏数据污染倒排索引。
  it("ignores blank alias writes and returns undefined for blank lookups", () => {
    const cache = createBookPersonaCache();

    cache.addAlias("   ", "persona-1");

    expect(cache.aliasIndex.size).toBe(0);
    expect(cache.lookupByName("")).toBeUndefined();
    expect(cache.lookupByAlias("   ")).toBeUndefined();
  });

  // 用例语义：覆盖 alias 冲突时的 preferName 与非 TITLE_ONLY 优先级分支。
  it("prefers canonical name matches and the lone named candidate when alias collisions occur", () => {
    const preferNameCache = createBookPersonaCache();
    preferNameCache.addPersona({
      id      : "persona-1",
      name    : "老爷",
      aliases : ["老爷", "范老爷"],
      nameType: NameType.NAMED
    });
    preferNameCache.addPersona({
      id      : "persona-2",
      name    : "严监生",
      aliases : ["老爷"],
      nameType: NameType.NAMED
    });
    preferNameCache.addPersona({
      id      : "persona-3",
      name    : "张静斋",
      aliases : ["老爷"],
      nameType: NameType.NAMED
    });

    const nameTypeCache = createBookPersonaCache();
    nameTypeCache.addPersona({
      id      : "persona-title-1",
      name    : "周老爷",
      aliases : ["周学道"],
      nameType: NameType.TITLE_ONLY
    });
    nameTypeCache.addPersona({
      id      : "persona-title-2",
      name    : "周进",
      aliases : ["周学道"],
      nameType: NameType.NAMED
    });
    nameTypeCache.addPersona({
      id      : "persona-title-3",
      name    : "周大人",
      aliases : ["周学道"],
      nameType: NameType.TITLE_ONLY
    });

    expect(preferNameCache.lookupByAlias("老爷")).toBe("persona-1");
    expect(nameTypeCache.lookupByAlias("周学道")).toBe("persona-title-2");
  });

  // 用例语义：覆盖 addPersona 的别名去重，避免重复 alias 放大冲突集合。
  it("deduplicates aliases when adding a persona snapshot", () => {
    const cache = createBookPersonaCache();

    cache.addPersona({
      id      : "persona-1",
      name    : "范进",
      aliases : ["范老爷", "范老爷", "范举人"],
      nameType: NameType.NAMED
    });

    expect(cache.personas.get("persona-1")?.aliases).toEqual(["范老爷", "范举人"]);
    expect(cache.aliasIndex.get("范老爷".toLowerCase())?.size).toBe(1);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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

  // 用例语义：覆盖 loadBookPersonaCache 的重复 persona、空白 localName 与默认 nameType 分支。
  it("loadBookPersonaCache deduplicates repeated personas and skips blank local names", async () => {
    const { prisma, profileFindMany } = createPrismaMock();
    profileFindMany.mockResolvedValueOnce([
      {
        personaId: "persona-1",
        localName: "   ",
        persona  : {
          id      : "persona-1",
          name    : "范进",
          aliases : ["范老爷", "范老爷"],
          nameType: null
        }
      },
      {
        personaId: "persona-1",
        localName: "范举人",
        persona  : {
          id      : "persona-1",
          name    : "范进",
          aliases : ["范老爷"],
          nameType: null
        }
      }
    ]);

    const cache = await loadBookPersonaCache(prisma, "book-1");

    expect(cache.personas.size).toBe(1);
    expect(cache.personas.get("persona-1")).toEqual({
      id      : "persona-1",
      name    : "范进",
      aliases : ["范老爷"],
      nameType: NameType.NAMED
    });
    expect(cache.profileIndex.size).toBe(1);
    expect(cache.profileIndex.has("")).toBe(false);
    expect(cache.lookupByAlias("范举人")).toBe("persona-1");
  });
});
