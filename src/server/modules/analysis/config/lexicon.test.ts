import { describe, expect, it } from "vitest";

import {
  CHINESE_SURNAME_LIST,
  DEFAULT_POSITION_STEMS,
  ENTITY_EXTRACTION_RULES,
  RELATIONSHIP_EXTRACTION_RULES,
  UNIVERSAL_TITLE_STEMS,
  buildEffectiveGenericTitles,
  buildEffectiveTitlePattern,
  extractSurname,
  formatRulesSection
} from "@/server/modules/analysis/config/lexicon";

/**
 * 文件定位（分析配置层单测）：
 * - 校验“称谓词典”构建逻辑，属于文本分析前置配置，不直接处理路由请求。
 * - 在整条解析链路中，它为后续实体识别/关系抽取提供候选称谓规则。
 *
 * 业务价值：
 * - 保证系统默认词典 + 书籍定制词典可叠加，同时支持豁免词（排除误识别）。
 * - 保证正则模式能覆盖常见称谓并避免单字误匹配（降低噪声）。
 */
describe("lexicon config helpers", () => {
  it("buildEffectiveGenericTitles applies additional and exempt entries", () => {
    // 业务场景：运营或分析策略会对“泛称谓”做增删，本断言保证配置变更能够生效且可回滚。
    const effective = buildEffectiveGenericTitles({
      additionalGenericTitles: ["掌门", "山主"],
      exemptGenericTitles    : ["先生", "公子"]
    }, false);

    expect(effective.has("掌门")).toBe(true);
    expect(effective.has("山主")).toBe(true);
    expect(effective.has("先生")).toBe(false);
    expect(effective.has("公子")).toBe(false);
  });

  it("buildEffectiveTitlePattern merges universal/default/book stems and avoids single-char fallback", () => {
    // 业务原因：若允许单字称谓（如“王/侯/伯”）直接命中，会在古文中产生大量误报，影响下游图谱质量。
    const pattern = buildEffectiveTitlePattern({
      additionalTitlePatterns   : ["盟主"],
      additionalPositionPatterns: ["节度使"]
    });

    expect(UNIVERSAL_TITLE_STEMS.length).toBeGreaterThan(0);
    expect(DEFAULT_POSITION_STEMS.length).toBeGreaterThan(0);
    expect(pattern.test("武林盟主")).toBe(true);
    expect(pattern.test("河东节度使")).toBe(true);
    expect(pattern.test("王")).toBe(false);
    expect(pattern.test("侯")).toBe(false);
    expect(pattern.test("伯")).toBe(false);
  });
});
describe("CHINESE_SURNAME_LIST", () => {
  it("contains common single-char surnames from classical literature", () => {
    // 古典小说高频姓氏必须覆盖
    for (const surname of ["范", "贾", "刘", "曹", "孙", "诸", "马", "张", "王", "李"]) {
      expect(CHINESE_SURNAME_LIST.has(surname)).toBe(true);
    }
  });

  it("contains compound surnames", () => {
    for (const surname of ["诸葛", "司马", "欧阳", "上官", "公孙", "夏侯"]) {
      expect(CHINESE_SURNAME_LIST.has(surname)).toBe(true);
    }
  });

  it("does not contain non-surname characters", () => {
    // 常见汉字但不是姓氏
    expect(CHINESE_SURNAME_LIST.has("的")).toBe(false);
    expect(CHINESE_SURNAME_LIST.has("了")).toBe(false);
    expect(CHINESE_SURNAME_LIST.has("人")).toBe(false);
  });
});

describe("extractSurname", () => {
  it("extracts single-char surnames", () => {
    expect(extractSurname("范进")).toBe("范");
    expect(extractSurname("贾宝玉")).toBe("贾");
    expect(extractSurname("刘备")).toBe("刘");
  });

  it("prioritizes compound surnames over single-char", () => {
    // "诸葛亮"应匹配复姓"诸葛"而非单姓"诸"
    expect(extractSurname("诸葛亮")).toBe("诸葛");
    expect(extractSurname("司马懿")).toBe("司马");
    expect(extractSurname("欧阳修")).toBe("欧阳");
  });

  it("returns null for unknown surnames", () => {
    expect(extractSurname("")).toBe(null);
    expect(extractSurname("老爷")).toBe(null);
  });

  it("handles single-char input", () => {
    expect(extractSurname("范")).toBe("范");
    expect(extractSurname("啊")).toBe(null);
  });
});

describe("shared prompt rules", () => {
  it("ENTITY_EXTRACTION_RULES contains genericTitles placeholder", () => {
    // 保证占位符存在，prompt 构建时能正确替换
    const hasPlaceholder = ENTITY_EXTRACTION_RULES.some((r) => r.includes("{genericTitles}"));
    expect(hasPlaceholder).toBe(true);
  });

  it("ENTITY_EXTRACTION_RULES has minimum rule count", () => {
    expect(ENTITY_EXTRACTION_RULES.length).toBeGreaterThanOrEqual(7);
  });

  it("RELATIONSHIP_EXTRACTION_RULES covers key constraints", () => {
    const joined = RELATIONSHIP_EXTRACTION_RULES.join(" ");
    expect(joined).toContain("evidence");
    expect(joined).toContain("自关系");
    expect(RELATIONSHIP_EXTRACTION_RULES.length).toBeGreaterThanOrEqual(3);
  });
});

describe("formatRulesSection", () => {
  it("formats rules with sequential numbering and placeholder replacement", () => {
    const rules = ["规则 A（{name}）", "规则 B"] as const;
    const result = formatRulesSection(rules, { name: "测试" });

    expect(result).toBe("1. 规则 A（测试）\n2. 规则 B");
  });

  it("supports custom start index", () => {
    const result = formatRulesSection(["规则一"], undefined, 5);
    expect(result).toBe("5. 规则一");
  });

  it("works without replacements", () => {
    const result = formatRulesSection(["简单规则"]);
    expect(result).toBe("1. 简单规则");
  });
});
