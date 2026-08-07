import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import {
  buildSkillSelectionUserPrompt,
  createSkillSelector,
  parseSkillsSnapshot,
  renderOutputShape,
  sampleBookText,
  skillSelectionOutputSchema
} from "@/server/modules/skills/skillSelector";
import type { SkillSelectorCallLlmInput } from "@/server/modules/skills/skillSelector";

/**
 * AI 动态 skill 选择器单测：
 * - 目录读取：仅 ACTIVE+isEnabled；name/description 取 frontmatter 覆盖；
 * - 书上下文：章节全文/抽样；
 * - zod 校验：非法 slug 丢弃并告警；装载集合 = GLOBAL ∪ 选中；
 * - relationshipCodes 并集（去重按 code，先到先得）；
 * - renderOutputShape 从 zod schema 推导输出类型；
 * - selectSkillsForJob 快照写库。
 */

/** 构造激活版行（skill.findMany 的 versions 选择为 versionNo/content）。 */
function makeVersion(versionNo = 1, content = "") {
  return { versionNo, content };
}

/** 构造 skill 行（含 scope/category/versions）。 */
function makeSkillRow(overrides: Partial<Record<string, unknown>>) {
  const slug = typeof overrides.slug === "string" ? overrides.slug : "skill-x";
  return {
    id         : "skill-" + slug,
    slug,
    name       : overrides.name ?? "技能",
    description: overrides.description ?? null,
    category   : overrides.category ?? "HYBRID",
    scope      : overrides.scope ?? "GLOBAL",
    status     : overrides.status ?? "ACTIVE",
    isEnabled  : overrides.isEnabled ?? true,
    sortOrder  : overrides.sortOrder ?? 0,
    createdAt  : new Date("2026-08-06T00:00:00Z"),
    versions   : overrides.versions ?? []
  };
}

/** 带关系码契约的 frontmatter MD 内容。 */
function mdWithRelationshipCodes(codes: Array<{ code: string; direction: string; category: string }>): string {
  const yaml = codes.map((c) => `  - code: ${c.code}\n    direction: ${c.direction}\n    category: ${c.category}`).join("\n");
  return `---
kind: RELATIONSHIP_TYPE
triggers:
  priority: 996
relationshipCodes:
${yaml}
---

## 指令
- 关系码必须取自本表
`;
}

/** 带 frontmatter name/description 覆盖的 MD 内容。 */
function mdWithOverrides(name: string, description: string): string {
  return `---
kind: HYBRID
name: ${name}
description: ${description}
triggers:
  priority: 0
---

## 指令
- 正文
`;
}

function makeBookRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    title      : overrides.title ?? "儒林外史",
    author     : overrides.author ?? "吴敬梓",
    dynasty    : overrides.dynasty ?? "清",
    description: overrides.description ?? "讽刺小说"
  };
}

describe("renderOutputShape", () => {
  it("从 zod schema 推导 JSON 类型描述（string/array/nullable）", () => {
    expect(renderOutputShape(skillSelectionOutputSchema))
      .toBe('{ "skillSlugs": string[], "inferredType": string | null, "reasons": string }');
  });
});

describe("sampleBookText", () => {
  it("全文 ≤ 阈值时原样返回", () => {
    expect(sampleBookText("短文本", 6000, 2000)).toBe("短文本");
  });

  it("超长时抽样首/中/末三段", () => {
    const content = "a".repeat(1000) + "B".repeat(5000) + "c".repeat(1000);
    const result = sampleBookText(content, 2000, 500);
    expect(result).toContain("【开头】");
    expect(result).toContain("【中段】");
    expect(result).toContain("【结尾】");
    // 首段取前 500 字符、尾段取最后 500 字符
    expect(result).toContain("a".repeat(500));
    expect(result).toContain("c".repeat(500));
  });
});

describe("buildSkillSelectionUserPrompt", () => {
  it("包含书籍信息与目录清单", () => {
    const prompt = buildSkillSelectionUserPrompt(
      { title: "儒林外史", author: "吴敬梓", dynasty: "清", description: "讽刺小说", sample: "正文样本" },
      [{ slug: "keju", name: "科举", description: "科举知识", category: "TASK_INSTRUCTION" }]
    );
    expect(prompt).toContain("书名：儒林外史");
    expect(prompt).toContain("正文样本");
    expect(prompt).toContain("keju｜科举｜科举知识｜TASK_INSTRUCTION");
  });
});

describe("parseSkillsSnapshot", () => {
  it("解析合法快照", () => {
    const parsed = parseSkillsSnapshot({
      selectedSlugs : ["keju"],
      allLoadedSlugs: ["global", "keju"],
      versionMap    : { global: 1, keju: 2 },
      inferredType  : "classical-novel",
      reasons       : "reason",
      selectedAt    : "2026-08-07T00:00:00Z"
    });
    expect(parsed).not.toBeNull();
    expect(parsed?.allLoadedSlugs).toEqual(["global", "keju"]);
    expect(parsed?.versionMap.keju).toBe(2);
    expect(parsed?.inferredType).toBe("classical-novel");
  });

  it("结构不合法（缺 allLoadedSlugs）返回 null", () => {
    expect(parseSkillsSnapshot({ selectedSlugs: ["keju"] })).toBeNull();
    expect(parseSkillsSnapshot(null)).toBeNull();
  });

  it("防御性过滤脏数据", () => {
    const parsed = parseSkillsSnapshot({
      allLoadedSlugs: ["keju", 123],
      versionMap    : { keju: "bad", other: 3 },
      selectedSlugs : "not-array"
    });
    expect(parsed?.allLoadedSlugs).toEqual(["keju"]);
    expect(parsed?.versionMap).toEqual({ other: 3 });
    expect(parsed?.selectedSlugs).toEqual([]);
  });
});

describe("createSkillSelector", () => {
  let prismaMock: {
    skill      : { findMany: ReturnType<typeof vi.fn> };
    book       : { findUnique: ReturnType<typeof vi.fn> };
    chapter    : { findMany: ReturnType<typeof vi.fn> };
    analysisJob: { update: ReturnType<typeof vi.fn> };
  };
  let callLlmMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prismaMock = {
      skill      : { findMany: vi.fn() },
      book       : { findUnique: vi.fn() },
      chapter    : { findMany: vi.fn() },
      analysisJob: { update: vi.fn() }
    };
    callLlmMock = vi.fn();
    prismaMock.book.findUnique.mockResolvedValue(makeBookRow());
    prismaMock.chapter.findMany.mockResolvedValue([{ title: "第一回", content: "正文" }]);
    callLlmMock.mockResolvedValue({
      skillSlugs  : ["keju"],
      inferredType: "classical-novel",
      reasons     : "科举背景"
    });
  });

  function makeSelector() {
    return createSkillSelector({
      prismaClient: prismaMock as unknown as PrismaClient,
      callLlm     : callLlmMock as unknown as (input: SkillSelectorCallLlmInput) => Promise<unknown>
    });
  }

  it("目录仅含 active+enabled 技能，name/description 取 frontmatter 覆盖", async () => {
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkillRow({
        slug       : "keju",
        name       : "DB名",
        description: "DB描述",
        scope      : "BOOK_TYPE",
        versions   : [makeVersion(2, mdWithOverrides("科举", "科举功名知识"))]
      })
    ]);

    const selector = makeSelector();
    await selector.selectSkills({ bookId: "book-1", jobId: "job-1" });

    expect(prismaMock.skill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "ACTIVE", isEnabled: true, deletedAt: null })
      })
    );
    // 目录清单携带 frontmatter name/description 覆盖值
    const user = callLlmMock.mock.calls[0][0].user as string;
    expect(user).toContain("keju｜科举｜科举功名知识｜HYBRID");
    expect(user).not.toContain("DB名");
  });

  it("书超长时正文抽样首/中/末", async () => {
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkillRow({ slug: "keju", versions: [makeVersion(1, mdWithOverrides("科举", "科举"))] })
    ]);
    prismaMock.chapter.findMany.mockResolvedValue([{ title: "第一回", content: "a".repeat(8000) }]);

    const selector = makeSelector();
    await selector.selectSkills({ bookId: "book-1", jobId: "job-1" });

    const user = callLlmMock.mock.calls[0][0].user as string;
    expect(user).toContain("【开头】");
    expect(user).toContain("【中段】");
    expect(user).toContain("【结尾】");
  });

  it("非法 slug 被 zod 目录过滤丢弃并告警，装载集合 = GLOBAL ∪ 选中", async () => {
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkillRow({ slug: "global-skill", scope: "GLOBAL", versions: [makeVersion(1, mdWithOverrides("常驻", "常驻"))] }),
      makeSkillRow({ slug: "keju", scope: "BOOK_TYPE", versions: [makeVersion(2, mdWithOverrides("科举", "科举"))] }),
      makeSkillRow({ slug: "unused", scope: "BOOK_TYPE", versions: [makeVersion(1, mdWithOverrides("未选", "未选"))] })
    ]);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    callLlmMock.mockResolvedValue({
      skillSlugs  : ["keju", "not-in-catalog"],
      inferredType: null,
      reasons     : "test"
    });

    const selector = makeSelector();
    const result = await selector.selectSkills({ bookId: "book-1", jobId: "job-1" });

    expect(result.selectedSlugs).toEqual(["keju"]);
    expect(result.allLoadedSlugs).toEqual(["global-skill", "keju"]);
    expect(result.selectedSkills.map((skill) => skill.slug)).toEqual(["global-skill", "keju"]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("not-in-catalog"));
    warnSpy.mockRestore();
  });

  it("relationshipCodes 契约取装载技能 frontmatter 并集", async () => {
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkillRow({ slug: "rel", scope: "GLOBAL", versions: [makeVersion(1, mdWithRelationshipCodes([{ code: "父子", direction: "INVERSE", category: "家庭" }]))] }),
      makeSkillRow({ slug: "keju", scope: "BOOK_TYPE", versions: [makeVersion(2, mdWithRelationshipCodes([{ code: "父子", direction: "INVERSE", category: "家庭" }, { code: "兄弟", direction: "SYMMETRIC", category: "家庭" }]))] })
    ]);

    const selector = makeSelector();
    const result = await selector.selectSkills({ bookId: "book-1", jobId: "job-1" });

    // GLOBAL 常驻 rel 也进入契约并集；父子去重（先到先得）
    expect(result.relationshipCodes).toEqual([
      { code: "父子", direction: "INVERSE", category: "家庭" },
      { code: "兄弟", direction: "SYMMETRIC", category: "家庭" }
    ]);
  });

  it("无激活版的 skill 从目录跳过", async () => {
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkillRow({ slug: "no-version", versions: [] })
    ]);

    const selector = makeSelector();
    const result = await selector.selectSkills({ bookId: "book-1", jobId: "job-1" });

    expect(result.allLoadedSlugs).toEqual([]);
    expect(result.selectedSlugs).toEqual([]);
  });

  it("frontmatter 解析失败的 skill 跳过并告警", async () => {
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkillRow({ slug: "bad", versions: [makeVersion(1, "---\nkind: [unclosed\n---\n")] })
    ]);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const selector = makeSelector();
    const result = await selector.selectSkills({ bookId: "book-1", jobId: "job-1" });

    expect(result.allLoadedSlugs).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("bad"), expect.any(String));
    warnSpy.mockRestore();
  });

  it("书籍不存在时抛错", async () => {
    prismaMock.skill.findMany.mockResolvedValue([]);
    prismaMock.book.findUnique.mockResolvedValue(null);

    const selector = makeSelector();
    await expect(selector.selectSkills({ bookId: "missing", jobId: "job-1" })).rejects.toThrow("书籍不存在");
  });

  it("LLM 输出不合法（非数组 skillSlugs）时抛错", async () => {
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkillRow({ slug: "keju", versions: [makeVersion(1, mdWithOverrides("科举", "科举"))] })
    ]);
    callLlmMock.mockResolvedValue({ skillSlugs: "not-array", inferredType: null, reasons: "x" });

    const selector = makeSelector();
    await expect(selector.selectSkills({ bookId: "book-1", jobId: "job-1" })).rejects.toThrow("skill 选择 LLM 输出不合法");
  });

  it("selectSkillsForJob 把选择结果快照进 AnalysisJob", async () => {
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkillRow({ slug: "global-skill", scope: "GLOBAL", versions: [makeVersion(1, mdWithRelationshipCodes([{ code: "父子", direction: "INVERSE", category: "家庭" }]))] }),
      makeSkillRow({ slug: "keju", scope: "BOOK_TYPE", versions: [makeVersion(3, mdWithOverrides("科举", "科举"))] })
    ]);
    prismaMock.analysisJob.update.mockResolvedValue({ id: "job-1" });

    const selector = makeSelector();
    const snapshot = await selector.selectSkillsForJob({ bookId: "book-1", jobId: "job-1" });

    expect(snapshot.selectedSlugs).toEqual(["keju"]);
    expect(snapshot.allLoadedSlugs).toEqual(["global-skill", "keju"]);
    expect(snapshot.versionMap).toEqual({ "global-skill": 1, keju: 3 });
    expect(snapshot.inferredType).toBe("classical-novel");
    expect(snapshot.selectedAt).toEqual(expect.any(String));

    expect(prismaMock.analysisJob.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data : {
        skillsSnapshot           : expect.objectContaining({ allLoadedSlugs: ["global-skill", "keju"] }),
        relationshipTypesSnapshot: [{ code: "父子", direction: "INVERSE", category: "家庭" }]
      }
    });
  });
});
