import { describe, expect, it } from "vitest";

import {
  KNOWLEDGE_PACK_SCOPE_OPTIONS,
  getKnowledgePackScopeDescription,
  getKnowledgePackScopeLabel
} from "@/lib/knowledge-presentation";

describe("knowledge-presentation", () => {
  it("exposes BOOK_TYPE scope copy for knowledge packs", () => {
    expect(KNOWLEDGE_PACK_SCOPE_OPTIONS).toContainEqual({
      value      : "BOOK_TYPE",
      label      : "书籍类型通用",
      description: "供同书籍类型的书籍共享使用"
    });
    expect(getKnowledgePackScopeLabel("BOOK_TYPE")).toBe("书籍类型通用");
    expect(getKnowledgePackScopeDescription("BOOK_TYPE")).toBe("供同书籍类型的书籍共享使用");
  });
});
