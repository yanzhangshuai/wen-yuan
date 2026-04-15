/**
 * D9 正则安全校验：防止 ReDoS 攻击与性能劣化。
 * 拦截超长模式、嵌套量词、编译超时三类风险。
 */

const NESTED_QUANTIFIER_PATTERN = /(\([^)]*[+*][^)]*\))[+*{]/;
const MAX_PATTERN_LENGTH = 200;

export function validateRegexSafety(pattern: string): { valid: boolean; error?: string } {
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return { valid: false, error: `正则表达式超过 ${MAX_PATTERN_LENGTH} 字符限制` };
  }
  if (NESTED_QUANTIFIER_PATTERN.test(pattern)) {
    return { valid: false, error: "正则表达式含嵌套量词（ReDoS 风险）" };
  }
  try {
    const start = Date.now();
    new RegExp(pattern, "u");
    if (Date.now() - start > 100) {
      return { valid: false, error: "正则编译超时（> 100ms）" };
    }
  } catch {
    return { valid: false, error: "正则语法不合法" };
  }
  return { valid: true };
}
