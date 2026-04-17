import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BookTypeCode } from "@/generated/prisma/client";
import {
  formatWhitelistViolations,
  validatePromptWhitelist
} from "@/lib/prompt-whitelist";
import {
  FEW_SHOT_LIMIT,
  getFewShots,
  resetFewShotsCache
} from "@/server/modules/analysis/prompts/resolveBookTypeFewShots";
import {
  BOOK_TYPE_EXAMPLE_BASELINES,
  BOOK_TYPE_EXAMPLE_STAGES,
  type BookTypeExampleStage
} from "@/server/modules/knowledge/booktype-example-baselines";
import { PROMPT_TEMPLATE_BASELINES } from "@/server/modules/knowledge/prompt-template-baselines";

const hoisted = vi.hoisted(() => ({
  prisma: {
    bookTypeExample: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: hoisted.prisma
}));

const BOOK_TYPE_CODES: readonly BookTypeCode[] = [
  "CLASSICAL_NOVEL",
  "HEROIC_NOVEL",
  "HISTORICAL_NOVEL",
  "MYTHOLOGICAL_NOVEL",
  "GENERIC"
];

describe("BookTypeExample baselines", () => {
  it("至少有 45 条 baseline（5 BookTypeCode × 3 Stage × ≥3）", () => {
    expect(BOOK_TYPE_EXAMPLE_BASELINES.length).toBeGreaterThanOrEqual(45);
  });

  it("每个 (bookTypeCode, stage) 组合至少 3 条 baseline", () => {
    for (const code of BOOK_TYPE_CODES) {
      for (const stage of BOOK_TYPE_EXAMPLE_STAGES) {
        const matches = BOOK_TYPE_EXAMPLE_BASELINES.filter(
          (b) => b.bookTypeCode === code && b.stage === stage
        );
        expect(
          matches.length,
          `combo ${code}/${stage} 至少 3 条`
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("所有 baseline 正文通过白名单校验（§0-1：禁具名实体）", () => {
    const candidates = BOOK_TYPE_EXAMPLE_BASELINES.map((b) => ({
      slug        : `${b.bookTypeCode}:${b.stage}:${b.label}`,
      systemPrompt: b.exampleInput,
      userPrompt  : b.exampleOutput
    }));

    const violations = validatePromptWhitelist(candidates);
    expect(
      violations,
      `违规示例：\n${formatWhitelistViolations(violations)}`
    ).toEqual([]);
  });

  it("反向用例：插入真实人名（王冕）应命中 NAMED_ENTITY 规则", () => {
    const violations = validatePromptWhitelist([
      {
        slug        : "NEGATIVE:TEST",
        systemPrompt: "王冕幼年失父，在秦家放牛。",
        userPrompt  : "{}"
      }
    ]);

    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.match === "王冕")).toBe(true);
  });
});

describe("resolveBookTypeFewShots.getFewShots", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetFewShotsCache();
  });

  it("15 个 (code, stage) 组合返回非空字符串", async () => {
    hoisted.prisma.bookTypeExample.findMany.mockImplementation(
      (args: { where: { bookTypeCode: BookTypeCode; stage: BookTypeExampleStage } }) => {
        const { bookTypeCode, stage } = args.where;
        const rows = BOOK_TYPE_EXAMPLE_BASELINES
          .filter((b) => b.bookTypeCode === bookTypeCode && b.stage === stage)
          .slice(0, FEW_SHOT_LIMIT)
          .map((b, idx) => ({
            id           : `mock-${idx}`,
            bookTypeCode : b.bookTypeCode,
            stage        : b.stage,
            label        : b.label,
            exampleInput : b.exampleInput,
            exampleOutput: b.exampleOutput,
            note         : b.note ?? null,
            priority     : b.priority ?? 0,
            active       : true,
            createdAt    : new Date()
          }));
        return Promise.resolve(rows);
      }
    );

    for (const code of BOOK_TYPE_CODES) {
      for (const stage of BOOK_TYPE_EXAMPLE_STAGES) {
        const text = await getFewShots(code, stage);
        expect(text.length, `${code}/${stage} 应非空`).toBeGreaterThan(0);
        expect(text).toContain("### 示例 1");
      }
    }
  });

  it("同一 (code, stage) 并发调用只触发一次 DB 查询（缓存）", async () => {
    hoisted.prisma.bookTypeExample.findMany.mockResolvedValue([
      {
        id           : "row-1",
        bookTypeCode : "CLASSICAL_NOVEL",
        stage        : "STAGE_A",
        label        : "测试",
        exampleInput : "甲某道：你好",
        exampleOutput: "{}",
        note         : null,
        priority     : 0,
        active       : true,
        createdAt    : new Date()
      }
    ]);

    const [a, b, c] = await Promise.all([
      getFewShots("CLASSICAL_NOVEL", "STAGE_A"),
      getFewShots("CLASSICAL_NOVEL", "STAGE_A"),
      getFewShots("CLASSICAL_NOVEL", "STAGE_A")
    ]);

    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(hoisted.prisma.bookTypeExample.findMany).toHaveBeenCalledTimes(1);
  });

  it("无数据时返回空字符串", async () => {
    hoisted.prisma.bookTypeExample.findMany.mockResolvedValue([]);
    const text = await getFewShots("GENERIC", "STAGE_C");
    expect(text).toBe("");
  });

  it("不同 (code, stage) 返回不同 few-shot（§0-F DoD）", async () => {
    hoisted.prisma.bookTypeExample.findMany.mockImplementation(
      (args: { where: { bookTypeCode: BookTypeCode; stage: BookTypeExampleStage } }) => {
        const rows = BOOK_TYPE_EXAMPLE_BASELINES
          .filter(
            (b) => b.bookTypeCode === args.where.bookTypeCode && b.stage === args.where.stage
          )
          .slice(0, FEW_SHOT_LIMIT)
          .map((b, idx) => ({
            id           : `mock-${idx}`,
            bookTypeCode : b.bookTypeCode,
            stage        : b.stage,
            label        : b.label,
            exampleInput : b.exampleInput,
            exampleOutput: b.exampleOutput,
            note         : b.note ?? null,
            priority     : b.priority ?? 0,
            active       : true,
            createdAt    : new Date()
          }));
        return Promise.resolve(rows);
      }
    );

    const classicalA = await getFewShots("CLASSICAL_NOVEL", "STAGE_A");
    const heroicA = await getFewShots("HEROIC_NOVEL", "STAGE_A");
    const classicalB = await getFewShots("CLASSICAL_NOVEL", "STAGE_B");

    expect(classicalA).not.toBe(heroicA);
    expect(classicalA).not.toBe(classicalB);
  });
});

describe("Prompt baseline 集成：{bookTypeFewShots} 占位符可被 few-shot 替换", () => {
  beforeEach(() => {
    resetFewShotsCache();
    vi.resetAllMocks();
  });

  it("Stage A baseline 的 {bookTypeFewShots} 被 getFewShots 结果正确替换", async () => {
    hoisted.prisma.bookTypeExample.findMany.mockImplementation(() =>
      Promise.resolve([
        {
          id           : "r1",
          bookTypeCode : "HEROIC_NOVEL",
          stage        : "STAGE_A",
          label        : "集成测试",
          exampleInput : "甲某走过山岗。",
          exampleOutput: JSON.stringify({ mentions: [] }),
          note         : null,
          priority     : 99,
          active       : true,
          createdAt    : new Date()
        }
      ])
    );

    const stageA = PROMPT_TEMPLATE_BASELINES.find(
      (b) => b.slug === "STAGE_A_EXTRACT_MENTIONS"
    );
    expect(stageA).toBeDefined();
    expect(stageA!.userPrompt).toContain("{bookTypeFewShots}");

    const fewShots = await getFewShots("HEROIC_NOVEL", "STAGE_A");
    expect(fewShots).toContain("### 示例 1");
    expect(fewShots).toContain("集成测试");

    const rendered = stageA!.userPrompt.replace("{bookTypeFewShots}", fewShots);
    expect(rendered).not.toContain("{bookTypeFewShots}");
    expect(rendered).toContain("### 示例 1：集成测试");
    expect(rendered).toContain("甲某走过山岗");
  });
});
