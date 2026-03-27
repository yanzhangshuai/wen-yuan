import { afterEach, describe, expect, it } from "vitest";

import {
  clearLoginFailures,
  getLoginLockRetryAfterSeconds,
  recordLoginFailure,
  resetLoginRateLimitForTests,
  resolveClientIp
} from "@/server/modules/auth/login-rate-limit";

describe("login rate limit", () => {
  afterEach(() => {
    resetLoginRateLimitForTests();
  });

  it("resolves client ip from x-forwarded-for first value", () => {
    const headers = new Headers({
      "x-forwarded-for": " 10.1.1.1 , 10.1.1.2 ",
      "x-real-ip"      : "10.9.9.9"
    });

    expect(resolveClientIp(headers)).toBe("10.1.1.1");
  });

  it("falls back to x-real-ip when x-forwarded-for is unavailable", () => {
    const headers = new Headers({
      "x-real-ip": "10.2.2.2"
    });

    expect(resolveClientIp(headers)).toBe("10.2.2.2");
  });

  it("returns unknown when all ip headers are missing", () => {
    expect(resolveClientIp(new Headers())).toBe("unknown");
  });

  it("does not lock before the 10th failure and locks at the limit", () => {
    const ip = "203.0.113.10";
    const baseNow = 1_700_000_000_000;

    for (let i = 0; i < 9; i += 1) {
      const result = recordLoginFailure(ip, baseNow + i);
      expect(result).toEqual({
        locked           : false,
        retryAfterSeconds: null
      });
    }

    const lockedResult = recordLoginFailure(ip, baseNow + 9);
    expect(lockedResult.locked).toBe(true);
    expect(lockedResult.retryAfterSeconds).toBe(900);
  });

  it("returns retry-after while in lock window and auto-unlocks after expiration", () => {
    const ip = "203.0.113.11";
    const baseNow = 1_700_000_100_000;

    for (let i = 0; i < 10; i += 1) {
      recordLoginFailure(ip, baseNow + i);
    }

    expect(getLoginLockRetryAfterSeconds(ip, baseNow + 10)).toBe(900);
    expect(recordLoginFailure(ip, baseNow + 11)).toEqual({
      locked           : true,
      retryAfterSeconds: 900
    });

    expect(getLoginLockRetryAfterSeconds(ip, baseNow + 15 * 60 * 1000 + 20)).toBeNull();
    expect(recordLoginFailure(ip, baseNow + 15 * 60 * 1000 + 21)).toEqual({
      locked           : false,
      retryAfterSeconds: null
    });
  });

  it("prunes failures outside the 5-minute window", () => {
    const ip = "203.0.113.12";
    const baseNow = 1_700_000_200_000;

    for (let i = 0; i < 9; i += 1) {
      recordLoginFailure(ip, baseNow + i);
    }

    // Move beyond the failure window: previous 9 failures are pruned.
    const firstAfterWindow = recordLoginFailure(ip, baseNow + 5 * 60 * 1000 + 10);
    const secondAfterWindow = recordLoginFailure(ip, baseNow + 5 * 60 * 1000 + 11);

    expect(firstAfterWindow.locked).toBe(false);
    expect(secondAfterWindow.locked).toBe(false);
    expect(getLoginLockRetryAfterSeconds(ip, baseNow + 5 * 60 * 1000 + 12)).toBeNull();
  });

  it("clears failures manually after login success", () => {
    const ip = "203.0.113.13";
    const now = 1_700_000_300_000;

    for (let i = 0; i < 10; i += 1) {
      recordLoginFailure(ip, now + i);
    }

    expect(getLoginLockRetryAfterSeconds(ip, now + 20)).toBe(900);
    clearLoginFailures(ip);
    expect(getLoginLockRetryAfterSeconds(ip, now + 21)).toBeNull();
  });
});
