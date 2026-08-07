import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchSkill,
  fetchSkills,
  updateSkillEnabled,
  type AdminSkillListItem
} from "@/lib/services/skills";

const hoisted = vi.hoisted(() => ({
  clientFetchMock : vi.fn(),
  clientMutateMock: vi.fn()
}));

vi.mock("@/lib/client-api", () => ({
  clientFetch : hoisted.clientFetchMock,
  clientMutate: hoisted.clientMutateMock
}));

const listItem: AdminSkillListItem = {
  id         : "skill-1",
  slug       : "keju",
  name       : "科举",
  description: null,
  category   : "HYBRID",
  scope      : "GLOBAL",
  status     : "ACTIVE",
  source     : "MANUAL",
  sortOrder  : 0,
  isBuiltin  : true,
  isEnabled  : true,
  versionNo  : 3,
  createdAt  : "2026-08-06T00:00:00.000Z",
  updatedAt  : "2026-08-06T00:00:00.000Z"
};

describe("skills client service", () => {
  beforeEach(() => {
    hoisted.clientFetchMock.mockReset();
    hoisted.clientMutateMock.mockReset();
  });

  it("fetchSkills 请求列表端点", async () => {
    hoisted.clientFetchMock.mockResolvedValue([listItem]);

    const result = await fetchSkills();

    expect(hoisted.clientFetchMock).toHaveBeenCalledWith("/api/admin/skills", { cache: "no-store" });
    expect(result).toHaveLength(1);
    expect(result[0]?.isEnabled).toBe(true);
  });

  it("fetchSkill 请求详情端点", async () => {
    hoisted.clientFetchMock.mockResolvedValue({
      ...listItem,
      versions: [],
      contract: {
        versionNo        : 3,
        relationshipCodes: [{ code: "父子", direction: "INVERSE", category: "血缘", aliases: [] }],
        deicticJunk      : []
      }
    });

    const result = await fetchSkill("skill-1");

    expect(hoisted.clientFetchMock).toHaveBeenCalledWith("/api/admin/skills/skill-1", { cache: "no-store" });
    expect(result.contract.relationshipCodes[0]?.code).toBe("父子");
  });

  it("updateSkillEnabled 切换启停开关", async () => {
    await updateSkillEnabled("skill-1", false);

    expect(hoisted.clientMutateMock).toHaveBeenCalledWith("/api/admin/skills/skill-1", {
      method : "PATCH",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ isEnabled: false })
    });
  });
});
