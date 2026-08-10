/**
 * 文件定位（Next.js Route Handler 单测）：
 * - 本文件对应 `src/app/api/admin/skills/[id]/regenerate/route.ts`，
 *   验证 AI 重新生成技能内容接口契约（不落库，返回生成的 content）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const getSkillMock = vi.fn();
const generateSkillMarkdownMock = vi.fn();

const SKILL_ID = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/skills", () => ({
  skillService: {
    getSkill: getSkillMock
  },
  aiSkillGenerator: {
    generateSkillMarkdown: generateSkillMarkdownMock
  }
}));

const skillDetail = {
  id         : SKILL_ID,
  slug       : "keju",
  name       : "科举",
  description: "科举相关",
  scope      : "GLOBAL",
  status     : "ENABLED",
  content    : "---\nname: 科举\n---\n\n正文"
};

function paramsOf(): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: SKILL_ID }) };
}

describe("POST /api/admin/skills/[id]/regenerate", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    getSkillMock.mockReset();
    generateSkillMarkdownMock.mockReset();
    vi.resetModules();
  });

  it("生成新内容并返回（不落库）", async () => {
    getSkillMock.mockResolvedValue(skillDetail);
    generateSkillMarkdownMock.mockResolvedValue({
      draft   : { name: "科举新版", description: "科举相关", scope: "GLOBAL", body: "正文" },
      markdown: "---\nname: 科举新版\n---\n\n正文"
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/skills/" + SKILL_ID + "/regenerate", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ purpose: "重写科举相关技能" })
      }),
      paramsOf()
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_SKILL_REGENERATED");
    expect(generateSkillMarkdownMock).toHaveBeenCalledWith(expect.objectContaining({
      purpose: "重写科举相关技能"
    }));
    expect(payload.data?.content).toContain("科举新版");
  });

  it("purpose 缺省用现有 description", async () => {
    getSkillMock.mockResolvedValue(skillDetail);
    generateSkillMarkdownMock.mockResolvedValue({
      draft   : { name: "科举新版", description: "科举相关", scope: "GLOBAL", body: "正文" },
      markdown: "---\nname: 科举新版\n---\n\n正文"
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/skills/" + SKILL_ID + "/regenerate", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({})
      }),
      paramsOf()
    );

    expect(response.status).toBe(200);
    expect(generateSkillMarkdownMock).toHaveBeenCalledWith(expect.objectContaining({
      purpose: "科举相关"
    }));
  });

  it("returns 404 when skill does not exist", async () => {
    getSkillMock.mockResolvedValue(null);
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/skills/" + SKILL_ID + "/regenerate", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ purpose: "重写" })
      }),
      paramsOf()
    );

    expect(response.status).toBe(404);
    expect(generateSkillMarkdownMock).not.toHaveBeenCalled();
  });

  it("returns 403 when auth guard fails", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/skills/" + SKILL_ID + "/regenerate", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ purpose: "重写" })
      }),
      paramsOf()
    );

    expect(response.status).toBe(403);
    expect(generateSkillMarkdownMock).not.toHaveBeenCalled();
  });

  it("returns 500 when generation fails", async () => {
    getSkillMock.mockResolvedValue(skillDetail);
    generateSkillMarkdownMock.mockRejectedValue(new Error("系统无可用模型"));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/skills/" + SKILL_ID + "/regenerate", {
        method : "POST",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ purpose: "重写" })
      }),
      paramsOf()
    );

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
  });
});
