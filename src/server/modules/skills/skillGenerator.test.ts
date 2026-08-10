import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { createSkillGenerator } from "@/server/modules/skills/skillGenerator";

/**
 * SkillGenerator 骨架单测：
 * - buildContentFromSignals：信号 → SkillContent 的确定性组装；
 * - generateSkillFromSignals：空信号/书籍不存在拒绝；成功创建 DRAFT 技能。
 */

describe("createSkillGenerator", () => {
  let prismaMock: {
    $transaction: ReturnType<typeof vi.fn>;
    book        : { findUnique: ReturnType<typeof vi.fn> };
    skill       : { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    skillVersion: {
      findFirst : ReturnType<typeof vi.fn>;
      create    : ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
      update    : ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock = {
      $transaction: vi.fn(),
      book        : { findUnique: vi.fn() },
      skill       : { findMany: vi.fn(), create: vi.fn() },
      skillVersion: { findFirst: vi.fn(), create: vi.fn(), updateMany: vi.fn(), update: vi.fn() }
    };
  });

  it("buildMarkdownFromSignals 生成含高频称谓的 MD 文档", () => {
    const generator = createSkillGenerator(prismaMock as unknown as PrismaClient);
    const markdown = generator.buildMarkdownFromSignals({
      bookId        : "book-1",
      frequentTitles: ["老爷", "先生"]
    });
    expect(markdown).toContain("老爷");
    expect(markdown).toContain("先生");
  });

  it("buildMarkdownFromSignals 生成含字典外关系码的 MD 文档", () => {
    const generator = createSkillGenerator(prismaMock as unknown as PrismaClient);
    const markdown = generator.buildMarkdownFromSignals({
      bookId                  : "book-1",
      unknownRelationshipCodes: ["师叔", "义兄"]
    });
    expect(markdown).toContain("师叔");
    expect(markdown).toContain("义兄");
  });

  it("空信号拒绝生成", async () => {
    const generator = createSkillGenerator(prismaMock as unknown as PrismaClient);
    await expect(generator.generateSkillFromSignals({ bookId: "book-1" })).rejects.toThrow(
      "需要至少一类信号"
    );
  });

  it("书籍不存在拒绝生成", async () => {
    (prismaMock.book.findUnique).mockResolvedValue(null);
    const generator = createSkillGenerator(prismaMock as unknown as PrismaClient);
    await expect(generator.generateSkillFromSignals({
      bookId        : "missing",
      frequentTitles: ["老爷"]
    })).rejects.toThrow("书籍不存在");
  });

  it("成功创建技能（默认启用）", async () => {
    (prismaMock.book.findUnique).mockResolvedValue({ id: "book-1", title: "儒林外史" });
    (prismaMock.skill.findMany).mockResolvedValue([]);
    (prismaMock.skill.create).mockResolvedValue({ id: "skill-gen", slug: "gen-book1-1", name: "儒林外史 生成技能" });

    const generator = createSkillGenerator(prismaMock as unknown as PrismaClient);
    const result = await generator.generateSkillFromSignals({
      bookId                  : "book-1",
      frequentTitles          : ["老爷"],
      unknownRelationshipCodes: ["师叔"]
    });

    expect(result.status).toBe("ENABLED");
    expect(result.slug).toBe("gen-book1-1");
    expect(prismaMock.skill.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ scope: "BOOK_TYPE" })
    }));
  });
});
