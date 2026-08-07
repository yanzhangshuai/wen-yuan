/**
 * 文件定位（Next.js Route Handler 单测）：
 * - 本文件对应 `src/app/api/admin/skills/[id]/route.ts`，验证技能包详情与启停切换接口契约。
 * - v5（阶段 5）：详情只读展示激活版 frontmatter 契约（relationshipCodes / deicticJunk），
 *   PATCH 切换独立启停开关（isEnabled）。
 *
 * 业务职责：
 * - 约束鉴权、参数校验、404/400 映射与统一响应包结构。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const getSkillMock = vi.fn();
const getSkillContractMock = vi.fn();
const setSkillEnabledMock = vi.fn();

const SKILL_ID = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/skills", () => ({
  skillService: {
    getSkill        : getSkillMock,
    getSkillContract: getSkillContractMock,
    setSkillEnabled : setSkillEnabledMock
  }
}));

const skillDetail = {
  id                 : SKILL_ID,
  slug               : "keju",
  name               : "科举",
  description        : null,
  category           : "HYBRID",
  scope              : "GLOBAL",
  status             : "ACTIVE",
  source             : "MANUAL",
  sortOrder          : 0,
  isBuiltin          : true,
  isEnabled          : true,
  generatedFromBookId: null,
  versions           : []
};

const skillContract = {
  versionNo        : 3,
  relationshipCodes: [{ code: "父子", direction: "INVERSE", category: "血缘", aliases: ["父亲"] }],
  deicticJunk      : ["之", "其"]
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
    setSkillEnabledMock.mockReset();
    vi.resetModules();
  });

  it("returns skill detail with contract", async () => {
    getSkillMock.mockResolvedValue(skillDetail);
    getSkillContractMock.mockResolvedValue(skillContract);
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/admin/skills/" + SKILL_ID), paramsOf());

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_SKILL_DETAIL");
    expect(payload.data?.name).toBe("科举");
    expect(payload.data?.contract?.relationshipCodes[0]?.code).toBe("父子");
    expect(payload.data?.contract?.deicticJunk).toEqual(["之", "其"]);
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
    setSkillEnabledMock.mockReset();
    vi.resetModules();
  });

  it("toggles isEnabled and returns updated state", async () => {
    getSkillMock.mockResolvedValue(skillDetail);
    setSkillEnabledMock.mockResolvedValue(undefined);
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("http://localhost/api/admin/skills/" + SKILL_ID, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ isEnabled: false })
      }),
      paramsOf()
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_SKILL_ENABLED_UPDATED");
    expect(setSkillEnabledMock).toHaveBeenCalledWith(SKILL_ID, false);
    expect(payload.data?.isEnabled).toBe(false);
  });

  it("returns 404 when skill does not exist", async () => {
    getSkillMock.mockResolvedValue(null);
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("http://localhost/api/admin/skills/" + SKILL_ID, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ isEnabled: true })
      }),
      paramsOf()
    );

    expect(response.status).toBe(404);
    expect(setSkillEnabledMock).not.toHaveBeenCalled();
  });

  it("returns 400 when body is invalid", async () => {
    getSkillMock.mockResolvedValue(skillDetail);
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("http://localhost/api/admin/skills/" + SKILL_ID, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ isEnabled: "yes" })
      }),
      paramsOf()
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(setSkillEnabledMock).not.toHaveBeenCalled();
  });

  it("returns 403 when auth guard fails", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("http://localhost/api/admin/skills/" + SKILL_ID, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ isEnabled: true })
      }),
      paramsOf()
    );

    expect(response.status).toBe(403);
    expect(setSkillEnabledMock).not.toHaveBeenCalled();
  });

  it("returns 500 when service throws", async () => {
    getSkillMock.mockResolvedValue(skillDetail);
    setSkillEnabledMock.mockRejectedValue(new Error("db unavailable"));
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("http://localhost/api/admin/skills/" + SKILL_ID, {
        method : "PATCH",
        headers: { "Content-Type": "application/json" },
        body   : JSON.stringify({ isEnabled: true })
      }),
      paramsOf()
    );

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
  });
});
