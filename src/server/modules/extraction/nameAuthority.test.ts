import { describe, expect, it } from "vitest";
import { isDeicticJunk } from "./nameAuthority.ts";

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
