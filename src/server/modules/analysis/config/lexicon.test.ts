import { describe, expect, it } from "vitest";

import {
  DEFAULT_POSITION_STEMS,
  UNIVERSAL_TITLE_STEMS,
  buildEffectiveGenericTitles,
  buildEffectiveTitlePattern
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
