import { describe, expect, it } from "vitest";
import { DEFAULT_DEICTIC_JUNK, isDeicticJunk } from "./nameAuthority.ts";

describe("isDeicticJunk（极简兜底）", () => {
  it("单字为垃圾", () => {
    expect(isDeicticJunk("王")).toBe(true);
    expect(isDeicticJunk("张")).toBe(true);
  });
  it("纯指代词为垃圾", () => {
    expect(isDeicticJunk("众人")).toBe(true);
    expect(isDeicticJunk("那人")).toBe(true);
    expect(isDeicticJunk("老者")).toBe(true);
  });
  it("称谓/真名不是垃圾（判断交给模型）", () => {
    expect(isDeicticJunk("老爷")).toBe(false); // 称谓由模型判断
    expect(isDeicticJunk("范进")).toBe(false);
    expect(isDeicticJunk("范老爷")).toBe(false); // 称谓式名字由模型判断
    expect(isDeicticJunk("周学道")).toBe(false);
  });
  it("空串为垃圾", () => {
    expect(isDeicticJunk("")).toBe(true);
    expect(isDeicticJunk("  ")).toBe(true);
  });
});

describe("isDeicticJunk（契约名单注入）", () => {
  it("传入 junkList 时用它判断虚指（缺省集合不参与）", () => {
    expect(isDeicticJunk("那人", new Set(["那人"]))).toBe(true);
    expect(isDeicticJunk("众人", new Set(["那人"]))).toBe(false); // 契约名单外不再拦截
  });

  it("单字/空串规则始终保留（与 junkList 无关）", () => {
    expect(isDeicticJunk("王", new Set(["那人"]))).toBe(true);
    expect(isDeicticJunk("", new Set(["那人"]))).toBe(true);
  });

  it("DEFAULT_DEICTIC_JUNK 与既有名单一致", () => {
    expect(DEFAULT_DEICTIC_JUNK.has("众人")).toBe(true);
    expect(DEFAULT_DEICTIC_JUNK.has("那人")).toBe(true);
    expect(DEFAULT_DEICTIC_JUNK.has("老者")).toBe(true);
    expect(DEFAULT_DEICTIC_JUNK.has("人们")).toBe(true);
  });
});
