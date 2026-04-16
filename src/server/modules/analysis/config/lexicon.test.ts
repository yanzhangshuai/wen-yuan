import { describe, expect, it } from "vitest";

import {
  buildEffectiveGenericTitles,
  buildEffectiveTitlePattern,
  extractSurname,
  formatRulesSection
} from "@/server/modules/analysis/config/lexicon";

/**
 * 文件定位（分析配置层单测）：
 * - 校验"称谓词典"构建逻辑，属于文本分析前置配置，不直接处理路由请求。
 * - 删除硬编码后，所有 buildEffective* 在无 config 时返回空集。
 */
describe("lexicon config helpers", () => {
  it("buildEffectiveGenericTitles returns empty set without config", () => {
    const effective = buildEffectiveGenericTitles(undefined, false);
    expect(effective.size).toBe(0);
  });

  it("buildEffectiveGenericTitles with safety returns empty when no config", () => {
    const effective = buildEffectiveGenericTitles(undefined, true);
    expect(effective.size).toBe(0);
  });

  it("buildEffectiveGenericTitles applies additional and exempt entries from DB config", () => {
    const effective = buildEffectiveGenericTitles({
      defaultGenericTitles   : ["老爷", "夫人", "先生", "公子"],
      additionalGenericTitles: ["掌门", "山主"],
      exemptGenericTitles    : ["先生", "公子"]
    }, false);

    expect(effective.has("掌门")).toBe(true);
    expect(effective.has("山主")).toBe(true);
    expect(effective.has("老爷")).toBe(true);
    expect(effective.has("先生")).toBe(false);
    expect(effective.has("公子")).toBe(false);
  });

  it("buildEffectiveTitlePattern returns never-match regex without config", () => {
    const pattern = buildEffectiveTitlePattern(undefined);
    expect(pattern.test("武林盟主")).toBe(false);
    expect(pattern.test("任何文本")).toBe(false);
  });

  it("buildEffectiveTitlePattern merges book stems from DB config", () => {
    const pattern = buildEffectiveTitlePattern({
      additionalTitlePatterns   : ["盟主", "皇帝"],
      additionalPositionPatterns: ["节度使", "太守"]
    });

    expect(pattern.test("武林盟主")).toBe(true);
    expect(pattern.test("河东节度使")).toBe(true);
    expect(pattern.test("王")).toBe(false);
  });
});

describe("extractSurname", () => {
  const dbConfig = {
    surnameCompounds: ["诸葛", "司马", "欧阳"],
    surnameSingles  : ["范", "贾", "刘"]
  };

  it("extracts single-char surnames from DB config", () => {
    expect(extractSurname("范进", dbConfig)).toBe("范");
    expect(extractSurname("贾宝玉", dbConfig)).toBe("贾");
    expect(extractSurname("刘备", dbConfig)).toBe("刘");
  });

  it("prioritizes compound surnames over single-char", () => {
    expect(extractSurname("诸葛亮", dbConfig)).toBe("诸葛");
    expect(extractSurname("司马懿", dbConfig)).toBe("司马");
    expect(extractSurname("欧阳修", dbConfig)).toBe("欧阳");
  });

  it("returns null without config (no hardcoded fallback)", () => {
    expect(extractSurname("范进")).toBe(null);
    expect(extractSurname("诸葛亮")).toBe(null);
  });

  it("returns null for unknown surnames", () => {
    expect(extractSurname("", dbConfig)).toBe(null);
    expect(extractSurname("老爷", dbConfig)).toBe(null);
    expect(extractSurname("的人", dbConfig)).toBe(null);
  });

  it("handles single-char input", () => {
    expect(extractSurname("范", dbConfig)).toBe("范");
    expect(extractSurname("啊", dbConfig)).toBe(null);
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
