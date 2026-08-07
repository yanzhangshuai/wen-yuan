import { describe, expect, it } from "vitest";
import { aliasSafetyLevel, isGenericJunk, isNicknameOrTitle, pickCanonical } from "./nameAuthority.ts";

describe("aliasSafetyLevel", () => {
  it("泛称硬屏蔽", () => {
    expect(aliasSafetyLevel("老爷")).toBe(0);
    expect(aliasSafetyLevel("母亲")).toBe(0);
    expect(aliasSafetyLevel("众人")).toBe(0);
  });
  it("安全级别 2", () => {
    expect(aliasSafetyLevel("范进")).toBe(2);
    expect(aliasSafetyLevel("周学道")).toBe(2);
  });
});

describe("pickCanonical", () => {
  const freq = new Map([["范进", 50], ["范老爷", 30], ["范举人", 10]]);
  it("最短高频优先", () => {
    expect(pickCanonical(["范老爷", "范进", "范举人"], freq)).toBe("范进");
  });
  it("屏蔽名不选为 canonical", () => {
    expect(pickCanonical(["老爷", "范进"], freq)).toBe("范进");
  });
});

describe("isGenericJunk", () => {
  it("泛称/单字为垃圾", () => {
    expect(isGenericJunk("老爷")).toBe(true);
    expect(isGenericJunk("王")).toBe(true);
    expect(isGenericJunk("范进")).toBe(false);
  });
});

describe("isNicknameOrTitle", () => {
  it("称谓降级", () => {
    expect(isNicknameOrTitle("范老爷")).toBe(true); // 姓+称谓
    expect(isNicknameOrTitle("周学道")).toBe(true); // 姓+官职
    expect(isNicknameOrTitle("范进")).toBe(false); // 真名
    expect(isNicknameOrTitle("诸葛亮")).toBe(false); // 三字真名
  });
});
