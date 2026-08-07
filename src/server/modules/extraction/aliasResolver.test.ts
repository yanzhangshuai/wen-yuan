import { describe, expect, it } from "vitest";
import { mergeAliasGroups } from "./aliasResolver.ts";

describe("mergeAliasGroups", () => {
  it("共享别名合并两组", () => {
    const merged = mergeAliasGroups([
      { entityId: "e1", aliases: ["范进", "范老爷"] },
      { entityId: null, aliases: ["范老爷", "范举人"] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].entityIds).toEqual(["e1"]);
    expect(merged[0].canonical).toBe("范进");
  });

  it("泛称不桥接无关实体", () => {
    const merged = mergeAliasGroups([
      { entityId: "e1", aliases: ["范进", "老爷"] },
      { entityId: "e2", aliases: ["周进", "老爷"] },
    ]);
    // "老爷"是泛称不注册节点 → 两组不合并
    expect(merged).toHaveLength(2);
  });

  it("无共享别名 → 不合并", () => {
    const merged = mergeAliasGroups([
      { entityId: "e1", aliases: ["范进"] },
      { entityId: "e2", aliases: ["周进"] },
    ]);
    expect(merged).toHaveLength(2);
  });
});
