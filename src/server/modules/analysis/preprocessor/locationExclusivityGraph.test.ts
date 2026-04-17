/**
 * 被测对象：Stage 0 地点互斥图（preprocessor/locationExclusivityGraph.ts）。
 * 测试目标：
 *   - ≥ 10 条互斥对的双向对称性
 *   - 非互斥 / 相同地点 / 空值 → false
 *   - 不做传递性闭包（A↔B, B↔C 不推 A↔C）
 * 覆盖范围：success / failure / boundary。
 */

import { describe, expect, it } from "vitest";

import {
  MUTUAL_EXCLUSION_PAIRS,
  areMutuallyExclusive
} from "@/server/modules/analysis/preprocessor/locationExclusivityGraph";

describe("areMutuallyExclusive - 常量图命中与对称性", () => {
  it("互斥对 ≥ 10 条", () => {
    expect(MUTUAL_EXCLUSION_PAIRS.length).toBeGreaterThanOrEqual(10);
  });

  it.each(MUTUAL_EXCLUSION_PAIRS.map(p => [p[0], p[1]] as const))(
    "每条互斥对双向对称：(%s, %s)",
    (a, b) => {
      expect(areMutuallyExclusive(a, b)).toBe(true);
      expect(areMutuallyExclusive(b, a)).toBe(true);
    }
  );

  it("相同地点 → false", () => {
    expect(areMutuallyExclusive("城内", "城内")).toBe(false);
    expect(areMutuallyExclusive("南京", "南京")).toBe(false);
  });

  it("未定义关系 → false（防御性）", () => {
    expect(areMutuallyExclusive("城内", "南京")).toBe(false);
    expect(areMutuallyExclusive("山上", "朝中")).toBe(false);
    expect(areMutuallyExclusive("未知A", "未知B")).toBe(false);
  });

  it("与常量图之外的任意 token → false", () => {
    // "洛阳" 未加入互斥图 → 和任何已定义地点都返回 false
    expect(areMutuallyExclusive("洛阳", "南京")).toBe(false);
    expect(areMutuallyExclusive("南京", "洛阳")).toBe(false);
  });

  it("空字符串 / 空输入 → false", () => {
    expect(areMutuallyExclusive("", "城内")).toBe(false);
    expect(areMutuallyExclusive("城内", "")).toBe(false);
    expect(areMutuallyExclusive("", "")).toBe(false);
  });

  it("不做传递闭包：即便 A↔B 且 A↔C，也不推 B↔C", () => {
    // "江南" 同时与 "京师" 和 "塞北" 互斥，但 "京师" ↔ "塞北" 未显式定义
    expect(areMutuallyExclusive("江南", "京师")).toBe(true);
    expect(areMutuallyExclusive("江南", "塞北")).toBe(true);
    expect(areMutuallyExclusive("京师", "塞北")).toBe(false);
  });
});
