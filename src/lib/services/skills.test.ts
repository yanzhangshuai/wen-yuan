import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  fetchSkill,
  fetchSkills,
  updateSkillContent,
  updateSkillInfo,
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
  scope      : "GLOBAL",
  status     : "ENABLED",
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
    expect(result[0]?.status).toBe("ENABLED");
  });

  it("fetchSkill 请求详情端点（含 content 与契约）", async () => {
    hoisted.clientFetchMock.mockResolvedValue({
      ...listItem,
      content : "---\nkind: HYBRID\n---\n\n正文",
      contract: {
        relationshipCodes: [{ code: "父子", direction: "INVERSE", category: "血缘", aliases: [] }],
        deicticJunk      : []
      }
    });

    const result = await fetchSkill("skill-1");

    expect(hoisted.clientFetchMock).toHaveBeenCalledWith("/api/admin/skills/skill-1", { cache: "no-store" });
    expect(result.content).toContain("正文");
    expect(result.contract.relationshipCodes[0]?.code).toBe("父子");
  });

  it("updateSkillInfo 更新基本信息", async () => {
    await updateSkillInfo("skill-1", { name: "科举考试", status: "DISABLED" });

    expect(hoisted.clientMutateMock).toHaveBeenCalledWith("/api/admin/skills/skill-1", {
      method : "PATCH",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ name: "科举考试", status: "DISABLED" })
    });
  });

  it("updateSkillContent 保存内容", async () => {
    hoisted.clientFetchMock.mockResolvedValue({ updatedAt: "2026-08-06T00:00:00.000Z" });

    const result = await updateSkillContent("skill-1", { content: "---\nkind: HYBRID\n---\n\n正文" });

    expect(hoisted.clientFetchMock).toHaveBeenCalledWith("/api/admin/skills/skill-1/content", {
      method : "PUT",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ content: "---\nkind: HYBRID\n---\n\n正文" })
    });
    expect(result.updatedAt).toBe("2026-08-06T00:00:00.000Z");
  });
});
