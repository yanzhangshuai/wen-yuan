import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { createSkillService } from "@/server/modules/skills/skillService";

/**
 * Skill CRUD 单测：
 * - createSkill（合法 content 建包；非法 content 拒绝）；
 * - listSkills（列表，无版本号/启停）；
 * - getSkill / getSkillContract（从当前 content 解析契约）；
 * - updateSkillInfo / updateSkillContent（保存即覆盖 + frontmatter 同步 DB 列）；
 * - setStatus / deleteSkill。
 */

const VALID_CONTENT = `---
kind: HYBRID
knowledge:
  relationalTerms: [父亲]
triggers:
  priority: 10
---

## 指令
- 测试指令
`;

describe("createSkillService", () => {
  let prismaMock: {
    skill: {
      findMany  : ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      create    : ReturnType<typeof vi.fn>;
      update    : ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock = {
      skill: {
        findMany  : vi.fn(),
        findUnique: vi.fn(),
        create    : vi.fn(),
        update    : vi.fn()
      }
    };
  });

  it("createSkill 校验非法 content 并拒绝", async () => {
    const service = createSkillService(prismaMock as unknown as PrismaClient);
    await expect(service.createSkill({
      slug   : "bad",
      name   : "Bad",
      scope  : "GLOBAL",
      content: "---\nknowledge: [unclosed\n---\nbad"
    })).rejects.toThrow("frontmatter");
  });

  it("createSkill 合法 content 创建（默认 ENABLED）", async () => {
    (prismaMock.skill.create).mockResolvedValue({ id: "skill-1", slug: "keju", name: "科举" });

    const service = createSkillService(prismaMock as unknown as PrismaClient);
    const result = await service.createSkill({
      slug   : "keju",
      name   : "科举",
      scope  : "GLOBAL",
      content: VALID_CONTENT
    });

    expect(result.id).toBe("skill-1");
    expect(prismaMock.skill.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ENABLED", content: VALID_CONTENT })
    }));
  });

  it("listSkills 返回列表（无版本号）", async () => {
    (prismaMock.skill.findMany).mockResolvedValue([
      {
        id         : "skill-1",
        slug       : "keju",
        name       : "科举",
        description: null,
        scope      : "GLOBAL",
        status     : "ENABLED",
        createdAt  : new Date("2026-08-06T00:00:00Z"),
        updatedAt  : new Date("2026-08-06T00:00:00Z")
      }
    ]);

    const service = createSkillService(prismaMock as unknown as PrismaClient);
    const list = await service.listSkills();

    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ slug: "keju", status: "ENABLED" });
    expect(list[0]).not.toHaveProperty("versionNo");
    expect(list[0]).not.toHaveProperty("isEnabled");
  });

  it("getSkill 返回完整 content", async () => {
    (prismaMock.skill.findUnique).mockResolvedValue({
      id         : "skill-1",
      slug       : "keju",
      name       : "科举",
      description: null,
      scope      : "GLOBAL",
      status     : "ENABLED",
      content    : VALID_CONTENT,
      createdAt  : new Date("2026-08-06T00:00:00Z"),
      updatedAt  : new Date("2026-08-06T00:00:00Z")
    });

    const service = createSkillService(prismaMock as unknown as PrismaClient);
    const detail = await service.getSkill("skill-1");

    expect(detail?.content).toContain("测试指令");
  });

  it("getSkillContract 从当前 content 解析契约", async () => {
    (prismaMock.skill.findUnique).mockResolvedValue({
      id     : "skill-1",
      content: `---
name: 古典关系类型
relationshipCodes:
  - code: 父子
    direction: INVERSE
    category: 血缘
    aliases: [父亲, 父]
---
正文`
    });

    const service = createSkillService(prismaMock as unknown as PrismaClient);
    const contract = await service.getSkillContract("skill-1");

    expect(contract).not.toBeNull();
    expect(contract?.relationshipCodes[0]).toMatchObject({ code: "父子", direction: "INVERSE" });
    expect(contract).not.toHaveProperty("deicticJunk");
  });

  it("getSkillContract skill 不存在返回 null", async () => {
    (prismaMock.skill.findUnique).mockResolvedValue(null);

    const service = createSkillService(prismaMock as unknown as PrismaClient);
    const contract = await service.getSkillContract("nope");

    expect(contract).toBeNull();
  });

  it("updateSkillInfo 更新基本信息字段", async () => {
    (prismaMock.skill.update).mockResolvedValue({ id: "skill-1" });

    const service = createSkillService(prismaMock as unknown as PrismaClient);
    await service.updateSkillInfo({
      skillId: "skill-1",
      name   : "科举考试",
      scope  : "BOOK_TYPE",
      status : "DISABLED"
    });

    expect(prismaMock.skill.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "skill-1" },
      data : expect.objectContaining({ name: "科举考试", scope: "BOOK_TYPE", status: "DISABLED" })
    }));
  });

  it("updateSkillContent 保存非法 frontmatter 时拒绝", async () => {
    const service = createSkillService(prismaMock as unknown as PrismaClient);
    await expect(service.updateSkillContent({
      skillId: "skill-1",
      content: "---\nkind: [broken\n---\n正文"
    })).rejects.toThrow("frontmatter");
    expect(prismaMock.skill.update).not.toHaveBeenCalled();
  });

  it("updateSkillContent 覆盖 content 并从 frontmatter 同步元数据", async () => {
    (prismaMock.skill.findUnique).mockResolvedValue({ id: "skill-1" });
    (prismaMock.skill.update).mockResolvedValue({ id: "skill-1", updatedAt: new Date("2026-08-06T00:00:00Z") });

    const service = createSkillService(prismaMock as unknown as PrismaClient);
    const result = await service.updateSkillContent({
      skillId: "skill-1",
      content: `---
name: 科举考试
description: 科举相关
scope: GLOBAL
---

# 正文
`
    });

    expect(result.updatedAt).toBe("2026-08-06T00:00:00.000Z");
    expect(prismaMock.skill.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "skill-1" },
      data : expect.objectContaining({
        content    : "---\nname: 科举考试\ndescription: 科举相关\nscope: GLOBAL\n---\n\n# 正文\n",
        name       : "科举考试",
        description: "科举相关",
        scope      : "GLOBAL"
      })
    }));
  });

  it("setStatus 设置启用/停用", async () => {
    (prismaMock.skill.update).mockResolvedValue({ id: "skill-1" });

    const service = createSkillService(prismaMock as unknown as PrismaClient);
    await service.setStatus("skill-1", "DISABLED");

    expect(prismaMock.skill.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "skill-1" }, data: expect.objectContaining({ status: "DISABLED" }) })
    );
  });

  it("deleteSkill 软删除", async () => {
    (prismaMock.skill.update).mockResolvedValue({ id: "skill-1" });

    const service = createSkillService(prismaMock as unknown as PrismaClient);
    await service.deleteSkill("skill-1");

    expect(prismaMock.skill.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "skill-1" }, data: expect.objectContaining({ deletedAt: expect.any(Date) }) })
    );
  });
});
