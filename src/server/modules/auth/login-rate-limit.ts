const FAILURE_WINDOW_MS = 5 * 60 * 1000;
const FAILURE_LIMIT = 10;
const LOCK_DURATION_MS = 15 * 60 * 1000;

interface LoginRateLimitState {
  failures : number[];
  lockUntil: number;
}

const loginRateLimitMap = new Map<string, LoginRateLimitState>();

function pruneFailures(state: LoginRateLimitState, now: number): void {
  const threshold = now - FAILURE_WINDOW_MS;
  state.failures = state.failures.filter((timestamp) => timestamp >= threshold);
}

function getState(ip: string): LoginRateLimitState {
  const existing = loginRateLimitMap.get(ip);
  if (existing) {
    return existing;
  }

  const initialState: LoginRateLimitState = {
    failures : [],
    lockUntil: 0
  };
  loginRateLimitMap.set(ip, initialState);
  return initialState;
}

/**
 * 功能：从请求头提取客户端 IP，用于登录失败限流。
 * 输入：请求头。
 * 输出：IP 字符串（无法识别时回退 unknown）。
 * 异常：无。
 * 副作用：无。
 */
export function resolveClientIp(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  return "unknown";
}

/**
 * 功能：检查当前 IP 是否已被登录失败策略锁定。
 * 输入：ip、当前毫秒时间戳（默认 Date.now）。
 * 输出：若锁定返回剩余秒数，否则返回 null。
 * 异常：无。
 * 副作用：无。
 */
export function getLoginLockRetryAfterSeconds(
  ip: string,
  now = Date.now()
): number | null {
  const state = loginRateLimitMap.get(ip);
  if (!state) {
    return null;
  }

  if (state.lockUntil <= now) {
    state.lockUntil = 0;
    pruneFailures(state, now);
    if (state.failures.length === 0) {
      loginRateLimitMap.delete(ip);
    }
    return null;
  }

  return Math.max(1, Math.ceil((state.lockUntil - now) / 1000));
}

/**
 * 功能：记录一次登录失败，并在达到阈值后触发锁定。
 * 输入：ip、当前毫秒时间戳（默认 Date.now）。
 * 输出：当前是否进入锁定态与重试秒数。
 * 异常：无。
 * 副作用：更新内存限流状态。
 */
export function recordLoginFailure(
  ip: string,
  now = Date.now()
): { locked: boolean; retryAfterSeconds: number | null } {
  const state = getState(ip);
  pruneFailures(state, now);

  if (state.lockUntil > now) {
    return {
      locked           : true,
      retryAfterSeconds: Math.max(1, Math.ceil((state.lockUntil - now) / 1000))
    };
  }

  state.failures.push(now);
  pruneFailures(state, now);

  if (state.failures.length >= FAILURE_LIMIT) {
    state.lockUntil = now + LOCK_DURATION_MS;
    state.failures = [];

    return {
      locked           : true,
      retryAfterSeconds: Math.max(1, Math.ceil(LOCK_DURATION_MS / 1000))
    };
  }

  return {
    locked           : false,
    retryAfterSeconds: null
  };
}

/**
 * 功能：登录成功后清理该 IP 的失败记录。
 * 输入：ip。
 * 输出：无。
 * 异常：无。
 * 副作用：移除内存中的限流状态。
 */
export function clearLoginFailures(ip: string): void {
  loginRateLimitMap.delete(ip);
}

export function resetLoginRateLimitForTests(): void {
  loginRateLimitMap.clear();
}
