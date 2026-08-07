import { describe, expect, it, vi } from "vitest";

import {
  buildExtractionSchema,
  relationshipCodesFromSnapshot,
  getRelationshipCodesFromSkills,
  type RelationshipCodeSource,
  FACT_TYPES,
  EVENT_CATEGORIES
} from "./schema.ts";

describe("buildExtractionSchema", () => {
  it("含全部 factType + 传入的关系码", () => {
    const schema = buildExtractionSchema([
      { code: "父子", direction: "INVERSE", category: "家庭" },
      { code: "座师", direction: "INVERSE", category: "等级" }
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
      null
    ]);
    expect(codes).toHaveLength(1);
    expect(codes[0].code).toBe("父子");
  });

  it("非数组 → 空", () => {
    expect(relationshipCodesFromSnapshot(null)).toEqual([]);
  });
});

describe("getRelationshipCodesFromSkills", () => {
  /** 契约来源（direction 收紧为字面量，避免推断为 string）。 */
  function source(codes: Array<{ code: string; direction: "INVERSE" | "SYMMETRIC"; category: string }>): RelationshipCodeSource {
    return { metadata: { relationshipCodes: codes } };
  }

  it("并集各 skill 契约码，去重按 code（先到先得），丢弃 aliases", () => {
    const skills = [
      source([{ code: "父子", direction: "INVERSE", category: "家庭" }]),
      source([{ code: "父子", direction: "INVERSE", category: "家庭" }, { code: "兄弟", direction: "SYMMETRIC", category: "家庭" }])
    ];
    expect(getRelationshipCodesFromSkills(skills)).toEqual([
      { code: "父子", direction: "INVERSE", category: "家庭" },
      { code: "兄弟", direction: "SYMMETRIC", category: "家庭" }
    ]);
  });

  it("relationshipCodes 为 null/缺失时跳过", () => {
    expect(getRelationshipCodesFromSkills([{ metadata: { relationshipCodes: null } }, { metadata: {} }])).toEqual([]);
  });
});

