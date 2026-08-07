import { describe, expect, it } from "vitest";
import { findRegistryEntryByName, invalidateAllRegistryCache, invalidateRegistryCache, normalizeRegistryName } from "./registry.ts";
import type { BookRegistry, RegistryEntry } from "./registry.ts";

function makeEntry(canonical: string, aliases: string[] = []): RegistryEntry {
  return {
    entityId: `entity-${canonical}`,
    canonical,
    type: "PERSON",
    aliases,
    confidenceTier: "HIGH",
    activeChapters: [1],
    firstAppearanceChapter: 1,
    nameType: "NAMED",
  };
}

function makeRegistry(entries: RegistryEntry[]): BookRegistry {
  return { bookId: "book-1", entries, loadedAt: new Date() };
}

describe("normalizeRegistryName", () => {
  it("去除全角/半角空格并转小写", () => {
    expect(normalizeRegistryName("　范进 ")).toBe("范进");
    expect(normalizeRegistryName("ABC")).toBe("abc");
  });
});

describe("findRegistryEntryByName", () => {
  const registry = makeRegistry([
    makeEntry("范进", ["范老爷", "范举人"]),
    makeEntry("周进", ["周学道"]),
  ]);

  it("canonical 命中", () => {
    expect(findRegistryEntryByName(registry, "范进")?.entityId).toBe("entity-范进");
  });
  it("别名命中", () => {
    expect(findRegistryEntryByName(registry, "范老爷")?.entityId).toBe("entity-范进");
    expect(findRegistryEntryByName(registry, "周学道")?.entityId).toBe("entity-周进");
  });
  it("未命中返回 null", () => {
    expect(findRegistryEntryByName(registry, "不存在")).toBeNull();
  });
  it("归一化后命中（全角空格）", () => {
    expect(findRegistryEntryByName(registry, "　范老爷　")?.entityId).toBe("entity-范进");
  });
});

describe("缓存失效", () => {
  it("失效函数可调用且不抛错", () => {
    expect(() => invalidateRegistryCache("book-1")).not.toThrow();
    expect(() => invalidateAllRegistryCache()).not.toThrow();
  });
});
