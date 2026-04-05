import * as React from "react";

/**
 * 业务断点定义：
 * - 小于 768 视为移动端；
 * - 与 Tailwind `md` 断点保持一致，避免“样式是桌面但逻辑判定为移动端”。
 */
const MOBILE_BREAKPOINT = 768;

/**
 * 文件定位（UI 层移动端判断 Hook）：
 * - 文件路径：`src/components/ui/use-mobile.tsx`
 * - 所属层次：UI 组件层辅助 Hook。
 *
 * 说明：
 * - 该 Hook 与 `src/hooks/use-mobile.ts` 逻辑等价，通常用于 UI 目录内就近引用；
 * - 属于历史兼容入口，后续可考虑统一收敛到单一实现（仅建议，当前不改行为）。
 */
export function useIsMobile() {
  /** `undefined` 表示尚未在客户端完成首次测量。 */
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined);

  React.useEffect(() => {
    // 浏览器端媒体查询监听：窗口尺寸变化时更新移动端判定。
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    };
    mql.addEventListener("change", onChange);
    // 初始化立即计算，避免首次渲染依赖异步事件回调。
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT);
    // 组件卸载时解绑监听，避免无效更新。
    return () => mql.removeEventListener("change", onChange);
  }, []);

  // 对外统一返回布尔值，降低调用方判空成本。
  return !!isMobile;
}
