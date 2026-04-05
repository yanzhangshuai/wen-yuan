import { afterEach, describe, expect, it } from "vitest";

import {
  clearLoginFailures,
  getLoginLockRetryAfterSeconds,
  recordLoginFailure,
  resetLoginRateLimitForTests,
  resolveClientIp
} from "@/server/modules/auth/login-rate-limit";

/**
 * 文件定位（认证安全策略单测）：
 * - 覆盖登录失败限流算法，属于服务端安全防护层，不依赖页面渲染。
 * - 该模块通常在登录接口中被调用，用于对同一来源 IP 的失败尝试进行窗口统计与锁定。
 *
 * 关键业务规则（非技术限制）：
 * - 5 分钟窗口内累计失败达阈值（第 10 次）触发锁定。
 * - 锁定时长 15 分钟，窗口过后自动解锁。
 * - 登录成功后可手动清空失败记录，恢复正常登录体验。
 */
describe("login rate limit", () => {
  afterEach(() => {
    // 测试隔离：每个用例后重置内存态，确保时间窗口与失败计数互不干扰。
    resetLoginRateLimitForTests();
  });

  it("resolves client ip from x-forwarded-for first value", () => {
    // 网关场景：代理链路下应优先取 `x-forwarded-for` 的第一个真实来源 IP。
    const headers = new Headers({
      "x-forwarded-for": " 10.1.1.1 , 10.1.1.2 ",
      "x-real-ip"      : "10.9.9.9"
    });

    expect(resolveClientIp(headers)).toBe("10.1.1.1");
  });

  it("falls back to x-real-ip when x-forwarded-for is unavailable", () => {
    // 兼容场景：部分部署环境仅透传 `x-real-ip`，此时应回退读取该头。
    const headers = new Headers({
      "x-real-ip": "10.2.2.2"
    });

    expect(resolveClientIp(headers)).toBe("10.2.2.2");
  });

  it("returns unknown when all ip headers are missing", () => {
    // 防御语义：缺少 IP 头时返回 `unknown`，保证限流键生成过程可继续，不因空值崩溃。
    expect(resolveClientIp(new Headers())).toBe("unknown");
  });

  it("does not lock before the 10th failure and locks at the limit", () => {
    // 阈值分支：前 9 次失败仅记录，第 10 次触发锁定并返回 retry-after。
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
    // 生命周期分支：锁定期间持续返回剩余等待；过期后自动清锁并允许重新计数。
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
    // 窗口裁剪分支：超过失败统计窗口的历史记录必须被剔除，避免“永久累积导致永远锁定”。
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
    // 成功登录回收：登录成功后清空失败计数，避免用户在短期内再次触发不必要锁定。
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
