import { describe, it, expect } from "vitest";

import { assertConnectivityBaseUrlAllowed, isBlockedHost } from "./connectivity";

describe("isBlockedHost", () => {
  it("blocks localhost (case-insensitive)", () => {
    expect(isBlockedHost("localhost")).toBe(true);
    expect(isBlockedHost("LOCALHOST")).toBe(true);
    expect(isBlockedHost("Localhost")).toBe(true);
  });

  it("blocks loopback 127.x.x.x", () => {
    expect(isBlockedHost("127.0.0.1")).toBe(true);
    expect(isBlockedHost("127.255.255.255")).toBe(true);
    expect(isBlockedHost("127.0.0.0")).toBe(true);
  });

  it("blocks private class A 10.x.x.x", () => {
    expect(isBlockedHost("10.0.0.1")).toBe(true);
    expect(isBlockedHost("10.255.255.255")).toBe(true);
  });

  it("blocks private class B 172.16–31.x.x but not outside range", () => {
    expect(isBlockedHost("172.16.0.1")).toBe(true);
    expect(isBlockedHost("172.31.255.255")).toBe(true);
    expect(isBlockedHost("172.15.0.1")).toBe(false);
    expect(isBlockedHost("172.32.0.1")).toBe(false);
  });

  it("blocks private class C 192.168.x.x", () => {
    expect(isBlockedHost("192.168.0.1")).toBe(true);
    expect(isBlockedHost("192.168.255.255")).toBe(true);
  });

  it("blocks IPv6 loopback [::1]", () => {
    expect(isBlockedHost("[::1]")).toBe(true);
  });

  it("blocks 0.0.0.0", () => {
    expect(isBlockedHost("0.0.0.0")).toBe(true);
  });

  it("does not block public domains", () => {
    expect(isBlockedHost("api.deepseek.com")).toBe(false);
    expect(isBlockedHost("api.openai.com")).toBe(false);
    expect(isBlockedHost("generativelanguage.googleapis.com")).toBe(false);
  });

  it("does not block public IP addresses", () => {
    expect(isBlockedHost("8.8.8.8")).toBe(false);
    expect(isBlockedHost("1.1.1.1")).toBe(false);
  });
});

describe("assertConnectivityBaseUrlAllowed", () => {
  it("passes for a valid public HTTPS URL", () => {
    expect(() => assertConnectivityBaseUrlAllowed("https://api.deepseek.com")).not.toThrow();
    expect(() => assertConnectivityBaseUrlAllowed("https://api.openai.com/v1")).not.toThrow();
  });

  it("throws for non-HTTPS URLs", () => {
    expect(() => assertConnectivityBaseUrlAllowed("http://api.deepseek.com"))
      .toThrow("连通性测试仅支持 HTTPS BaseURL");
    expect(() => assertConnectivityBaseUrlAllowed("ftp://api.deepseek.com"))
      .toThrow("连通性测试仅支持 HTTPS BaseURL");
  });

  it("throws for an invalid URL", () => {
    expect(() => assertConnectivityBaseUrlAllowed("not-a-url")).toThrow("BaseURL 不合法");
    expect(() => assertConnectivityBaseUrlAllowed("")).toThrow("BaseURL 不合法");
  });

  it("throws when baseUrl points to a private IP", () => {
    expect(() => assertConnectivityBaseUrlAllowed("https://192.168.1.100"))
      .toThrow("连通性测试不允许访问内网地址");
    expect(() => assertConnectivityBaseUrlAllowed("https://10.0.0.1"))
      .toThrow("连通性测试不允许访问内网地址");
    expect(() => assertConnectivityBaseUrlAllowed("https://127.0.0.1"))
      .toThrow("连通性测试不允许访问内网地址");
  });

  it("throws when baseUrl points to localhost", () => {
    expect(() => assertConnectivityBaseUrlAllowed("https://localhost/v1"))
      .toThrow("连通性测试不允许访问内网地址");
  });

  it("throws when baseUrl points to IPv6 loopback [::1]", () => {
    expect(() => assertConnectivityBaseUrlAllowed("https://[::1]/v1"))
      .toThrow("连通性测试不允许访问内网地址");
  });
});
