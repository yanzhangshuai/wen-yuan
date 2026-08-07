import { describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { lookupRelationshipTypeNames } from "./lookupTypeNames";

/** 构造带 relationshipCodes 契约 frontmatter 的激活版内容。 */
function mdWithCodes(codes: Array<{ code: string; direction: "INVERSE" | "SYMMETRIC"; category: string }>): string {
  const yaml = codes.map((c) => `  - code: ${c.code}\n    direction: ${c.direction}\n    category: ${c.category}`).join("\n");
  return `---
kind: RELATIONSHIP_TYPE
relationshipCodes:
${yaml}
---
正文
`;
}

describe("lookupRelationshipTypeNames", () => {
  it("从 active+enabled skill 契约并集取 code→name，缺名回退 code，去重先到先得", async () => {
    const skillFindMany = vi.fn().mockResolvedValue([
      { versions: [{ content: mdWithCodes([{ code: "父子", direction: "INVERSE", category: "家庭" }]) }] },
      { versions: [{ content: mdWithCodes([{ code: "父子", direction: "INVERSE", category: "家庭" }, { code: "兄弟", direction: "SYMMETRIC", category: "家庭" }]) }] },
      { versions: [{ content: "---\nkind: [unclosed\n---\n" }] }
    ]);
    const client = { skill: { findMany: skillFindMany } } as unknown as PrismaClient;

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const map = await lookupRelationshipTypeNames(["父子", "兄弟", "不存在"], client);

    expect(map.get("父子")).toBe("父子");
    expect(map.get("兄弟")).toBe("兄弟");
    expect(map.get("不存在")).toBeUndefined();
    expect(skillFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "ACTIVE", isEnabled: true, deletedAt: null })
      })
    );
    warnSpy.mockRestore();
  });

  it("空 codes → 空 Map，不查询", async () => {
    const skillFindMany = vi.fn();
    const client = { skill: { findMany: skillFindMany } } as unknown as PrismaClient;

    const map = await lookupRelationshipTypeNames([], client);
    expect(map.size).toBe(0);
    expect(skillFindMany).not.toHaveBeenCalled();
  });

  it("无激活版或契约空 → 只返回命中项", async () => {
    const skillFindMany = vi.fn().mockResolvedValue([
      { versions: [] },
      { versions: [{ content: "---\nkind: GENERIC\n---\n无关系码契约\n" }] }
    ]);
    const client = { skill: { findMany: skillFindMany } } as unknown as PrismaClient;

    const map = await lookupRelationshipTypeNames(["父子"], client);
    expect(map.get("父子")).toBeUndefined();
  });
});
