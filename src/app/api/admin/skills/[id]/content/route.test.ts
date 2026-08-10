/**
 * 文件定位（Next.js Route Handler 单测）：
 * - 本文件对应 `src/app/api/admin/skills/[id]/content/route.ts`，验证技能 MD 内容保存接口契约。
 * - PUT 保存内容（保存即覆盖当前内容，无版本概念）。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const getSkillMock = vi.fn();
const updateSkillContentMock = vi.fn();

const SKILL_ID = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/skills", () => ({
  skillService: {
    getSkill          : getSkillMock,
    updateSkillContent: updateSkillContentMock
  }
}));

const skillDetail = {
  id     : SKILL_ID,
  slug   : "keju",
  name   : "科举",
  content: "---\nname: 科举\n---\n\n正文"
};

const VALID_CONTENT = `---
name: 科举
description: 科举相关
scope: GLOBAL
---

# 科举

正文内容
`;

function paramsOf(): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: SKILL_ID }) };
}

function putRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/skills/" + SKILL_ID + "/content", {
    method : "PUT",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}

describe("PUT /api/admin/skills/[id]/content", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    getSkillMock.mockReset();
    updateSkillContentMock.mockReset();
    vi.resetModules();
  });

  it("saves content directly", async () => {
    getSkillMock.mockResolvedValue(skillDetail);
    updateSkillContentMock.mockResolvedValue({ updatedAt: "2026-08-06T00:00:00.000Z" });
    const { PUT } = await import("./route");

    const response = await PUT(putRequest({ content: VALID_CONTENT }), paramsOf());

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_SKILL_CONTENT_UPDATED");
    expect(updateSkillContentMock).toHaveBeenCalledWith({
      skillId: SKILL_ID,
      content: VALID_CONTENT
    });
    expect(payload.data?.updatedAt).toBe("2026-08-06T00:00:00.000Z");
  });

  it("returns 400 when content is missing", async () => {
    getSkillMock.mockResolvedValue(skillDetail);
    const { PUT } = await import("./route");

    const response = await PUT(putRequest({}), paramsOf());

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(updateSkillContentMock).not.toHaveBeenCalled();
  });

  it("returns 404 when skill does not exist", async () => {
    getSkillMock.mockResolvedValue(null);
    const { PUT } = await import("./route");

    const response = await PUT(putRequest({ content: VALID_CONTENT }), paramsOf());

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });

  it("returns 403 when auth guard fails", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { PUT } = await import("./route");

    const response = await PUT(putRequest({ content: VALID_CONTENT }), paramsOf());

    expect(response.status).toBe(403);
    expect(updateSkillContentMock).not.toHaveBeenCalled();
  });

  it("returns 500 when service throws", async () => {
    getSkillMock.mockResolvedValue(skillDetail);
    updateSkillContentMock.mockRejectedValue(new Error("frontmatter 校验失败"));
    const { PUT } = await import("./route");

    const response = await PUT(putRequest({ content: VALID_CONTENT }), paramsOf());

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
  });
});
