import { describe, expect, it } from "vitest";

import { parseSkillMetadata } from "@/server/modules/skills/content-schema";

/**
 * MD 元数据解析单测：
 * - 解析合法 frontmatter（name/description/relationshipCodes）；
 * - 非法 frontmatter（YAML 语法/非法字段）拒绝；
 * - 无 frontmatter 时用默认值。
 */

describe("parseSkillMetadata", () => {
  it("解析合法 frontmatter 元数据（name/description）", () => {
    const md = `---
name: 科举
description: 科举相关
---

## 指令
- 科举功名作为 title 而非 name。
`;
    const metadata = parseSkillMetadata(md);
    expect(metadata.name).toBe("科举");
    expect(metadata.description).toBe("科举相关");
    expect(metadata.relationshipCodes).toBeNull();
  });

  it("解析关系码契约", () => {
    const md = `---
name: 古典关系类型
relationshipCodes:
  - code: 父子
    direction: INVERSE
    category: 家庭
    aliases: [父与子]
  - code: 兄弟
    direction: SYMMETRIC
    category: 家庭
---
`;
    const metadata = parseSkillMetadata(md);
    expect(metadata.relationshipCodes).toEqual([
      { code: "父子", direction: "INVERSE", category: "家庭", aliases: ["父与子"] },
      { code: "兄弟", direction: "SYMMETRIC", category: "家庭", aliases: [] }
    ]);
  });

  it("frontmatter YAML 语法错误时抛错", () => {
    const md = "---\nname: [unclosed\n---\nbody";
    expect(() => parseSkillMetadata(md)).toThrow();
  });

  it("无 frontmatter 的纯正文使用默认值", () => {
    const metadata = parseSkillMetadata("## 指令\n- 简单指令");
    expect(metadata.name).toBeNull();
    expect(metadata.description).toBeNull();
    expect(metadata.relationshipCodes).toBeNull();
  });

  it("忽略已移除的 kind/triggers/deicticJunk 字段（strip）", () => {
    const md = `---
name: 科举
kind: HYBRID
triggers:
  priority: 999
deicticJunk: [众人]
---
`;
    const metadata = parseSkillMetadata(md);
    expect(metadata.name).toBe("科举");
    expect(metadata).not.toHaveProperty("kind");
    expect(metadata).not.toHaveProperty("triggers");
    expect(metadata).not.toHaveProperty("deicticJunk");
  });
});
