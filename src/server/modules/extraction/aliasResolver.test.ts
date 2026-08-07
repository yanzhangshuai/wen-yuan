import { describe, expect, it } from "vitest";
import { mergeAliasGroups } from "./aliasResolver.ts";

describe("mergeAliasGroups", () => {
  it("共享别名合并两组，canonical 取模型提供值", () => {
    const merged = mergeAliasGroups([
      { entityId: "e1", canonical: "范进", aliases: ["范进", "范老爷"] },
      { entityId: null, aliases: ["范老爷", "范举人"] }
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].entityIds).toEqual(["e1"]);
    expect(merged[0].canonical).toBe("范进");
  });

  it("纯指代不桥接无关实体", () => {
    const merged = mergeAliasGroups([
      { entityId: "e1", aliases: ["范进", "那人"] },
      { entityId: "e2", aliases: ["周进", "那人"] }
    ]);
    // "那人"是纯指代不注册节点 → 两组不合并
    expect(merged).toHaveLength(2);
  });

  it("canonical 取高频别名（模型输出常用名）", () => {
    const merged = mergeAliasGroups([
      { entityId: "e1", aliases: ["范进", "范进", "范老爷"] },
      { entityId: null, aliases: ["范老爷", "范举人"] }
    ]);
    expect(merged[0].canonical).toBe("范进");
  });

  it("无共享别名 → 不合并", () => {
    const merged = mergeAliasGroups([
      { entityId: "e1", aliases: ["范进"] },
      { entityId: "e2", aliases: ["周进"] }
    ]);
    expect(merged).toHaveLength(2);
  });
});
