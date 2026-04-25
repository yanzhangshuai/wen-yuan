import { describe, expect, it } from "vitest";

import { type StageAMention } from "@/server/modules/analysis/pipelines/threestage/stageA/types";

import { filterGenericMentions, isGenericMention } from "./genericTermFilter";

function mk(surfaceForm: string, aliasType: StageAMention["aliasType"] = "UNSURE"): StageAMention {
  return {
    surfaceForm,
    aliasType,
    identityClaim        : "SELF",
    narrativeRegionType  : "NARRATIVE",
    suspectedResolvesTo  : null,
    evidenceRawSpan      : surfaceForm,
    actionVerb           : null,
    confidence           : 0.8,
    spanStart            : null,
    spanEnd              : null,
    regionOverrideApplied: null
  };
}

describe("genericTermFilter", () => {
  describe("isGenericMention", () => {
    it("命中纯亲属称谓（母亲/儿/娘）→ true", () => {
      expect(isGenericMention(mk("母亲"))).toBe(true);
      expect(isGenericMention(mk("儿"))).toBe(true);
      expect(isGenericMention(mk("娘"))).toBe(true);
    });

    it("命中役使 / 出家泛称（道士/虔婆/小厮/贵人）→ true", () => {
      expect(isGenericMention(mk("道士"))).toBe(true);
      expect(isGenericMention(mk("虔婆"))).toBe(true);
      expect(isGenericMention(mk("小厮"))).toBe(true);
      expect(isGenericMention(mk("贵人"))).toBe(true);
    });

    it("代词前缀 + 称谓（他母亲/你相公/令叔祖）→ true", () => {
      expect(isGenericMention(mk("他母亲"))).toBe(true);
      expect(isGenericMention(mk("你相公"))).toBe(true);
      expect(isGenericMention(mk("令叔祖"))).toBe(true);
      expect(isGenericMention(mk("他老人家"))).toBe(true);
    });

    it("aliasType=NAMED 一律保留（避免误伤『道明』『王老爷』等）", () => {
      expect(isGenericMention(mk("道士", "NAMED"))).toBe(false);
      expect(isGenericMention(mk("母亲", "NAMED"))).toBe(false);
      expect(isGenericMention(mk("他母亲", "NAMED"))).toBe(false);
    });

    it("真实姓名不被误伤（牛浦/王冕/陈木南）", () => {
      expect(isGenericMention(mk("牛浦", "NAMED"))).toBe(false);
      expect(isGenericMention(mk("王冕", "NAMED"))).toBe(false);
      expect(isGenericMention(mk("陈木南", "NAMED"))).toBe(false);
    });

    it("非泛称非代词（陈木南/金修义）→ 即便非 NAMED 也保留", () => {
      // 实际生产中这些常被 LLM 标 NAMED；此处验证若 hint 缺失也不被本规则误删
      expect(isGenericMention(mk("陈木南"))).toBe(false);
      expect(isGenericMention(mk("金修义"))).toBe(false);
    });

    it("空 surfaceForm → true（防御）", () => {
      expect(isGenericMention(mk(""))).toBe(true);
    });
  });

  describe("filterGenericMentions", () => {
    it("批量分流", () => {
      const res = filterGenericMentions([
        mk("牛浦", "NAMED"),
        mk("母亲"),
        mk("他母亲"),
        mk("王冕", "NAMED"),
        mk("道士")
      ]);
      expect(res.kept.map((m) => m.surfaceForm)).toEqual(["牛浦", "王冕"]);
      expect(res.dropped.map((m) => m.surfaceForm)).toEqual(["母亲", "他母亲", "道士"]);
    });
  });
});
