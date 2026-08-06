import { describe, expect, it } from "vitest";

import { parseSkillMetadata, serializeSkillFrontmatter } from "@/server/modules/skills/content-schema";

/**
 * MD 元数据解析单测：
 * - 解析合法 frontmatter（kind/triggers）；
 * - 非法 frontmatter（YAML 语法/非法字段）拒绝；
 * - 无 frontmatter 时用默认值；
 * - serialize → parse 往返一致。
 */

const VALID_MD = `---
kind: HYBRID
triggers:
  bookTypeKeys: [keju-novel]
  taskTypes: [CHAPTER_ANALYSIS]
  priority: 100
---

## 指令
- 科举功名作为 title 而非 name。
`;

describe("parseSkillMetadata", () => {
  it("解析合法 frontmatter 元数据", () => {
    const metadata = parseSkillMetadata(VALID_MD);
    expect(metadata.kind).toBe("HYBRID");
    expect(metadata.triggers.priority).toBe(100);
    expect(metadata.triggers.bookTypeKeys).toEqual(["keju-novel"]);
    expect(metadata.triggers.taskTypes).toEqual(["CHAPTER_ANALYSIS"]);
  });

  it("frontmatter YAML 语法错误时抛错", () => {
    const md = "---\nkind: [unclosed\n---\nbody";
    expect(() => parseSkillMetadata(md)).toThrow();
  });

  it("无 frontmatter 的纯正文使用默认值", () => {
    const metadata = parseSkillMetadata("## 指令\n- 简单指令");
    expect(metadata.kind).toBe("HYBRID");
    expect(metadata.triggers.priority).toBe(0);
  });

  it("serialize → parse 往返一致", () => {
    const md = serializeSkillFrontmatter({ kind: "RELATIONSHIP_TYPE", triggers: { priority: 996 } });
    const metadata = parseSkillMetadata(md);
    expect(metadata.kind).toBe("RELATIONSHIP_TYPE");
    expect(metadata.triggers.priority).toBe(996);
  });
});
