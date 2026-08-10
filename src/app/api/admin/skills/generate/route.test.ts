/**
 * 文件定位（Next.js Route Handler 单测）：
 * - 本文件对应 `src/app/api/admin/skills/generate/route.ts`，验证 AI 生成技能接口契约。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const generateSkillFromPromptMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/skills", () => ({
  aiSkillGenerator: {
    generateSkillFromPrompt: generateSkillFromPromptMock
  }
}));

describe("POST /api/admin/skills/generate", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    generateSkillFromPromptMock.mockReset();
    vi.resetModules();
  });

  it("generates a skill via AI", async () => {
    generateSkillFromPromptMock.mockResolvedValue({ skillId: "skill-new", slug: "ai-科举", status: "ENABLED" });
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/skills/generate", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ purpose: "科举相关的称谓与关系码知识" })
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_SKILL_GENERATED");
    expect(generateSkillFromPromptMock).toHaveBeenCalledWith({ purpose: "科举相关的称谓与关系码知识" });
    expect(payload.data?.slug).toBe("ai-科举");
  });

  it("returns 400 when purpose is empty", async () => {
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/skills/generate", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ purpose: "   " })
    }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(generateSkillFromPromptMock).not.toHaveBeenCalled();
  });

  it("returns 403 when auth guard fails", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/skills/generate", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ purpose: "测试" })
    }));

    expect(response.status).toBe(403);
    expect(generateSkillFromPromptMock).not.toHaveBeenCalled();
  });

  it("returns 500 when AI generation fails", async () => {
    generateSkillFromPromptMock.mockRejectedValue(new Error("系统无可用模型"));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/skills/generate", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ purpose: "测试" })
    }));

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
  });
});
