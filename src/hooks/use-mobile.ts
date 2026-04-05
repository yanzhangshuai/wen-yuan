import * as React from "react";

/**
 * 业务断点定义：
 * - 小于 768 视为移动端；
 * - 与 Tailwind 常用 `md` 起点对齐，保证样式与逻辑判断一致。
 */
const MOBILE_BREAKPOINT = 768;

/**
 * 文件定位（通用移动端判断 Hook）：
 * - 文件路径：`src/hooks/use-mobile.ts`
 * - 所属层次：前端通用 Hook 层。
 *
 * 核心职责：
 * - 在客户端监听视口变化并返回是否移动端；
 * - 为下游组件提供响应式逻辑分支依据（例如抽屉/弹窗切换）。
 *
 * React 语义：
 * - 初始值使用 `undefined`，避免首帧误判；
 * - 在 `useEffect` 中访问 `window`，确保仅客户端执行。
 */
export function useIsMobile() {
  /**
   * `isMobile` 状态语义：
   * - `undefined`：尚未完成客户端测量；
   * - `true/false`：已根据当前窗口宽度得出稳定结论。
   */
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    // 使用 matchMedia 监听断点变化，确保窗口尺寸变化时状态实时更新。
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    // 立即计算一次，避免仅依赖 change 事件导致首次渲染状态滞后。
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    // 清理监听，避免组件卸载后残留回调造成内存泄漏。
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // 对外只暴露布尔值：未初始化阶段按 false 处理，简化调用方分支复杂度。
  return !!isMobile;
}
