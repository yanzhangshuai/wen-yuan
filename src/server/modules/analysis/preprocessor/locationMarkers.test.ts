/**
 * 被测对象：Stage 0 地点标记词抽取（preprocessor/locationMarkers.ts）。
 * 测试目标：
 *   - 前缀 + 后缀组合命中的正确性
 *   - 仅 NARRATIVE 区段生效（POEM / DIALOGUE / COMMENTARY 忽略）
 *   - 无前缀的纯地名 token 不被误抽
 *   - charOffset / regionType / prefix 字段语义正确
 * 覆盖范围：success / failure / boundary。
 */

import { describe, expect, it } from "vitest";

import {
  LOCATION_PREFIXES,
  LOCATION_SUFFIXES,
  extractLocationMentions
} from "@/server/modules/analysis/preprocessor/locationMarkers";
import type { PreprocessRegion } from "@/server/modules/analysis/preprocessor/types";

/** 构造一个覆盖整段文本的单 region（测试用便捷函数）。 */
function wholeAs(type: PreprocessRegion["type"], text: string): PreprocessRegion {
  return { type, start: 0, end: text.length, text };
}

describe("extractLocationMentions - 前缀 + 后缀规则命中", () => {
  it("`王冕到济南城` → 命中 {location:'济南城', NARRATIVE}", () => {
    // Arrange
    const text = "王冕到济南城";
    const regions = [wholeAs("NARRATIVE", text)];
    // Act
    const hits = extractLocationMentions(text, regions);
    // Assert
    expect(hits).toHaveLength(1);
    expect(hits[0].location).toBe("济南城");
    expect(hits[0].regionType).toBe("NARRATIVE");
    expect(hits[0].prefix).toBe("到");
    // "到" 在 text 中索引 2，其后即地名 offset = 3
    expect(hits[0].charOffset).toBe(3);
    expect(text.slice(hits[0].charOffset, hits[0].charOffset + hits[0].location.length)).toBe("济南城");
  });

  it("`在庙前站立` → 命中 {location:'庙'}（单字地名，必须有前缀）", () => {
    const text = "在庙前站立";
    const hits = extractLocationMentions(text, [wholeAs("NARRATIVE", text)]);
    expect(hits).toHaveLength(1);
    expect(hits[0].location).toBe("庙");
    expect(hits[0].prefix).toBe("在");
  });

  it("纯 `庙前` 无前缀 → 不命中（避免把普通名词抽成地点）", () => {
    const text = "庙前一棵古松";
    const hits = extractLocationMentions(text, [wholeAs("NARRATIVE", text)]);
    expect(hits).toHaveLength(0);
  });

  it("POEM 区段内的地名（含前缀）被忽略", () => {
    // Arrange：POEM 区段含 "往桃花源"，NARRATIVE 区段无地名
    const poem = "有诗为证：往桃花源此诗";
    const narr = "此处无名";
    const text = poem + narr;
    const regions: PreprocessRegion[] = [
      { type: "POEM", start: 0, end: poem.length, text: poem },
      { type: "NARRATIVE", start: poem.length, end: text.length, text: narr }
    ];
    // Act
    const hits = extractLocationMentions(text, regions);
    // Assert：即便 "往桃花源" 里 "桃花源" 不以后缀词结尾，也绝不应命中 POEM 段
    expect(hits).toHaveLength(0);
  });

  it("DIALOGUE 区段内的地名被忽略", () => {
    const dialogue = "\u201c到杭州府去\u201d";
    const regions: PreprocessRegion[] = [
      { type: "DIALOGUE", start: 0, end: dialogue.length, text: dialogue }
    ];
    const hits = extractLocationMentions(dialogue, regions);
    expect(hits).toHaveLength(0);
  });

  it("COMMENTARY 区段内的地名被忽略", () => {
    const text = "却说他往扬州城去";
    const regions: PreprocessRegion[] = [
      { type: "COMMENTARY", start: 0, end: text.length, text }
    ];
    const hits = extractLocationMentions(text, regions);
    expect(hits).toHaveLength(0);
  });

  it("同一 NARRATIVE 区段多次命中 → 按 charOffset 升序", () => {
    const text = "他先到扬州府，后来又往苏州城住下。";
    const hits = extractLocationMentions(text, [wholeAs("NARRATIVE", text)]);
    expect(hits.map(h => h.location)).toEqual(["扬州府", "苏州城"]);
    expect(hits[0].charOffset).toBeLessThan(hits[1].charOffset);
    expect(hits[0].prefix).toBe("到");
    expect(hits[1].prefix).toBe("往");
  });

  it("`住在` 前缀优先级高于 `在`（不被吞为 1 字前缀）", () => {
    const text = "他住在乡下村里";
    const hits = extractLocationMentions(text, [wholeAs("NARRATIVE", text)]);
    // 期望前缀为两字 "住在"
    expect(hits).toHaveLength(1);
    expect(hits[0].prefix).toBe("住在");
    expect(hits[0].location).toBe("乡下村");
  });

  it("跨多个 NARRATIVE 区段：每段分别抽取，偏移基于全文", () => {
    const a = "前言。";
    const b = "他到金陵府看望老友。";
    const c = "过年后又往苏州镇玩耍。";
    const text = a + b + c;
    const regions: PreprocessRegion[] = [
      { type: "NARRATIVE", start: 0, end: a.length, text: a },
      { type: "POEM", start: a.length, end: a.length, text: "" }, // 空 POEM，占位
      { type: "NARRATIVE", start: a.length, end: a.length + b.length, text: b },
      { type: "NARRATIVE", start: a.length + b.length, end: text.length, text: c }
    ];
    const hits = extractLocationMentions(text, regions);
    expect(hits.map(h => h.location)).toEqual(["金陵府", "苏州镇"]);
    // 验证 charOffset 相对于全文而不是 region 内
    expect(text.slice(hits[0].charOffset, hits[0].charOffset + 3)).toBe("金陵府");
    expect(text.slice(hits[1].charOffset, hits[1].charOffset + 3)).toBe("苏州镇");
  });

  it("边界：空文本 / 空 regions → 空数组", () => {
    expect(extractLocationMentions("", [])).toEqual([]);
    expect(extractLocationMentions("任意文本", [])).toEqual([]);
    expect(extractLocationMentions("", [{ type: "NARRATIVE", start: 0, end: 0, text: "" }])).toEqual([]);
  });

  it("边界：无前缀词 + 以后缀词结尾的长串 → 不命中", () => {
    // 不含任何前缀标记，即便 "济南城" 末字是后缀也不应被抽
    const text = "济南城风光秀丽。";
    const hits = extractLocationMentions(text, [wholeAs("NARRATIVE", text)]);
    expect(hits).toHaveLength(0);
  });

  it("末字不在后缀白名单 → 不命中（如 '到街头'）", () => {
    const text = "他到街头看热闹。"; // '头' 不在后缀列表
    const hits = extractLocationMentions(text, [wholeAs("NARRATIVE", text)]);
    // 可能会匹配 "到街"？不会，因为 '街' 不在后缀。也不会匹配到 1 字 "到"+'头'。
    expect(hits).toHaveLength(0);
  });

  it("越界 region 被安全跳过", () => {
    const text = "到杭州城。";
    const regions: PreprocessRegion[] = [
      { type: "NARRATIVE", start: -5, end: 3, text: "bad" },
      { type: "NARRATIVE", start: 0, end: 999, text: "bad" },
      { type: "NARRATIVE", start: 3, end: 3, text: "" }, // 空区段
      { type: "NARRATIVE", start: 0, end: text.length, text } // 正常
    ];
    const hits = extractLocationMentions(text, regions);
    expect(hits).toHaveLength(1);
    expect(hits[0].location).toBe("杭州城");
  });

  it("常量快照：前缀/后缀列表非空", () => {
    expect(LOCATION_PREFIXES.length).toBeGreaterThan(0);
    expect(LOCATION_SUFFIXES.length).toBeGreaterThanOrEqual(10);
    expect(LOCATION_PREFIXES).toContain("住在");
    expect(LOCATION_SUFFIXES).toContain("城");
  });
});
