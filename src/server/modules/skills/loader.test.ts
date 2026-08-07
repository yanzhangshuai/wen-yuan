import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { createSkillLoader } from "@/server/modules/skills/loader";

/**
 * resolveSkillsForBook 装载逻辑单测（MD 文档返回模式）：
 * - 仅装载 status=ACTIVE 且 isEnabled=true 的全局激活版；
 * - taskType 过滤；
 * - 按 priority 降序返回候选 MD 文档；
 * - 无激活版的技能跳过。
 *
 * v5 阶段 1（08-07-v5-skill-loading）：book_type 关联已删，不做书型过滤；
 * 阶段 2 改由 AI 动态 skill 选择决定装载集合。
 */

function makeVersion(overrides: Partial<Record<string, unknown>>) {
  const versionNo = typeof overrides.versionNo === "number" ? overrides.versionNo : 1;
  return {
    id      : "version-" + versionNo,
    versionNo,
    content : overrides.content ?? "",
    isActive: overrides.isActive ?? true
  };
}

function makeSkill(overrides: Partial<Record<string, unknown>>) {
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
    skill: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    prismaMock = {
      skill: { findMany: vi.fn(), findUnique: vi.fn() }
    };
  });

  it("装载全局激活版（忽略书型，v5 无书型概念）", async () => {
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkill({
        slug    : "keju",
        name    : "科举",
        scope   : "GLOBAL",
        versions: [makeVersion({ versionNo: 2, content: mdContent(5) })]
      })
    ]);

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    const runtime = await loader.resolveSkillsForBook("book-1", "CHAPTER_ANALYSIS");

    expect(runtime.skills).toHaveLength(1);
    expect(runtime.skills[0].versionNo).toBe(2);
    expect(runtime.skills[0].markdown).toContain("指令内容");
  });

  it("taskType 过滤：不含当前任务的 skill 被跳过", async () => {
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkill({
        slug    : "keju",
        versions: [makeVersion({ content: mdContent(10, ["GLOBAL_RESOLUTION"]) })]
      })
    ]);

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    const runtime = await loader.resolveSkillsForBook("book-1", "CHAPTER_ANALYSIS");

    expect(runtime.skills).toHaveLength(0);
  });

  it("按 priority 降序返回候选", async () => {
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkill({ slug: "low", name: "低", versions: [makeVersion({ content: mdContent(10) })] }),
      makeSkill({ slug: "high", name: "高", versions: [makeVersion({ content: mdContent(20) })] })
    ]);

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    const runtime = await loader.resolveSkillsForBook("book-1", "CHAPTER_ANALYSIS");

    expect(runtime.skills.map((skill) => skill.slug)).toEqual(["high", "low"]);
  });

  it("无激活版的技能被跳过（Prisma 只回传 isActive 版本，空数组即跳过）", async () => {
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkill({
        slug    : "draft-skill",
        versions: []
      })
    ]);

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    const runtime = await loader.resolveSkillsForBook("book-1", "CHAPTER_ANALYSIS");

    expect(runtime.skills).toHaveLength(0);
  });

  it("isEnabled=false 的技能不装载（R1 独立启停：where 过滤后返回空）", async () => {
    // 装载器 where 含 isEnabled: true，Prisma 侧已过滤；此处断言空结果。
    prismaMock.skill.findMany.mockResolvedValue([]);

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    const runtime = await loader.resolveSkillsForBook("book-1", "CHAPTER_ANALYSIS");

    expect(runtime.skills).toHaveLength(0);
    expect(prismaMock.skill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isEnabled: true })
      })
    );
  });

  it("loadSkill 按 id 返回激活版全文", async () => {
    prismaMock.skill.findUnique.mockResolvedValue({
      slug    : "keju",
      name    : "科举",
      versions: [
        makeVersion({ versionNo: 2, content: mdContent(5) })
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
