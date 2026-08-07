import { describe, expect, it, vi } from "vitest";
import { scanMisattribution } from "./conflictScan.ts";
import type { RegistryEntry } from "./registry.ts";

function makeEntry(canonical: string, activeChapters: number[]): RegistryEntry {
  return {
    entityId: `entity-${canonical}`,
    canonical,
    type: "PERSON",
    aliases: [],
    confidenceTier: "HIGH",
    activeChapters,
    firstAppearanceChapter: activeChapters[0] ?? null,
    nameType: "NAMED",
  };
}

// mock prisma：mention.findMany 返回别名活跃章区
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    mention: {
      findMany: vi.fn(async ({ where }: { where: { rawText: { contains: string } } }) => {
        // 测试数据表：别名 -> 出现章
        const aliasToChapters: Record<string, number[]> = {
          范老爷: [3],
          王管家: [5, 6],
        };
        const alias = where.rawText.contains;
        return (aliasToChapters[alias] ?? []).map((chapterNo) => ({ chapter: { no: chapterNo } }));
      }),
    },
  },
}));

describe("scanMisattribution", () => {
  it("同场共现不误报（别名只与当前实体同章）", async () => {
    const entities = [
      makeEntry("范进", [3]),
      makeEntry("周进", [2]),
    ];
    const flags = await scanMisattribution("book-1", new Map([["范老爷", "entity-范进"]]), entities);
    expect(flags).toHaveLength(0);
  });

  it("章区完全不重合且只与另一实体重合 → 标记误归属", async () => {
    const entities = [
      makeEntry("张三", [1, 2]),
      makeEntry("李四", [5, 6]),
    ];
    const flags = await scanMisattribution("book-1", new Map([["王管家", "entity-张三"]]), entities);
    expect(flags.length).toBe(1);
    expect(flags[0]).toMatchObject({ alias: "王管家", currentEntityId: "entity-张三", targetEntityId: "entity-李四" });
  });
});
