/**
 * 被测对象：ratchet（棘轮校准）。
 * 测试目标：准确率计算 → 达标放宽 / 未达标收紧 / 空样本边界。
 * 覆盖范围：success / boundary。
 */

import { describe, expect, it } from "vitest";

import { RATCHET_ACCURACY_TARGET } from "./config";
import { calibrateAutoAccept, sampleRatchetSize } from "./ratchet";

describe("calibrateAutoAccept", () => {
  it("准确率达标 → RELAX", () => {
    const result = calibrateAutoAccept([
      { correct: true }, { correct: true }, { correct: true },
      { correct: true }, { correct: false }
    ]);
    expect(result.sampled).toBe(5);
    expect(result.correct).toBe(4);
    expect(result.accuracy).toBe(0.8);
    // 0.8 < 0.95 → 收紧
    expect(result.action).toBe("TIGHTEN");
  });

  it("准确率极高 → RELAX", () => {
    const result = calibrateAutoAccept(Array.from({ length: 20 }, () => ({ correct: true })));
    expect(result.accuracy).toBe(1);
    expect(result.action).toBe("RELAX");
  });

  it("空样本 → accuracy 0，TIGHTEN", () => {
    const result = calibrateAutoAccept([]);
    expect(result.sampled).toBe(0);
    expect(result.accuracy).toBe(0);
    expect(result.action).toBe("TIGHTEN");
  });

  it("阈值边界：恰好等于目标 → RELAX", () => {
    const count = 100;
    const correct = Math.round(count * RATCHET_ACCURACY_TARGET);
    const samples = [
      ...Array.from({ length: correct }, () => ({ correct: true })),
      ...Array.from({ length: count - correct }, () => ({ correct: false }))
    ];
    const result = calibrateAutoAccept(samples);
    expect(result.accuracy).toBeGreaterThanOrEqual(RATCHET_ACCURACY_TARGET);
    expect(result.action).toBe("RELAX");
  });
});

describe("sampleRatchetSize", () => {
  it("按抽样比例返回回查样本数", () => {
    expect(sampleRatchetSize(100)).toBe(10);
    expect(sampleRatchetSize(50)).toBe(5);
  });

  it("总数为 0 时至少 1 个（避免零抽样）", () => {
    expect(sampleRatchetSize(0)).toBe(1);
  });
});
