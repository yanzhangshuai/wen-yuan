/**
 * 文件定位（单元测试）：
 * - `src/server/modules/analysis/config/thresholdsByBookType.test.ts`
 * - 覆盖 `getThresholds` 与 `THRESHOLDS_BY_BOOK_TYPE` 的基本契约：
 *   每个 BookTypeCode 均返回非空阈值对象，且 CLASSICAL_NOVEL 与 spec §0-F.1 基准一致。
 */

import { describe, expect, it } from "vitest";

import { BookTypeCode } from "@/generated/prisma/enums";

import {
  THRESHOLDS_BY_BOOK_TYPE,
  getThresholds
} from "./thresholdsByBookType";

describe("thresholdsByBookType", () => {
  it("covers every BookTypeCode enum value", () => {
    // Assert：枚举键集合与映射键集合必须完全一致。
    expect(new Set(Object.keys(THRESHOLDS_BY_BOOK_TYPE))).toEqual(new Set(Object.values(BookTypeCode)));
  });

  it.each(Object.values(BookTypeCode))("returns a non-empty thresholds object for %s", (code) => {
    const thresholds = getThresholds(code);

    // Assert：三个字段均存在且为合法数字。
    expect(thresholds.confirmedMinChapters).toBeGreaterThan(0);
    expect(thresholds.confirmedMinMentions).toBeGreaterThan(0);
    expect(thresholds.mergeConfidenceFloor).toBeGreaterThan(0);
    expect(thresholds.mergeConfidenceFloor).toBeLessThanOrEqual(1);
  });

  it("returns spec §0-F.1 baseline for CLASSICAL_NOVEL", () => {
    const thresholds = getThresholds("CLASSICAL_NOVEL");

    expect(thresholds).toEqual({
      confirmedMinChapters: 2,
      confirmedMinMentions: 2,
      mergeConfidenceFloor: 0.85
    });
  });

  it("falls back to GENERIC for unknown enum values (runtime defensive)", () => {
    // 该分支在 TS 层不可达，但运行时可能由 DB 脏值触发；保留保护。
    const thresholds = getThresholds("UNKNOWN_CODE" as BookTypeCode);

    expect(thresholds).toEqual(THRESHOLDS_BY_BOOK_TYPE.GENERIC);
  });
});
