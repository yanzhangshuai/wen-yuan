import { describe, expect, it } from "vitest";

import { parseLlmJsonSafely, repairTruncatedJson, stripCodeFence } from "./parseLlmJson";

describe("parseLlmJson", () => {
  describe("stripCodeFence", () => {
    it("剥离 ```json fenced 代码块", () => {
      const input = "```json\n{\"a\":1}\n```";
      expect(stripCodeFence(input)).toBe("{\"a\":1}");
    });

    it("剥离无语言标记的 ``` 代码块", () => {
      const input = "```\n{\"a\":1}\n```";
      expect(stripCodeFence(input)).toBe("{\"a\":1}");
    });

    it("无围栏时原样返回（去首尾空白）", () => {
      expect(stripCodeFence("  {\"a\":1}  ")).toBe("{\"a\":1}");
    });
  });

  describe("repairTruncatedJson", () => {
    it("修复截断的对象 { records: [..., 截断] }", () => {
      const input = "{\"records\":[{\"a\":1},{\"b\":2,\"c\":";
      const repaired = repairTruncatedJson(input);
      expect(repaired).not.toBeNull();
      const parsed = JSON.parse(repaired!);
      expect(Array.isArray(parsed.records)).toBe(true);
      expect(parsed.records).toHaveLength(1);
      expect(parsed.records[0]).toEqual({ a: 1 });
    });

    it("修复截断的纯数组", () => {
      const input = "[{\"a\":1},{\"b\":";
      const repaired = repairTruncatedJson(input);
      expect(repaired).not.toBeNull();
      const parsed = JSON.parse(repaired!);
      expect(parsed).toEqual([{ a: 1 }]);
    });

    it("完整 JSON 不需要修复 → 原样返回（仍可 parse）", () => {
      const input = "{\"records\":[{\"a\":1}]}";
      const repaired = repairTruncatedJson(input);
      expect(repaired).not.toBeNull();
      expect(JSON.parse(repaired!)).toEqual({ records: [{ a: 1 }] });
    });
  });

  describe("parseLlmJsonSafely", () => {
    it("正常 JSON", () => {
      expect(parseLlmJsonSafely("{\"a\":1}")).toEqual({ a: 1 });
    });

    it("带 ```json 围栏", () => {
      expect(parseLlmJsonSafely("```json\n[1,2]\n```")).toEqual([1, 2]);
    });

    it("围栏 + 截断", () => {
      const input = "```json\n{\"records\":[{\"a\":1},{\"b\":";
      const parsed = parseLlmJsonSafely(input);
      expect(parsed).toEqual({ records: [{ a: 1 }] });
    });

    it("纯非法字符串 → null", () => {
      expect(parseLlmJsonSafely("not json")).toBeNull();
    });

    it("空字符串 → null", () => {
      expect(parseLlmJsonSafely("")).toBeNull();
    });
  });
});
