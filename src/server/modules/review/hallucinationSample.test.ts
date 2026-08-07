/**
 * 被测对象：hallucinationSample（关系级幻觉定向抽样）。
 * 测试目标：证据单薄边抽样 / 新实体率估算 / 阈值判定。
 * 覆盖范围：success / boundary。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { HALLUCINATION_THIN_EVIDENCE_CHARS } from "./config";
import {
  estimateNewEntityRate,
  isHighNewEntityRate,
  sampleRelationHallucination
} from "./hallucinationSample";

const prisma = {
  fact: { findMany: vi.fn(), count: vi.fn() }
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sampleRelationHallucination", () => {
  it("返回证据单薄的关系边（evidence 字符低于阈值）", async () => {
    // Arrange
    prisma.fact.findMany.mockResolvedValue([
      { id: "fact-1", evidence: "短", sourceEntity: { name: "A" }, targetEntity: { name: "B" } },
      { id: "fact-2", evidence: "x".repeat(HALLUCINATION_THIN_EVIDENCE_CHARS + 20), sourceEntity: { name: "C" }, targetEntity: { name: "D" } }
    ]);

    // Act
    const result = await sampleRelationHallucination("book-1", 10, prisma as never);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ factId: "fact-1", reason: "thin_evidence", sourceName: "A", targetName: "B" });
  });

  it("超过 maxSamples 时截断", async () => {
    // Arrange
    prisma.fact.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({ id: `fact-${i}`, evidence: "短", sourceEntity: null, targetEntity: null }))
    );

    // Act
    const result = await sampleRelationHallucination("book-1", 2, prisma as never);

    // Assert
    expect(result).toHaveLength(2);
  });
});

describe("estimateNewEntityRate", () => {
  it("计算新实体率（sourceEntity 为 null 占比）", async () => {
    // Arrange
    prisma.fact.count
      .mockResolvedValueOnce(100) // total DRAFT
      .mockResolvedValueOnce(40); // sourceEntity null

    // Act
    const rate = await estimateNewEntityRate("book-1", prisma as never);

    // Assert
    expect(rate).toBe(0.4);
  });

  it("无 DRAFT 事实 → 0", async () => {
    // Arrange
    prisma.fact.count.mockResolvedValue(0);

    // Act
    const rate = await estimateNewEntityRate("book-1", prisma as never);

    // Assert
    expect(rate).toBe(0);
  });
});

describe("isHighNewEntityRate", () => {
  it("达到阈值 → true", () => {
    expect(isHighNewEntityRate(0.5)).toBe(true);
  });

  it("低于阈值 → false", () => {
    expect(isHighNewEntityRate(0.1)).toBe(false);
  });
});
