/**
 * 统一拼接条件 className。
 * 这里保留最小实现而不引入额外依赖，足够覆盖当前后台页面的静态样式组合需求。
 */
export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}
