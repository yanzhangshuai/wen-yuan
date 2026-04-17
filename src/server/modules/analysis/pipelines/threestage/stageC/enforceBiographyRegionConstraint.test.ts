/**
 * 被测对象：Stage C `enforceBiographyRegionConstraint` 规则层（§0-5 + §0-1 REV-1）。
 * 测试目标：
 *   - POEM 区段 biography → narrativeLens 强制 HISTORICAL（≥ 3 用例）
 *   - COMMENTARY → REPORTED（≥ 3 用例）
 *   - DIALOGUE 引号内第三方 → QUOTED（≥ 3 用例）
 *   - DIALOGUE 引入句主语 → 保留 SELF（REV-1，≥ 3 用例）
 *   - NARRATIVE 不覆写（≥ 3 用例）
 *   - locateRawSpanOffset 边界（空 / 未命中）
 *   - isEffectiveBiography §0-6 四条件
 */

import { describe, expect, it } from "vitest";

import {
  BIOGRAPHY_REGION_OVERRIDE_RULES,
  enforceBiographyRegionConstraint,
  isEffectiveBiography,
  locateRawSpanOffset
} from "@/server/modules/analysis/pipelines/threestage/stageC/enforceBiographyRegionConstraint";
import type {
  PreprocessRegion,
  RegionType
} from "@/server/modules/analysis/preprocessor/types";

function region(type: RegionType, start: number, end: number, extra?: Partial<PreprocessRegion>): PreprocessRegion {
  return { type, start, end, text: "", ...extra };
}

// ── locateRawSpanOffset ─────────────────────────────────────────────────

describe("locateRawSpanOffset", () => {
  it("rawSpan 命中 → 返回偏移区间", () => {
    const text = "前置占位王冕入京赴考尾巴";
    const out = locateRawSpanOffset(text, "王冕入京赴考");
    expect(out.start).toBe(text.indexOf("王冕入京赴考"));
    expect(out.end).toBe(out.start! + "王冕入京赴考".length);
  });

  it("rawSpan 空串 → null", () => {
    const out = locateRawSpanOffset("任意文本", "");
    expect(out).toEqual({ start: null, end: null });
  });

  it("rawSpan 不在原文 → null", () => {
    const out = locateRawSpanOffset("王冕读书", "李四赴任");
    expect(out).toEqual({ start: null, end: null });
  });
});

// ── POEM ───────────────────────────────────────────────────────────────

describe("enforceBiographyRegionConstraint / POEM", () => {
  const chapterText = "开篇一段引子有诗为证黄河之水天东流结束";
  const regions = [
    region("POEM", 8, 16) // “黄河之水天东流”所处区段
  ];

  it("POEM 区段 SELF → HISTORICAL", () => {
    const out = enforceBiographyRegionConstraint({
      personaCanonicalName: "李白",
      narrativeLens       : "SELF",
      narrativeRegionType : "NARRATIVE",
      rawSpan             : "黄河之水天东流",
      chapterText,
      regions
    });
    expect(out.narrativeLens).toBe("HISTORICAL");
    expect(out.regionOverrideApplied).toBe(BIOGRAPHY_REGION_OVERRIDE_RULES.POEM_FORCE_HISTORICAL);
    expect(out.narrativeRegionType).toBe("POEM");
  });

  it("POEM 区段 IMPERSONATING → HISTORICAL", () => {
    const out = enforceBiographyRegionConstraint({
      personaCanonicalName: "李白",
      narrativeLens       : "IMPERSONATING",
      narrativeRegionType : "NARRATIVE",
      rawSpan             : "黄河之水天东流",
      chapterText,
      regions
    });
    expect(out.narrativeLens).toBe("HISTORICAL");
    expect(out.regionOverrideApplied).toBe(BIOGRAPHY_REGION_OVERRIDE_RULES.POEM_FORCE_HISTORICAL);
  });

  it("POEM 区段 QUOTED → HISTORICAL", () => {
    const out = enforceBiographyRegionConstraint({
      personaCanonicalName: "李白",
      narrativeLens       : "QUOTED",
      narrativeRegionType : "NARRATIVE",
      rawSpan             : "黄河之水天东流",
      chapterText,
      regions
    });
    expect(out.narrativeLens).toBe("HISTORICAL");
  });

  it("POEM 区段已是 HISTORICAL → 不触发 override", () => {
    const out = enforceBiographyRegionConstraint({
      personaCanonicalName: "李白",
      narrativeLens       : "HISTORICAL",
      narrativeRegionType : "POEM",
      rawSpan             : "黄河之水天东流",
      chapterText,
      regions
    });
    expect(out.narrativeLens).toBe("HISTORICAL");
    expect(out.regionOverrideApplied).toBeNull();
  });
});

// ── COMMENTARY ─────────────────────────────────────────────────────────

describe("enforceBiographyRegionConstraint / COMMENTARY", () => {
  const chapterText = "却说当年范进中举轰动乡里众人皆惊结束段";
  const regions = [region("COMMENTARY", 0, 20)];

  it("COMMENTARY SELF → REPORTED", () => {
    const out = enforceBiographyRegionConstraint({
      personaCanonicalName: "范进",
      narrativeLens       : "SELF",
      narrativeRegionType : "NARRATIVE",
      rawSpan             : "当年范进中举轰动乡里",
      chapterText,
      regions
    });
    expect(out.narrativeLens).toBe("REPORTED");
    expect(out.regionOverrideApplied).toBe(BIOGRAPHY_REGION_OVERRIDE_RULES.COMMENTARY_FORCE_REPORTED);
  });

  it("COMMENTARY IMPERSONATING → REPORTED", () => {
    const out = enforceBiographyRegionConstraint({
      personaCanonicalName: "范进",
      narrativeLens       : "IMPERSONATING",
      narrativeRegionType : "NARRATIVE",
      rawSpan             : "当年范进中举轰动乡里",
      chapterText,
      regions
    });
    expect(out.narrativeLens).toBe("REPORTED");
  });

  it("COMMENTARY QUOTED → REPORTED", () => {
    const out = enforceBiographyRegionConstraint({
      personaCanonicalName: "范进",
      narrativeLens       : "QUOTED",
      narrativeRegionType : "NARRATIVE",
      rawSpan             : "当年范进中举轰动乡里",
      chapterText,
      regions
    });
    expect(out.narrativeLens).toBe("REPORTED");
  });
});

// ── DIALOGUE 引号内第三方 → QUOTED ──────────────────────────────────────

describe("enforceBiographyRegionConstraint / DIALOGUE 第三方", () => {
  const chapterText = "王冕道：“范进中举后发了疯。”接着";
  // region.speaker="王冕" 的 speakerStart/End 指向开头；其后是引号内文本
  const regions: PreprocessRegion[] = [
    {
      type        : "DIALOGUE",
      start       : 0,
      end         : 18,
      text        : "",
      speaker     : "王冕",
      speakerStart: 0,
      speakerEnd  : 2
    }
  ];

  it("引号内第三方（范进）SELF → QUOTED", () => {
    const out = enforceBiographyRegionConstraint({
      personaCanonicalName: "范进",
      narrativeLens       : "SELF",
      narrativeRegionType : "NARRATIVE",
      rawSpan             : "范进中举后发了疯",
      chapterText,
      regions
    });
    expect(out.narrativeLens).toBe("QUOTED");
    expect(out.regionOverrideApplied).toBe(BIOGRAPHY_REGION_OVERRIDE_RULES.DIALOGUE_QUOTED_THIRD_PARTY);
    expect(out.narrativeRegionType).toBe("DIALOGUE");
  });

  it("引号内第三方 IMPERSONATING → QUOTED", () => {
    const out = enforceBiographyRegionConstraint({
      personaCanonicalName: "范进",
      narrativeLens       : "IMPERSONATING",
      narrativeRegionType : "NARRATIVE",
      rawSpan             : "范进中举后发了疯",
      chapterText,
      regions
    });
    expect(out.narrativeLens).toBe("QUOTED");
  });

  it("引号内第三方已 QUOTED → 保持且不命中 override", () => {
    const out = enforceBiographyRegionConstraint({
      personaCanonicalName: "范进",
      narrativeLens       : "QUOTED",
      narrativeRegionType : "DIALOGUE",
      rawSpan             : "范进中举后发了疯",
      chapterText,
      regions
    });
    expect(out.narrativeLens).toBe("QUOTED");
    expect(out.regionOverrideApplied).toBeNull();
  });
});

// ── DIALOGUE 引入句主语（REV-1）→ 保留 SELF ────────────────────────────

describe("enforceBiographyRegionConstraint / DIALOGUE 引入句主语 REV-1", () => {
  const chapterText = "王冕道：“我今日要进京赴考。”众人";
  const regions: PreprocessRegion[] = [
    {
      type        : "DIALOGUE",
      start       : 0,
      end         : 18,
      text        : "",
      speaker     : "王冕",
      speakerStart: 0,
      speakerEnd  : 2
    }
  ];

  it("引入句主语 SELF 保留 + 打审计标", () => {
    const out = enforceBiographyRegionConstraint({
      personaCanonicalName: "王冕",
      narrativeLens       : "SELF",
      narrativeRegionType : "NARRATIVE",
      rawSpan             : "王冕道",
      chapterText,
      regions
    });
    expect(out.narrativeLens).toBe("SELF");
    expect(out.regionOverrideApplied).toBe(BIOGRAPHY_REGION_OVERRIDE_RULES.DIALOGUE_SELF_PRESERVED);
  });

  it("引入句主语 IMPERSONATING 也保留（REV-1 豁免）", () => {
    const out = enforceBiographyRegionConstraint({
      personaCanonicalName: "王冕",
      narrativeLens       : "IMPERSONATING",
      narrativeRegionType : "NARRATIVE",
      rawSpan             : "王冕道",
      chapterText,
      regions
    });
    expect(out.narrativeLens).toBe("IMPERSONATING");
    expect(out.regionOverrideApplied).toBe(BIOGRAPHY_REGION_OVERRIDE_RULES.DIALOGUE_SELF_PRESERVED);
  });

  it("speaker 与 personaCanonicalName 不匹配 → 不视作引入句（按第三方处理）", () => {
    const out = enforceBiographyRegionConstraint({
      personaCanonicalName: "张三",
      narrativeLens       : "SELF",
      narrativeRegionType : "NARRATIVE",
      rawSpan             : "王冕道",
      chapterText,
      regions
    });
    expect(out.narrativeLens).toBe("QUOTED");
    expect(out.regionOverrideApplied).toBe(BIOGRAPHY_REGION_OVERRIDE_RULES.DIALOGUE_QUOTED_THIRD_PARTY);
  });
});

// ── NARRATIVE 不覆写 ───────────────────────────────────────────────────

describe("enforceBiographyRegionConstraint / NARRATIVE", () => {
  const chapterText = "王冕到了京城应试顺利中榜衣锦还乡";
  const regions = [region("NARRATIVE", 0, chapterText.length)];

  it("NARRATIVE SELF 不改写", () => {
    const out = enforceBiographyRegionConstraint({
      personaCanonicalName: "王冕",
      narrativeLens       : "SELF",
      narrativeRegionType : "NARRATIVE",
      rawSpan             : "王冕到了京城应试",
      chapterText,
      regions
    });
    expect(out.narrativeLens).toBe("SELF");
    expect(out.regionOverrideApplied).toBeNull();
  });

  it("NARRATIVE IMPERSONATING 不改写", () => {
    const out = enforceBiographyRegionConstraint({
      personaCanonicalName: "牛浦",
      narrativeLens       : "IMPERSONATING",
      narrativeRegionType : "NARRATIVE",
      rawSpan             : "王冕到了京城应试",
      chapterText,
      regions
    });
    expect(out.narrativeLens).toBe("IMPERSONATING");
    expect(out.regionOverrideApplied).toBeNull();
  });

  it("rawSpan 无法定位 → 回退 LLM 自评 regionType（保持 NARRATIVE）", () => {
    const out = enforceBiographyRegionConstraint({
      personaCanonicalName: "王冕",
      narrativeLens       : "SELF",
      narrativeRegionType : "NARRATIVE",
      rawSpan             : "彻底不在原文里",
      chapterText,
      regions
    });
    expect(out.narrativeLens).toBe("SELF");
    expect(out.narrativeRegionType).toBe("NARRATIVE");
    expect(out.spanStart).toBeNull();
  });
});

// ── §0-6 四条件 ────────────────────────────────────────────────────────

describe("isEffectiveBiography §0-6 四条件", () => {
  const baseEffective = {
    narrativeLens      : "SELF" as const,
    narrativeRegionType: "NARRATIVE" as const,
    rawSpan            : "王冕到了京城应试顺利中榜衣锦还乡", // 16 字 ≥ 15
    actionVerb         : "赴考"
  };

  it("四条件全满足 → true", () => {
    expect(isEffectiveBiography(baseEffective)).toBe(true);
  });

  it("narrativeLens=QUOTED → false", () => {
    expect(isEffectiveBiography({ ...baseEffective, narrativeLens: "QUOTED" })).toBe(false);
  });

  it("narrativeLens=REPORTED → false", () => {
    expect(isEffectiveBiography({ ...baseEffective, narrativeLens: "REPORTED" })).toBe(false);
  });

  it("narrativeLens=HISTORICAL → false", () => {
    expect(isEffectiveBiography({ ...baseEffective, narrativeLens: "HISTORICAL" })).toBe(false);
  });

  it("regionType=POEM → false", () => {
    expect(isEffectiveBiography({ ...baseEffective, narrativeRegionType: "POEM" })).toBe(false);
  });

  it("rawSpan < 15 → false", () => {
    expect(isEffectiveBiography({ ...baseEffective, rawSpan: "王冕中榜" })).toBe(false);
  });

  it("actionVerb 为 null → false", () => {
    expect(isEffectiveBiography({ ...baseEffective, actionVerb: null })).toBe(false);
  });

  it("actionVerb 空串 → false", () => {
    expect(isEffectiveBiography({ ...baseEffective, actionVerb: "   " })).toBe(false);
  });

  it("IMPERSONATING + 其它满足 → true", () => {
    expect(
      isEffectiveBiography({ ...baseEffective, narrativeLens: "IMPERSONATING" })
    ).toBe(true);
  });
});
