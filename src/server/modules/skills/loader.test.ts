import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { createSkillLoader } from "@/server/modules/skills/loader";

/**
 * resolveSkillsForJob 装载逻辑单测（MD 文档返回模式，v5 阶段 2）：
 * - 从 AnalysisJob.skillsSnapshot.allLoadedSlugs 装载 GLOBAL ∪ 选中 skill；
 * - 仅装载 status=ACTIVE 且 isEnabled=true 的全局激活版；
 * - 按 priority 降序返回候选 MD 文档；
 * - deicticJunk 契约名单取装载 GLOBAL skill frontmatter 并集；
 * - 无激活版的技能跳过；任务不存在抛错。
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

function mdContent(priority = 0, deicticJunk?: string[]): string {
  const deicticYaml = deicticJunk ? `deicticJunk: [${deicticJunk.join(", ")}]\n` : "";
  return `---
kind: HYBRID
triggers:
  priority: ${priority}
${deicticYaml}---

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
        slug    : "keju",
        name    : "科举",
        scope   : "GLOBAL",
        versions: [makeVersion({ versionNo: 2, content: mdContent(5) })]
      })
    ]);

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    const runtime = await loader.resolveSkillsForJob("job-1");

    expect(runtime.skills).toHaveLength(1);
    expect(runtime.skills[0].versionNo).toBe(2);
    expect(runtime.skills[0].markdown).toContain("指令内容");
    // 装载集合 = scope=GLOBAL ∪ allLoadedSlugs（Prisma 侧 OR 过滤）
    expect(prismaMock.skill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isEnabled: true,
          OR       : [{ scope: "GLOBAL" }, { slug: { in: ["keju"] } }]
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

  it("按 priority 降序返回候选", async () => {
    prismaMock.analysisJob.findUnique.mockResolvedValue({
      skillsSnapshot: { allLoadedSlugs: ["low", "high"] }
    });
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkill({ slug: "low", name: "低", versions: [makeVersion({ content: mdContent(10) })] }),
      makeSkill({ slug: "high", name: "高", versions: [makeVersion({ content: mdContent(20) })] })
    ]);

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    const runtime = await loader.resolveSkillsForJob("job-1");

    expect(runtime.skills.map((skill) => skill.slug)).toEqual(["high", "low"]);
  });

  it("summary 携带 category 字段", async () => {
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkill({
        slug    : "keju",
        category: "RELATIONSHIP_TYPE",
        versions: [makeVersion({ content: mdContent(5) })]
      })
    ]);

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    const runtime = await loader.resolveSkillsForJob("job-1");

    expect(runtime.summary[0]).toMatchObject({ slug: "keju", category: "RELATIONSHIP_TYPE", versionNo: 1 });
  });

  it("deicticJunk 取装载 GLOBAL skill frontmatter 契约并集（去重）", async () => {
    prismaMock.analysisJob.findUnique.mockResolvedValue({
      skillsSnapshot: { allLoadedSlugs: ["keju"] }
    });
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkill({ slug: "deictic-a", scope: "GLOBAL", versions: [makeVersion({ content: mdContent(5, ["众人", "此人"]) })] }),
      makeSkill({ slug: "deictic-b", scope: "GLOBAL", versions: [makeVersion({ content: mdContent(4, ["老者", "众人"]) })] }),
      // BOOK_TYPE skill 的契约名单不应进入（仅 GLOBAL 契约生效）
      makeSkill({ slug: "keju", scope: "BOOK_TYPE", versions: [makeVersion({ content: mdContent(3, ["外人"]) })] })
    ]);

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    const runtime = await loader.resolveSkillsForJob("job-1");

    expect(runtime.deicticJunk).toEqual(["众人", "此人", "老者"]);
  });

  it("无激活版的技能被跳过（Prisma 只回传 isActive 版本，空数组即跳过）", async () => {
    prismaMock.skill.findMany.mockResolvedValue([
      makeSkill({ slug: "draft-skill", versions: [] })
    ]);

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    const runtime = await loader.resolveSkillsForJob("job-1");

    expect(runtime.skills).toHaveLength(0);
  });

  it("isEnabled=false 的技能不装载（where 过滤后返回空）", async () => {
    prismaMock.skill.findMany.mockResolvedValue([]);

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    const runtime = await loader.resolveSkillsForJob("job-1");

    expect(runtime.skills).toHaveLength(0);
    expect(prismaMock.skill.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isEnabled: true })
      })
    );
  });

  it("任务不存在时抛错", async () => {
    prismaMock.analysisJob.findUnique.mockResolvedValue(null);

    const loader = createSkillLoader(prismaMock as unknown as PrismaClient);
    await expect(loader.resolveSkillsForJob("missing-job")).rejects.toThrow("分析任务不存在");
  });

  it("loadSkill 按 id 返回激活版全文", async () => {
    prismaMock.skill.findUnique.mockResolvedValue({
      slug    : "keju",
      name    : "科举",
      versions: [makeVersion({ versionNo: 2, content: mdContent(5) })]
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
