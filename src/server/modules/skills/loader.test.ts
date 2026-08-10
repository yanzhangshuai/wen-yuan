import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { createSkillLoader } from "@/server/modules/skills/loader";

/**
 * resolveSkillsForJob 装载逻辑单测（MD 文档返回模式）：
 * - 从 AnalysisJob.skillsSnapshot.allLoadedSlugs 装载 GLOBAL ∪ 选中 skill；
 * - 仅装载 status=ENABLED 的 skill（content 直读当前内容）；
 * - 保持 createdAt 稳定顺序；
 * - 任务不存在抛错。
 */

function makeSkill(overrides: Partial<Record<string, unknown>>) {
  const slug = typeof overrides.slug === "string" ? overrides.slug : "skill-x";
  return {
    id         : "skill-" + slug,
    slug,
    name       : overrides.name ?? "技能",
    description: overrides.description ?? null,
    scope      : overrides.scope ?? "GLOBAL",
    status     : overrides.status ?? "ENABLED",
    content    : overrides.content ?? "",
    createdAt  : new Date("2026-08-06T00:00:00Z")
  };
}

function mdContent(): string {
  return `---
name: 技能
---

## 指令
- 指令内容
`;
}

describe("createSkillLoader", () => {
  let prismaMock: {
    skill      : { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
    analysisJob: { findUnique: ReturnType<typeof vi.fn> };
  };

  beforeEach(() => {
    prismaMock = {
      skill      : { findMany: vi.fn(), findUnique: vi.fn() },
      analysisJob: { findUnique: vi.fn() }
    };
    // 默认任务快照：选中 keju（非 GLOBAL 需在快照内才装载）
    prismaMock.analysisJob.findUnique.mockResolvedValue({
      skillsSnapshot: { allLoadedSlugs: ["keju"] }
    });
  });

  it("从任务快照装载 GLOBAL ∪ 选中的 skill（快照外 BOOK_TYPE 不装载）", async () => {
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkill({
        slug   : "keju",
        name   : "科举",
        scope  : "GLOBAL",
        content: mdContent()
      })
    ]);

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    const runtime = await loader.resolveSkillsForJob("job-1");

    expect(runtime.skills).toHaveLength(1);
    expect(runtime.skills[0].markdown).toContain("指令内容");
    // 装载集合 = scope=GLOBAL ∪ allLoadedSlugs（Prisma 侧 OR 过滤），且仅 status=ENABLED
    expect(prismaMock.skill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "ENABLED",
          OR    : [{ scope: "GLOBAL" }, { slug: { in: ["keju"] } }]
        })
      })
    );
  });

  it("快照结构缺失时回退为仅 GLOBAL（allLoadedSlugs 空）", async () => {
    prismaMock.analysisJob.findUnique.mockResolvedValue({ skillsSnapshot: null });
    prismaMock.skill.findMany.mockResolvedValue([]);

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    await loader.resolveSkillsForJob("job-1");

    expect(prismaMock.skill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ OR: [{ scope: "GLOBAL" }, { slug: { in: [] } }] })
      })
    );
  });

  it("按 createdAt 稳定顺序返回候选", async () => {
    prismaMock.analysisJob.findUnique.mockResolvedValue({
      skillsSnapshot: { allLoadedSlugs: ["low", "high"] }
    });
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkill({ slug: "low", name: "低", content: mdContent() }),
      makeSkill({ slug: "high", name: "高", content: mdContent() })
    ]);

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    const runtime = await loader.resolveSkillsForJob("job-1");

    expect(runtime.skills.map((skill) => skill.slug)).toEqual(["low", "high"]);
  });

  it("summary 携带技能摘要字段", async () => {
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkill({ slug: "keju", content: mdContent() })
    ]);

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    const runtime = await loader.resolveSkillsForJob("job-1");

    expect(runtime.summary[0]).toMatchObject({ slug: "keju", name: "技能", description: null });
    expect(runtime.summary[0]).not.toHaveProperty("versionNo");
  });

  it("frontmatter 非法的技能被跳过并告警", async () => {
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkill({ slug: "bad", content: "---\nname: [broken\n---\n正文" })
    ]);

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    const runtime = await loader.resolveSkillsForJob("job-1");

    expect(runtime.skills).toHaveLength(0);
  });

  it("任务不存在时抛错", async () => {
    prismaMock.analysisJob.findUnique.mockResolvedValue(null);

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    await expect(loader.resolveSkillsForJob("missing-job")).rejects.toThrow("分析任务不存在");
  });

});
