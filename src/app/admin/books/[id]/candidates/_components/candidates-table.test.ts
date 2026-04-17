/**
 * KPI 徽章阈值单测。
 *
 * 这是 §0-11 管线合格门槛判定的核心规则，阈值若漂移会改变"合格/观察/回炉"
 * 的业务判定，因此单独写锁死测试避免无意义改动。
 */
import { describe, expect, it } from "vitest";

import { resolveKpiBadge } from "./candidates-table";

describe("resolveKpiBadge (§0-11 pipeline KPI thresholds)", () => {
  it("returns success variant for total <= 200", () => {
    expect(resolveKpiBadge(0).variant).toBe("success");
    expect(resolveKpiBadge(200).variant).toBe("success");
  });

  it("returns warning variant for 200 < total <= 300", () => {
    expect(resolveKpiBadge(201).variant).toBe("warning");
    expect(resolveKpiBadge(300).variant).toBe("warning");
  });

  it("returns destructive variant for total > 300", () => {
    expect(resolveKpiBadge(301).variant).toBe("destructive");
    expect(resolveKpiBadge(9999).variant).toBe("destructive");
  });

  it("labels carry the Chinese band description", () => {
    expect(resolveKpiBadge(100).label).toContain("合格");
    expect(resolveKpiBadge(250).label).toContain("观察");
    expect(resolveKpiBadge(500).label).toContain("管线回炉");
  });
});
