/**
 * 文件定位（Next.js Route Handler 单测）：
 * - 本文件对应 `src/app/api/admin/skills/route.ts`，验证技能包列表接口契约。
 * - 管理端维护每个 skill 的独立启停开关；列表含 isEnabled 与激活版本号。
 *
 * 业务职责：
 * - 约束鉴权、服务层调用参数与统一响应包结构。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const listSkillsMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/skills", () => ({
  skillService: {
    listSkills: listSkillsMock
  }
}));

describe("GET /api/admin/skills", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    listSkillsMock.mockReset();
    vi.resetModules();
  });

  it("returns skill list with 200", async () => {
    listSkillsMock.mockResolvedValue([
      {
        id         : "skill-1",
        slug       : "keju",
        name       : "科举",
        description: null,
        scope      : "GLOBAL",
        status     : "ACTIVE",
        source     : "MANUAL",
        isBuiltin  : true,
        isEnabled  : true,
        versionNo  : 3,
        createdAt  : "2026-08-06T00:00:00.000Z",
        updatedAt  : "2026-08-06T00:00:00.000Z"
      }
    ]);
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_SKILLS_LISTED");
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0]?.slug).toBe("keju");
    expect(payload.data[0]?.isEnabled).toBe(true);
  });

  it("returns 403 when auth guard fails", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(listSkillsMock).not.toHaveBeenCalled();
  });

  it("returns 500 when service throws", async () => {
    listSkillsMock.mockRejectedValue(new Error("db unavailable"));
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
  });
});
