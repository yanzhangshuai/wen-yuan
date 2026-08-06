import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { createSkillLoader } from "@/server/modules/skills/loader";

/**
 * resolveSkillsForBook 装载逻辑单测（MD 文档返回模式）：
 * - 书型激活版优先于全局激活版；
 * - taskType 过滤；
 * - 按 priority 降序返回候选 MD 文档；
 * - 无激活版的技能跳过；书籍不存在抛错。
 */

function makeVersion(overrides: Partial<Record<string, unknown>>) {
  return {
    id        : "version-" + String(overrides.versionNo ?? 1),
    versionNo : overrides.versionNo ?? 1,
    content   : overrides.content ?? "",
    bookTypeId: overrides.bookTypeId ?? null,
    isActive  : overrides.isActive ?? true
  };
}

function makeSkill(overrides: Partial<Record<string, unknown>>) {
  return {
    id           : "skill-" + String(overrides.slug ?? "x"),
    slug         : overrides.slug ?? "skill-x",
    name         : overrides.name ?? "技能",
    description  : overrides.description ?? null,
    category     : overrides.category ?? "HYBRID",
    scope        : overrides.scope ?? "GLOBAL",
    sortOrder    : overrides.sortOrder ?? 0,
    createdAt    : new Date("2026-08-06T00:00:00Z"),
    versions     : overrides.versions ?? [],
    bookTypeLinks: overrides.bookTypeLinks ?? []
  };
}

function mdContent(priority = 0, taskTypes?: string[]): string {
  const taskTypesYaml = taskTypes ? `  taskTypes: [${taskTypes.join(", ")}]\n` : "";
  return `---
kind: HYBRID
triggers:
  priority: ${priority}
${taskTypesYaml}---

## 指令
- 指令内容
`;
}

describe("createSkillLoader", () => {
  let prismaMock: {
    book : { findUnique: ReturnType<typeof vi.fn> };
    skill: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    prismaMock = {
      book : { findUnique: vi.fn() },
      skill: { findMany: vi.fn(), findUnique: vi.fn() }
    };
  });

  it("书籍不存在时抛错", async () => {
    prismaMock.book.findUnique.mockResolvedValue(null);
    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    await expect(loader.resolveSkillsForBook("missing-book")).rejects.toThrow("书籍不存在");
  });

  it("书型激活版优先于全局激活版", async () => {
    prismaMock.book.findUnique.mockResolvedValue({
      bookTypeId: "booktype-1",
      bookType  : { key: "keju-novel", id: "booktype-1" }
    });
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkill({
        slug   : "keju",
        name   : "科举",
        scope  : "BOOK_TYPE",
        versions: [
          makeVersion({ versionNo: 2, bookTypeId: "booktype-1", content: mdContent(5) }),
          makeVersion({ versionNo: 1, bookTypeId: null, content: mdContent(1) })
        ],
        bookTypeLinks: [{ priority: 0, isEnabled: true }]
      })
    ]);

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    const runtime = await loader.resolveSkillsForBook("book-1", "CHAPTER_ANALYSIS");

    expect(runtime.skills).toHaveLength(1);
    expect(runtime.skills[0].versionNo).toBe(2);
    expect(runtime.skills[0].markdown).toContain("指令内容");
  });

  it("taskType 过滤：不含当前任务的 skill 被跳过", async () => {
    prismaMock.book.findUnique.mockResolvedValue({ bookTypeId: null, bookType: null });
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkill({
        slug   : "keju",
        versions: [makeVersion({ content: mdContent(10, ["GLOBAL_RESOLUTION"]) })]
      })
    ]);

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    const runtime = await loader.resolveSkillsForBook("book-1", "CHAPTER_ANALYSIS");

    expect(runtime.skills).toHaveLength(0);
  });

  it("按 priority 降序返回候选", async () => {
    prismaMock.book.findUnique.mockResolvedValue({ bookTypeId: null, bookType: null });
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkill({ slug: "low", name: "低", versions: [makeVersion({ content: mdContent(10) })] }),
      makeSkill({ slug: "high", name: "高", versions: [makeVersion({ content: mdContent(20) })] })
    ]);

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    const runtime = await loader.resolveSkillsForBook("book-1", "CHAPTER_ANALYSIS");

    expect(runtime.skills.map((skill) => skill.slug)).toEqual(["high", "low"]);
  });

  it("无激活版的技能被跳过", async () => {
    prismaMock.book.findUnique.mockResolvedValue({ bookTypeId: null, bookType: null });
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkill({
        slug    : "draft-skill",
        versions: [makeVersion({ isActive: false })]
      })
    ]);

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    const runtime = await loader.resolveSkillsForBook("book-1", "CHAPTER_ANALYSIS");

    expect(runtime.skills).toHaveLength(0);
  });

  it("loadSkill 按 id 返回激活版全文", async () => {
    prismaMock.skill.findUnique.mockResolvedValue({
      slug    : "keju",
      name    : "科举",
      versions: [
        makeVersion({ versionNo: 2, bookTypeId: null, content: mdContent(5) })
      ]
    });

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    const markdown = await loader.loadSkill("skill-1");

    expect(markdown).toContain("指令内容");
  });

  it("loadSkill 无激活版返回 null", async () => {
    prismaMock.skill.findUnique.mockResolvedValue({
      slug    : "keju",
      name    : "科举",
      versions: []
    });

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    const markdown = await loader.loadSkill("skill-1");

    expect(markdown).toBeNull();
  });
});
