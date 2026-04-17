/**
 * 被测对象：Stage A `enforceRegionOverride` 规则层（§0-5 + §0-1 REV-1）。
 * 测试目标：
 *   - POEM → 强制 HISTORICAL（≥ 3 用例）
 *   - COMMENTARY → 强制 REPORTED（≥ 3 用例）
 *   - DIALOGUE 引号内第三方 → 强制 QUOTED（≥ 5 用例）
 *   - DIALOGUE 引入句主语 → 保留 SELF（≥ 5 用例，REV-1）
 *   - NARRATIVE 不覆写（≥ 3 用例）
 *   - spanStart/End 定位边界
 *   - region 回退：LLM 自评 vs 权威 regionMap
 */

import { describe, expect, it } from "vitest";

import {
  enforceRegionOverride,
  locateMentionOffset,
  REGION_OVERRIDE_RULES
} from "@/server/modules/analysis/pipelines/threestage/stageA/enforceRegionOverride";
import type {
  PreprocessRegion,
  RegionType
} from "@/server/modules/analysis/preprocessor/types";
import type { StageARawMention } from "@/server/modules/analysis/pipelines/threestage/stageA/types";

// ── Fixtures ────────────────────────────────────────────────────────────

function mention(overrides: Partial<StageARawMention>): StageARawMention {
  return {
    surfaceForm        : "王冕",
    aliasType          : "NAMED",
    identityClaim      : "SELF",
    narrativeRegionType: "NARRATIVE",
    suspectedResolvesTo: null,
    evidenceRawSpan    : "",
    actionVerb         : null,
    confidence         : 0.9,
    ...overrides
  };
}

function region(type: RegionType, start: number, end: number, extra?: Partial<PreprocessRegion>): PreprocessRegion {
  return { type, start, end, text: "", ...extra };
}

// ── locateMentionOffset ─────────────────────────────────────────────────

describe("locateMentionOffset", () => {
  it("rawSpan 与 surfaceForm 均命中 → 返回 rawSpan 内偏移", () => {
    const text = "前置占位此时王冕走进庭院尾巴";
    const out = locateMentionOffset(text, {
      surfaceForm    : "王冕",
      evidenceRawSpan: "王冕走进庭院"
    });
    expect(out.start).toBe(text.indexOf("王冕"));
    expect(out.end).toBe(out.start! + 2);
  });

  it("rawSpan 命中但内部 surfaceForm 不在 → 回退到 rawSpan 起点", () => {
    const text = "序言段落王冕后面";
    const out = locateMentionOffset(text, {
      surfaceForm    : "张三",
      evidenceRawSpan: "序言段落"
    });
    expect(out.start).toBe(0);
    expect(out.end).toBe(2);
  });

  it("rawSpan 不在原文 → 兜底找 surfaceForm", () => {
    const text = "某某王冕读书";
    const out = locateMentionOffset(text, {
      surfaceForm    : "王冕",
      evidenceRawSpan: "原文未出现段"
    });
    expect(out.start).toBe(2);
    expect(out.end).toBe(4);
  });

  it("完全找不到 → null/null", () => {
    const out = locateMentionOffset("abc", {
      surfaceForm    : "王冕",
      evidenceRawSpan: "未在原文"
    });
    expect(out.start).toBeNull();
    expect(out.end).toBeNull();
  });

  it("surfaceForm 空串 → null/null", () => {
    const out = locateMentionOffset("王冕", {
      surfaceForm    : "",
      evidenceRawSpan: "王冕"
    });
    expect(out.start).toBeNull();
  });
});

// ── POEM 覆写 ────────────────────────────────────────────────────────────

describe("enforceRegionOverride · POEM", () => {
  // "有诗为证：王冕诗中人。此诗道尽世态。" 王冕 at idx 5
  const text = "有诗为证：王冕诗中人。此诗道尽世态。";
  const poemRegion = region("POEM", 0, text.length);

  it("POEM 内 SELF → 强制 HISTORICAL", () => {
    const out = enforceRegionOverride(
      mention({ identityClaim: "SELF", evidenceRawSpan: "王冕诗中人" }),
      text,
      [poemRegion]
    );
    expect(out.identityClaim).toBe("HISTORICAL");
    expect(out.narrativeRegionType).toBe("POEM");
    expect(out.regionOverrideApplied).toBe(REGION_OVERRIDE_RULES.POEM_FORCE_HISTORICAL);
  });

  it("POEM 内 REPORTED → 也被覆盖为 HISTORICAL", () => {
    const out = enforceRegionOverride(
      mention({ identityClaim: "REPORTED", evidenceRawSpan: "王冕诗中人" }),
      text,
      [poemRegion]
    );
    expect(out.identityClaim).toBe("HISTORICAL");
    expect(out.regionOverrideApplied).toBe(REGION_OVERRIDE_RULES.POEM_FORCE_HISTORICAL);
  });

  it("POEM 内 UNSURE → 强制 HISTORICAL", () => {
    const out = enforceRegionOverride(
      mention({ identityClaim: "UNSURE", evidenceRawSpan: "王冕诗中人" }),
      text,
      [poemRegion]
    );
    expect(out.identityClaim).toBe("HISTORICAL");
  });

  it("POEM 内 aliasType=NAMED 保持不变（人物引用合法）", () => {
    const out = enforceRegionOverride(
      mention({ aliasType: "NAMED", identityClaim: "SELF", evidenceRawSpan: "王冕诗中人" }),
      text,
      [poemRegion]
    );
    expect(out.aliasType).toBe("NAMED");
    expect(out.identityClaim).toBe("HISTORICAL");
  });

  it("POEM 内已是 HISTORICAL → 不记录 override", () => {
    const out = enforceRegionOverride(
      mention({ identityClaim: "HISTORICAL", evidenceRawSpan: "王冕诗中人" }),
      text,
      [poemRegion]
    );
    expect(out.identityClaim).toBe("HISTORICAL");
    expect(out.regionOverrideApplied).toBeNull();
  });
});

// ── COMMENTARY 覆写 ─────────────────────────────────────────────────────

describe("enforceRegionOverride · COMMENTARY", () => {
  const text = "却说王冕平生好学,邻里皆知。";
  const commentaryRegion = region("COMMENTARY", 0, text.length);

  it("COMMENTARY 内 SELF → 强制 REPORTED", () => {
    const out = enforceRegionOverride(
      mention({ identityClaim: "SELF", evidenceRawSpan: "王冕平生好学" }),
      text,
      [commentaryRegion]
    );
    expect(out.identityClaim).toBe("REPORTED");
    expect(out.narrativeRegionType).toBe("COMMENTARY");
    expect(out.regionOverrideApplied).toBe(REGION_OVERRIDE_RULES.COMMENTARY_FORCE_REPORTED);
  });

  it("COMMENTARY 内 HISTORICAL → 也被覆盖为 REPORTED", () => {
    const out = enforceRegionOverride(
      mention({ identityClaim: "HISTORICAL", evidenceRawSpan: "王冕平生好学" }),
      text,
      [commentaryRegion]
    );
    expect(out.identityClaim).toBe("REPORTED");
  });

  it("COMMENTARY 已是 REPORTED → 不记录 override", () => {
    const out = enforceRegionOverride(
      mention({ identityClaim: "REPORTED", evidenceRawSpan: "王冕平生好学" }),
      text,
      [commentaryRegion]
    );
    expect(out.identityClaim).toBe("REPORTED");
    expect(out.regionOverrideApplied).toBeNull();
  });

  it("COMMENTARY 内 UNSURE → 强制 REPORTED", () => {
    const out = enforceRegionOverride(
      mention({ identityClaim: "UNSURE", evidenceRawSpan: "王冕平生好学" }),
      text,
      [commentaryRegion]
    );
    expect(out.identityClaim).toBe("REPORTED");
  });
});

// ── DIALOGUE · 引号内第三方 ────────────────────────────────────────────

describe("enforceRegionOverride · DIALOGUE 引号内第三方", () => {
  // 原文形如：王冕道："秦老家明日要做寿。" speaker=王冕, 王冕@0-2, "秦老"在引号内
  const text = "王冕道：\u201c秦老家明日要做寿。\u201d";
  // region: DIALOGUE 包含引入句 + 引号内；speakerStart=0 speakerEnd=2
  const dialogueRegion = region("DIALOGUE", 0, text.length, {
    speaker     : "王冕",
    speakerStart: 0,
    speakerEnd  : 2
  });

  it("引号内第三方 mention SELF → 强制 QUOTED", () => {
    const out = enforceRegionOverride(
      mention({ surfaceForm: "秦老", identityClaim: "SELF", evidenceRawSpan: "秦老家明日要做寿" }),
      text,
      [dialogueRegion]
    );
    expect(out.identityClaim).toBe("QUOTED");
    expect(out.narrativeRegionType).toBe("DIALOGUE");
    expect(out.regionOverrideApplied).toBe(REGION_OVERRIDE_RULES.DIALOGUE_QUOTED_THIRD_PARTY);
  });

  it("引号内 UNSURE → 也被强制 QUOTED", () => {
    // UNSURE 在原规则中"非 SELF → 不改"，但我们测其实际行为：保持 UNSURE
    // 注：按契约引号内 UNSURE 由 Stage B 仲裁，Stage A 不强改，只有 SELF 被强制
    const out = enforceRegionOverride(
      mention({ surfaceForm: "秦老", identityClaim: "UNSURE", evidenceRawSpan: "秦老家明日要做寿" }),
      text,
      [dialogueRegion]
    );
    // 保持 UNSURE（非 SELF 不被强制）
    expect(out.identityClaim).toBe("UNSURE");
  });

  it("引号内 IMPERSONATING → 保持不变（非 SELF 不强改）", () => {
    const out = enforceRegionOverride(
      mention({ surfaceForm: "秦老", identityClaim: "IMPERSONATING", evidenceRawSpan: "秦老家明日要做寿" }),
      text,
      [dialogueRegion]
    );
    expect(out.identityClaim).toBe("IMPERSONATING");
  });

  it("引号内 REPORTED → 保持（LLM 已判定转述，合理）", () => {
    const out = enforceRegionOverride(
      mention({ surfaceForm: "秦老", identityClaim: "REPORTED", evidenceRawSpan: "秦老家明日要做寿" }),
      text,
      [dialogueRegion]
    );
    expect(out.identityClaim).toBe("REPORTED");
    expect(out.regionOverrideApplied).toBeNull();
  });

  it("引号内 HISTORICAL（人物引用典故）→ 保持", () => {
    const out = enforceRegionOverride(
      mention({ surfaceForm: "秦老", identityClaim: "HISTORICAL", evidenceRawSpan: "秦老家明日要做寿" }),
      text,
      [dialogueRegion]
    );
    expect(out.identityClaim).toBe("HISTORICAL");
    expect(out.regionOverrideApplied).toBeNull();
  });

  it("DIALOGUE 区段无 speakerStart（preprocessor 未抽到引入句）+ SELF → 仍被强制 QUOTED", () => {
    const regionNoSpeaker = region("DIALOGUE", 0, text.length);
    const out = enforceRegionOverride(
      mention({ surfaceForm: "秦老", identityClaim: "SELF", evidenceRawSpan: "秦老家明日要做寿" }),
      text,
      [regionNoSpeaker]
    );
    expect(out.identityClaim).toBe("QUOTED");
    expect(out.regionOverrideApplied).toBe(REGION_OVERRIDE_RULES.DIALOGUE_QUOTED_THIRD_PARTY);
  });
});

// ── DIALOGUE · 引入句主语保留 SELF（REV-1） ─────────────────────────────

describe("enforceRegionOverride · DIALOGUE 引入句主语（REV-1）", () => {
  // "王冕道："日已晚矣。"" speaker=王冕 offsets 0-2
  const text = "王冕道：\u201c日已晚矣。\u201d";
  const dialogueRegion = region("DIALOGUE", 0, text.length, {
    speaker     : "王冕",
    speakerStart: 0,
    speakerEnd  : 2
  });

  it("引入句主语 SELF → 保留 SELF，记录 DIALOGUE_SELF_PRESERVED 审计", () => {
    const out = enforceRegionOverride(
      mention({ surfaceForm: "王冕", identityClaim: "SELF", evidenceRawSpan: "王冕道：\u201c日已晚矣。\u201d" }),
      text,
      [dialogueRegion]
    );
    expect(out.identityClaim).toBe("SELF");
    expect(out.narrativeRegionType).toBe("DIALOGUE");
    expect(out.regionOverrideApplied).toBe(REGION_OVERRIDE_RULES.DIALOGUE_SELF_PRESERVED);
  });

  it("引入句主语 UNSURE → 保留 UNSURE（不强改）", () => {
    const out = enforceRegionOverride(
      mention({ surfaceForm: "王冕", identityClaim: "UNSURE", evidenceRawSpan: "王冕道：\u201c日已晚矣。\u201d" }),
      text,
      [dialogueRegion]
    );
    expect(out.identityClaim).toBe("UNSURE");
    expect(out.regionOverrideApplied).toBe(REGION_OVERRIDE_RULES.DIALOGUE_SELF_PRESERVED);
  });

  it("speaker 与 surfaceForm 不一致 → 不算引入句主语，仍应用常规 DIALOGUE 规则", () => {
    const out = enforceRegionOverride(
      mention({ surfaceForm: "秦老", identityClaim: "SELF", evidenceRawSpan: "日已晚矣" }),
      text,
      [dialogueRegion]
    );
    // 秦老不在引入句 span 内 → 常规第三方规则 → SELF→QUOTED
    expect(out.identityClaim).toBe("QUOTED");
  });

  it("引入句主语 + aliasType COURTESY_NAME → 保留 SELF + aliasType 不改", () => {
    // 如 "子美答："..."" speaker=子美（字号指向杜甫）
    const t2 = "子美答：\u201c不然。\u201d";
    const r2 = region("DIALOGUE", 0, t2.length, { speaker: "子美", speakerStart: 0, speakerEnd: 2 });
    const out = enforceRegionOverride(
      mention({
        surfaceForm        : "子美",
        aliasType          : "COURTESY_NAME",
        identityClaim      : "SELF",
        evidenceRawSpan    : t2,
        suspectedResolvesTo: "杜甫"
      }),
      t2,
      [r2]
    );
    expect(out.identityClaim).toBe("SELF");
    expect(out.aliasType).toBe("COURTESY_NAME");
    expect(out.suspectedResolvesTo).toBe("杜甫");
  });

  it("多 mention 同章：引入句主语保留 SELF + 引号内第三方覆写 QUOTED", () => {
    const t = "王冕道：\u201c秦老家要做寿。\u201d";
    const r = region("DIALOGUE", 0, t.length, { speaker: "王冕", speakerStart: 0, speakerEnd: 2 });

    const subject = enforceRegionOverride(
      mention({ surfaceForm: "王冕", identityClaim: "SELF", evidenceRawSpan: "王冕道：\u201c秦老家要做寿。\u201d" }),
      t,
      [r]
    );
    const third = enforceRegionOverride(
      mention({ surfaceForm: "秦老", identityClaim: "SELF", evidenceRawSpan: "秦老家要做寿" }),
      t,
      [r]
    );
    expect(subject.identityClaim).toBe("SELF");
    expect(third.identityClaim).toBe("QUOTED");
  });
});

// ── NARRATIVE 不覆写 ───────────────────────────────────────────────────

describe("enforceRegionOverride · NARRATIVE 不做覆写", () => {
  const text = "王冕在柳荫下读书，直到日落方归。";
  const narrativeRegion = region("NARRATIVE", 0, text.length);

  it("NARRATIVE 内 SELF 保持 SELF", () => {
    const out = enforceRegionOverride(
      mention({ surfaceForm: "王冕", identityClaim: "SELF", evidenceRawSpan: "王冕在柳荫下读书" }),
      text,
      [narrativeRegion]
    );
    expect(out.identityClaim).toBe("SELF");
    expect(out.narrativeRegionType).toBe("NARRATIVE");
    expect(out.regionOverrideApplied).toBeNull();
  });

  it("NARRATIVE 内 IMPERSONATING 保持不变", () => {
    const out = enforceRegionOverride(
      mention({ surfaceForm: "王冕", identityClaim: "IMPERSONATING", evidenceRawSpan: "王冕在柳荫下读书" }),
      text,
      [narrativeRegion]
    );
    expect(out.identityClaim).toBe("IMPERSONATING");
    expect(out.regionOverrideApplied).toBeNull();
  });

  it("NARRATIVE 内 UNSURE 保持 UNSURE", () => {
    const out = enforceRegionOverride(
      mention({ surfaceForm: "王冕", identityClaim: "UNSURE", evidenceRawSpan: "王冕在柳荫下读书" }),
      text,
      [narrativeRegion]
    );
    expect(out.identityClaim).toBe("UNSURE");
  });
});

// ── 区段回退：LLM 自评 vs 权威 regionMap ──────────────────────────────

describe("enforceRegionOverride · 区段回退", () => {
  it("mention 定位失败（原文不含）→ 回退 LLM 自评 narrativeRegionType=POEM → 强制 HISTORICAL", () => {
    const out = enforceRegionOverride(
      mention({
        surfaceForm        : "王冕",
        identityClaim      : "SELF",
        narrativeRegionType: "POEM",
        evidenceRawSpan    : "与原文完全无关的段落"
      }),
      "别的原文内容",
      []
    );
    expect(out.identityClaim).toBe("HISTORICAL");
    expect(out.narrativeRegionType).toBe("POEM");
  });

  it("mention 定位成功但不在任何 region → 回退 LLM 自评", () => {
    const out = enforceRegionOverride(
      mention({
        surfaceForm        : "王冕",
        identityClaim      : "SELF",
        narrativeRegionType: "NARRATIVE",
        evidenceRawSpan    : "王冕读书"
      }),
      "王冕读书的原文。",
      [] // 空 regionMap
    );
    // LLM 自评 NARRATIVE，不覆写
    expect(out.identityClaim).toBe("SELF");
    expect(out.narrativeRegionType).toBe("NARRATIVE");
  });

  it("权威区段 POEM 压过 LLM 自评 NARRATIVE → 强制 HISTORICAL", () => {
    const text = "诗曰王冕在此。";
    const out = enforceRegionOverride(
      mention({
        surfaceForm        : "王冕",
        identityClaim      : "SELF",
        narrativeRegionType: "NARRATIVE", // LLM 自评错判
        evidenceRawSpan    : "王冕在此"
      }),
      text,
      [region("POEM", 0, text.length)]
    );
    expect(out.identityClaim).toBe("HISTORICAL");
    expect(out.narrativeRegionType).toBe("POEM");
  });
});

// ── spanStart / spanEnd 回填 ───────────────────────────────────────────

describe("enforceRegionOverride · spanStart/spanEnd", () => {
  it("命中 → 填字符偏移", () => {
    const text = "前置王冕走进庭院";
    const out = enforceRegionOverride(
      mention({ surfaceForm: "王冕", evidenceRawSpan: "王冕走进庭院" }),
      text,
      []
    );
    expect(out.spanStart).toBe(2);
    expect(out.spanEnd).toBe(4);
  });

  it("未命中 → 填 null", () => {
    const out = enforceRegionOverride(
      mention({ surfaceForm: "张三", evidenceRawSpan: "不在原文" }),
      "王冕走进庭院",
      []
    );
    expect(out.spanStart).toBeNull();
    expect(out.spanEnd).toBeNull();
  });
});
