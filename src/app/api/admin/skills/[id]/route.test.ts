/**
 * 文件定位（Next.js Route Handler 单测）：
 * - 本文件对应 `src/app/api/admin/skills/[id]/route.ts`，验证技能包详情与基本信息更新接口契约。
 * - 详情含完整 MD 内容与 frontmatter 契约（relationshipCodes）；
 *   PATCH 更新 name/description/scope/status。
 *
 * 业务职责：
 * - 约束鉴权、参数校验、404/400 映射与统一响应包结构。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const getSkillMock = vi.fn();
const getSkillContractMock = vi.fn();
const updateSkillInfoMock = vi.fn();

const SKILL_ID = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/skills", () => ({
  skillService: {
    getSkill        : getSkillMock,
    getSkillContract: getSkillContractMock,
    updateSkillInfo : updateSkillInfoMock
  }
}));

const skillDetail = {
  id         : SKILL_ID,
  slug       : "keju",
  name       : "科举",
  description: null,
  scope      : "GLOBAL",
  status     : "ENABLED",
  content    : "---\nname: 科举\n---\n\n正文"
};

const skillContract = {
  relationshipCodes: [{ code: "父子", direction: "INVERSE", category: "血缘", aliases: ["父亲"] }]
};

function paramsOf(): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id: SKILL_ID }) };
}

describe("GET /api/admin/skills/[id]", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    getSkillMock.mockReset();
    getSkillContractMock.mockReset();
    updateSkillInfoMock.mockReset();
    vi.resetModules();
  });

  it("returns skill detail with content and contract", async () => {
    getSkillMock.mockResolvedValue(skillDetail);
    getSkillContractMock.mockResolvedValue(skillContract);
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/admin/skills/" + SKILL_ID), paramsOf());

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_SKILL_DETAIL");
    expect(payload.data?.name).toBe("科举");
    expect(payload.data?.content).toContain("正文");
    expect(payload.data?.contract?.relationshipCodes[0]?.code).toBe("父子");
  });

  it("returns 404 when skill does not exist", async () => {
    getSkillMock.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/admin/skills/" + SKILL_ID), paramsOf());

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });

  it("returns 403 when auth guard fails", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/admin/skills/" + SKILL_ID), paramsOf());

    expect(response.status).toBe(403);
    expect(getSkillMock).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/admin/skills/[id]", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    getSkillMock.mockReset();
    getSkillContractMock.mockReset();
    updateSkillInfoMock.mockReset();
    vi.resetModules();
  });

  it("updates metadata via PATCH and returns updated state", async () => {
    getSkillMock.mockResolvedValue(skillDetail);
    updateSkillInfoMock.mockResolvedValue(undefined);
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("http://localhost/api/admin/skills/" + SKILL_ID, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ name: "科举考试", description: "科举相关", status: "DISABLED" })
      }),
      paramsOf()
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_SKILL_UPDATED");
    expect(updateSkillInfoMock).toHaveBeenCalledWith({
      skillId    : SKILL_ID,
      name       : "科举考试",
      description: "科举相关",
      status     : "DISABLED"
    });
  });

  it("returns 404 when skill does not exist", async () => {
    getSkillMock.mockResolvedValue(null);
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("http://localhost/api/admin/skills/" + SKILL_ID, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ status: "ENABLED" })
      }),
      paramsOf()
    );

    expect(response.status).toBe(404);
    expect(updateSkillInfoMock).not.toHaveBeenCalled();
  });

  it("returns 400 when body is invalid", async () => {
    getSkillMock.mockResolvedValue(skillDetail);
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("http://localhost/api/admin/skills/" + SKILL_ID, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ status: "NOT_A_STATUS" })
      }),
      paramsOf()
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(updateSkillInfoMock).not.toHaveBeenCalled();
  });

  it("returns 403 when auth guard fails", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("http://localhost/api/admin/skills/" + SKILL_ID, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ status: "ENABLED" })
      }),
      paramsOf()
    );

    expect(response.status).toBe(403);
    expect(updateSkillInfoMock).not.toHaveBeenCalled();
  });

  it("returns 500 when service throws", async () => {
    getSkillMock.mockResolvedValue(skillDetail);
    updateSkillInfoMock.mockRejectedValue(new Error("db unavailable"));
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("http://localhost/api/admin/skills/" + SKILL_ID, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ status: "ENABLED" })
      }),
      paramsOf()
    );

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
  });
});
