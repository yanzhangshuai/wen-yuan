import { describe, expect, it } from "vitest";
import { isNameInText, runGuardrails } from "./guardrails.ts";
import type { ExtractionSlice } from "./types.ts";

const sliceText = "范进中举后高兴疯了，周学道拔范进中了秀才。";

function makeSlice(overrides: Partial<ExtractionSlice> = {}): ExtractionSlice {
  return {
    book      : "儒林外史",
    chapterNos: [3],
    entities  : [
      { canonical: "范进", type: "PERSON", aliases: ["范老爷"] },
      { canonical: "周进", type: "PERSON", aliases: ["周学道"] }
    ],
    relations          : [],
    bioFacts           : [],
    newEntityCandidates: [],
    ...overrides
  };
}

describe("normalizeForMatch / isNameInText", () => {
  it("归一化子串匹配", () => {
    expect(isNameInText("范进", "　范进 中举")).toBe(true);
    expect(isNameInText("范进", "周进")).toBe(false);
  });
});

describe("runGuardrails", () => {
  const validCodes = new Set(["师生", "父子"]);

  it("证据锚定：名字不在正文 → 丢弃", () => {
    const slice = makeSlice({
      relations: [{ typeCode: "师生", sourceCanonical: "范进", targetCanonical: "诸葛亮", evidence: "x" }]
    });
    const { facts, dropRecords } = runGuardrails(slice, sliceText, validCodes);
    expect(facts).toHaveLength(0);
    expect(dropRecords[0].reason).toBe("name_not_in_text");
  });

  it("关系码校验：非法码 → 丢弃", () => {
    const slice = makeSlice({
      relations: [{ typeCode: "不存在码", sourceCanonical: "范进", targetCanonical: "周进", evidence: "x" }]
    });
    const { facts, dropRecords } = runGuardrails(slice, sliceText, validCodes);
    expect(facts).toHaveLength(0);
    expect(dropRecords[0].reason).toBe("invalid_code");
  });

  it("通过的关系 → 生成 RELATION 事实", () => {
    const slice = makeSlice({
      relations: [{ typeCode: "师生", sourceCanonical: "范进", targetCanonical: "周进", evidence: "周学道拔范进中了秀才" }]
    });
    const { facts } = runGuardrails(slice, sliceText, validCodes);
    expect(facts).toHaveLength(1);
    expect(facts[0].factType).toBe("RELATION");
    expect(facts[0].relationshipTypeCode).toBe("师生");
  });

  it("纯指代实体 → 丢弃（极简兜底）", () => {
    const slice = makeSlice({
      relations: [{ typeCode: "师生", sourceCanonical: "那人", targetCanonical: "周进", evidence: "x" }]
    });
    const { facts, dropRecords } = runGuardrails(slice, sliceText, validCodes);
    expect(facts).toHaveLength(0);
    expect(dropRecords[0].reason).toBe("deictic_junk");
  });

  it("称谓（老爷）不再被规则拦截——交给模型判断", () => {
    const slice = makeSlice({
      relations: [{ typeCode: "师生", sourceCanonical: "范老爷", targetCanonical: "周进", evidence: "周学道拔范进中了秀才" }]
    });
    const { facts } = runGuardrails(slice, sliceText, validCodes);
    expect(facts).toHaveLength(1); // 称谓式名字通过护栏（模型判断实体性）
  });

  it("无证据 → 丢弃", () => {
    const slice = makeSlice({
      relations: [{ typeCode: "师生", sourceCanonical: "范进", targetCanonical: "周进" }]
    });
    const { facts, dropRecords } = runGuardrails(slice, sliceText, validCodes);
    expect(facts).toHaveLength(0);
    expect(dropRecords[0].reason).toBe("no_evidence");
  });

  it("传记事实：subject 锚定 + category 保留", () => {
    const slice = makeSlice({
      bioFacts: [{ category: "EXAM", subjectCanonical: "范进", summary: "中举", evidence: "范进中举" }]
    });
    const { facts } = runGuardrails(slice, sliceText, validCodes);
    expect(facts).toHaveLength(1);
    expect(facts[0].factType).toBe("BIOGRAPHY");
    expect(facts[0].eventCategory).toBe("EXAM");
  });

  it("传入 junkList 时用它判断虚指（名单外不再拦截）", () => {
    const text = "范进那人中了秀才，周学道拔范进中了。";
    const slice = makeSlice({
      entities: [
        { canonical: "范进", type: "PERSON", aliases: ["范老爷"] },
        { canonical: "周进", type: "PERSON", aliases: ["周学道"] }
      ],
      relations: [{ typeCode: "师生", sourceCanonical: "那人", targetCanonical: "周进", evidence: "范进那人中了秀才" }]
    });
    const { facts } = runGuardrails(slice, text, validCodes, new Set(["某人"]));
    expect(facts).toHaveLength(1);
    expect(facts[0].relationshipTypeCode).toBe("师生");
  });

  it("junkList 含该词 → 按虚指拦截", () => {
    const text = "范进那人中了秀才，周学道拔范进中了。";
    const slice = makeSlice({
      relations: [{ typeCode: "师生", sourceCanonical: "那人", targetCanonical: "周进", evidence: "范进那人中了秀才" }]
    });
    const { facts, dropRecords } = runGuardrails(slice, text, validCodes, new Set(["那人"]));
    expect(facts).toHaveLength(0);
    expect(dropRecords[0].reason).toBe("deictic_junk");
  });
});
