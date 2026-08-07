import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { createSkillService } from "@/server/modules/skills/skillService";

vi.mock("@/server/modules/knowledge/audit", () => ({
  auditLog: vi.fn()
}));

/**
 * Skill CRUD + 版本管理单测：
 * - createSkill（合法 content 建包 + 版本；非法 content 拒绝）；
 * - listSkills（返回激活版本号）；
 * - activateVersion（停用同 skill 其他激活版，激活目标版）；
 * - setSkillEnabled（切换独立启停开关）。
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
    $transaction: ReturnType<typeof vi.fn>;
    skill        : {
      findMany  : ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      create    : ReturnType<typeof vi.fn>;
      update    : ReturnType<typeof vi.fn>;
    };
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
      skill       : {
        findMany  : vi.fn(),
        findUnique: vi.fn(),
        create    : vi.fn(),
        update    : vi.fn()
      },
      skillVersion: {
        findFirst : vi.fn(),
        create    : vi.fn(),
        updateMany: vi.fn(),
        update    : vi.fn()
      }
    };
  });

  it("createSkill 校验非法 content 并拒绝", async () => {
    const service = createSkillService(prismaMock as unknown as PrismaClient);
    await expect(service.createSkill({
      slug    : "bad",
      name    : "Bad",
      category: "HYBRID" as never,
      scope   : "GLOBAL",
      content : "---\nknowledge: [unclosed\n---\nbad"
    })).rejects.toThrow("frontmatter");
  });

  it("createSkill 合法 content 创建包与首版", async () => {
    const txMock = {
      skill: {
        create: vi.fn().mockResolvedValue({ id: "skill-1", slug: "keju", name: "科举" })
      }
    };
    (prismaMock.$transaction).mockImplementation((fn: (tx: unknown) => unknown) => fn(txMock));

    const service = createSkillService(prismaMock as unknown as PrismaClient);
    const result = await service.createSkill({
      slug    : "keju",
      name    : "科举",
      category: "HYBRID" as never,
      scope   : "GLOBAL",
      content : VALID_CONTENT
    });

    expect(result.id).toBe("skill-1");
    expect(txMock.skill.create).toHaveBeenCalled();
    expect(prismaMock.$transaction).toHaveBeenCalled();
  });

  it("listSkills 返回激活版本号", async () => {
    (prismaMock.skill.findMany).mockResolvedValue([
      {
        id         : "skill-1",
        slug       : "keju",
        name       : "科举",
        description: null,
        category   : "HYBRID",
        scope      : "GLOBAL",
        status     : "ACTIVE",
        source     : "MANUAL",
        sortOrder  : 0,
        isBuiltin  : false,
        createdAt  : new Date("2026-08-06T00:00:00Z"),
        updatedAt  : new Date("2026-08-06T00:00:00Z"),
        versions   : [{ versionNo: 3, bookTypeId: null }]
      }
    ]);

    const service = createSkillService(prismaMock as unknown as PrismaClient);
    const list = await service.listSkills();

    expect(list).toHaveLength(1);
    expect(list[0].versionNo).toBe(3);
  });

  it("activateVersion 停用同作用域激活版并激活目标版", async () => {
    (prismaMock.skillVersion.findFirst).mockResolvedValue({
      id: "version-2", skillId: "skill-1"
    });
    (prismaMock.$transaction).mockImplementation((fn: (tx: unknown) => unknown) => fn(prismaMock));
    (prismaMock.skill.findUnique).mockResolvedValue({ name: "科举" });

    const service = createSkillService(prismaMock as unknown as PrismaClient);
    await service.activateVersion({ skillId: "skill-1", versionId: "version-2" });

    expect(prismaMock.skillVersion.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ isActive: true }) })
    );
    expect(prismaMock.skillVersion.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "version-2" }, data: expect.objectContaining({ isActive: true }) })
    );
  });

  it("activateVersion 版本不存在时抛错", async () => {
    (prismaMock.skillVersion.findFirst).mockResolvedValue(null);
    const service = createSkillService(prismaMock as unknown as PrismaClient);
    await expect(service.activateVersion({ skillId: "skill-1", versionId: "nope" })).rejects.toThrow("版本不存在");
  });

  it("setSkillEnabled 切换独立启停开关", async () => {
    (prismaMock.skill.update).mockResolvedValue({ id: "skill-1" });
    (prismaMock.skill.findUnique).mockResolvedValue({ name: "科举" });

    const service = createSkillService(prismaMock as unknown as PrismaClient);
    await service.setSkillEnabled("skill-1", false);

    expect(prismaMock.skill.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "skill-1" }, data: expect.objectContaining({ isEnabled: false }) })
    );
  });
});
