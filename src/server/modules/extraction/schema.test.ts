import { describe, expect, it, vi } from "vitest";
import { buildExtractionSchema, relationshipCodesFromSnapshot, FACT_TYPES, EVENT_CATEGORIES } from "./schema.ts";

describe("buildExtractionSchema", () => {
  it("含全部 factType + 传入的关系码", () => {
    const schema = buildExtractionSchema([
      { code: "父子", direction: "INVERSE", category: "家庭" },
      { code: "座师", direction: "INVERSE", category: "等级" },
    ]);
    expect(schema.factTypes).toEqual([...FACT_TYPES]);
    expect(schema.relationshipTypeCodes).toContain("父子");
    expect(schema.relationshipTypeCodes).toContain("座师");
    expect(schema.eventCategories).toEqual([...EVENT_CATEGORIES]);
    expect(schema.payloadShapes.RELATION).toContain("summary");
  });

  it("空关系码 → 空枚举", () => {
    const schema = buildExtractionSchema([]);
    expect(schema.relationshipTypeCodes).toHaveLength(0);
  });
});

describe("relationshipCodesFromSnapshot", () => {
  it("合法快照恢复", () => {
    const codes = relationshipCodesFromSnapshot([
      { code: "父子", direction: "INVERSE", category: "家庭" },
      { code: "bad", direction: "WEIRD" },
      null,
    ]);
    expect(codes).toHaveLength(1);
    expect(codes[0].code).toBe("父子");
  });

  it("非数组 → 空", () => {
    expect(relationshipCodesFromSnapshot(null)).toEqual([]);
  });
});
