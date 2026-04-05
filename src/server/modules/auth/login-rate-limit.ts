/**
 * =============================================================================
 * 文件定位（登录风控：内存限流）
 * -----------------------------------------------------------------------------
 * 本文件属于 Auth 模块的“登录失败防暴力破解”子能力。
 *
 * 业务职责：
 * 1) 按客户端 IP 记录失败次数；
 * 2) 在固定时间窗内达到阈值时锁定登录；
 * 3) 登录成功后清理失败记录。
 *
 * 运行边界：
 * - 当前实现使用进程内 Map，仅对“单实例进程”有效；
 * - 多实例部署时各实例状态不共享，这是已知风险（建议后续迁移 Redis）。
 *
 * 业务规则说明（不是技术限制）：
 * - 5 分钟窗口内最多 10 次失败；
 * - 达到阈值后锁定 15 分钟；
 * - 锁定期间继续尝试会返回剩余等待秒数。
 * =============================================================================
 */
const FAILURE_WINDOW_MS = 5 * 60 * 1000;
const FAILURE_LIMIT = 10;
const LOCK_DURATION_MS = 15 * 60 * 1000;

interface LoginRateLimitState {
  /** 失败时间戳数组（毫秒）。用于滑动窗口统计。 */
  failures : number[];
  /** 锁定截止时间戳（毫秒）。<= now 表示未锁定。 */
  lockUntil: number;
}

/** 进程内 IP -> 状态映射。 */
const loginRateLimitMap = new Map<string, LoginRateLimitState>();

function pruneFailures(state: LoginRateLimitState, now: number): void {
  // 只保留窗口内的失败记录，避免旧失败永久影响用户。
  const threshold = now - FAILURE_WINDOW_MS;
  state.failures = state.failures.filter((timestamp) => timestamp >= threshold);
}

function getState(ip: string): LoginRateLimitState {
  const existing = loginRateLimitMap.get(ip);
  if (existing) {
    return existing;
  }

  // 首次出现的 IP 初始化为空状态。
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
  // 优先取标准代理头 x-forwarded-for 的第一个 IP（最接近用户侧来源）。
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  // 其次尝试 x-real-ip。
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  // 无法识别时统一归为 unknown，确保逻辑可继续执行。
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
    // 该 IP 从未失败过，不存在锁定。
    return null;
  }

  if (state.lockUntil <= now) {
    // 锁定已过期：清理锁定状态并裁剪失败窗口。
    state.lockUntil = 0;
    pruneFailures(state, now);
    // 状态为空时删除 map，避免内存泄漏。
    if (state.failures.length === 0) {
      loginRateLimitMap.delete(ip);
    }
    return null;
  }

  // 锁定中：返回至少 1 秒，避免前端出现 0 秒但仍锁定的体验跳变。
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
  // 每次写入前先裁剪旧失败，确保统计窗口准确。
  pruneFailures(state, now);

  if (state.lockUntil > now) {
    // 已在锁定期：不重复累加失败，直接返回剩余等待时间。
    return {
      locked           : true,
      retryAfterSeconds: Math.max(1, Math.ceil((state.lockUntil - now) / 1000))
    };
  }

  // 记录一次失败并再次裁剪（防御式写法，确保数组始终受窗口约束）。
  state.failures.push(now);
  pruneFailures(state, now);

  if (state.failures.length >= FAILURE_LIMIT) {
    // 达到阈值：进入锁定期并清空失败数组，避免解锁后立刻再次被旧记录锁住。
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
  // 登录成功后清空失败历史，体现“成功认证后重新开始计数”的业务策略。
  loginRateLimitMap.delete(ip);
}

export function resetLoginRateLimitForTests(): void {
  // 测试专用：每个测试用例前后清空全局状态，避免用例间相互污染。
  loginRateLimitMap.clear();
}
