import { describe, expect, it } from "vitest";

import {
  formatWhitelistViolations,
  validatePromptWhitelist
} from "@/lib/prompt-whitelist";
import { STAGE_BCD_PROMPT_SLUGS } from "@/lib/prompt-template-metadata";
import { PROMPT_TEMPLATE_BASELINES } from "@/server/modules/knowledge/prompt-template-baselines";

describe("validatePromptWhitelist", () => {
  it("passes clean Stage A/B/C baselines with abstract placeholders", () => {
    const stageSet = new Set<string>(STAGE_BCD_PROMPT_SLUGS);
    const stageBaselines = PROMPT_TEMPLATE_BASELINES.filter((item) => stageSet.has(item.slug)).map(
      (item) => ({
        slug        : item.slug,
        systemPrompt: item.systemPrompt,
        userPrompt  : item.userPrompt
      })
    );

    expect(stageBaselines).toHaveLength(STAGE_BCD_PROMPT_SLUGS.length);

    const violations = validatePromptWhitelist(stageBaselines);
    expect(violations).toEqual([]);
  });

  it("detects named entity leak (范进)", () => {
    const violations = validatePromptWhitelist([
      {
        slug        : "STAGE_A_EXTRACT_MENTIONS",
        systemPrompt: "你是助手。",
        userPrompt  : [
          "示例：",
          "范进道：晚生中举。"
        ].join("\n")
      }
    ]);

    const namedHits = violations.filter((v) => v.rule === "NAMED_ENTITY");
    expect(namedHits.length).toBeGreaterThan(0);
    expect(namedHits.map((v) => v.match)).toContain("范进");
  });

  it("detects dialogue subject that is not an abstract placeholder", () => {
    const violations = validatePromptWhitelist([
      {
        slug        : "STAGE_A_EXTRACT_MENTIONS",
        systemPrompt: "",
        userPrompt  : "张三道：今日得见。"
      }
    ]);

    const dialogHits = violations.filter((v) => v.rule === "DIALOGUE_SUBJECT");
    expect(dialogHits.map((v) => v.match)).toContain("张三");
  });

  it("does not flag abstract dialogue subjects (甲某道)", () => {
    const violations = validatePromptWhitelist([
      {
        slug        : "STAGE_A_EXTRACT_MENTIONS",
        systemPrompt: "",
        userPrompt  : "引入句主语示例：甲某道：“久仰。”"
      }
    ]);

    expect(violations.filter((v) => v.rule === "DIALOGUE_SUBJECT")).toEqual([]);
  });

  it("detects book titles wrapped in 《》", () => {
    const violations = validatePromptWhitelist([
      {
        slug        : "STAGE_C_ATTRIBUTE_EVENT",
        systemPrompt: "",
        userPrompt  : "分析《儒林外史》第3回。"
      }
    ]);

    const titleHits = violations.filter((v) => v.rule === "BOOK_TITLE");
    expect(titleHits.map((v) => v.match)).toContain("《儒林外史》");
  });

  it("formats violations with slug, line number and match", () => {
    const violations = validatePromptWhitelist([
      {
        slug        : "STAGE_A_EXTRACT_MENTIONS",
        systemPrompt: "",
        userPrompt  : "范进是主角。"
      }
    ]);

    const formatted = formatWhitelistViolations(violations);
    expect(formatted).toContain("STAGE_A_EXTRACT_MENTIONS");
    expect(formatted).toContain("NAMED_ENTITY");
    expect(formatted).toContain("范进");
  });
});
