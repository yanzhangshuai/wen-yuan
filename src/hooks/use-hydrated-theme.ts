"use client";

import * as React from "react";
import { useTheme } from "next-themes";

import { THEME_IDS, type ThemeId } from "@/theme";

export interface HydratedThemeResult {
  /** next-themes 原始主题值（可能为系统态或未初始化态）。 */
  theme        : string | undefined;
  /** 主题切换函数，供调用方触发用户主题变更。 */
  setTheme     : (theme: string) => void;
  /** 是否已完成客户端 hydration。 */
  isHydrated   : boolean;
  /** 经过项目主题白名单过滤后的主题 ID；无效/未就绪时为 null。 */
  selectedTheme: ThemeId | null;
}

/**
 * 文件定位：
 * - 主题系统复用 Hook，属于前端“状态适配层”。
 * - 用于衔接 next-themes 与项目内部 ThemeId，统一处理 SSR 到 CSR 的 hydration 时序问题。
 */
const THEME_ID_SET = new Set<ThemeId>(THEME_IDS);

/**
 * 统一封装 next-themes 的 hydration 行为，避免各组件重复 mounted guard 导致首帧不一致。
 *
 * 业务场景：
 * - 在 Next.js App Router 中，服务端首屏无法直接安全读取浏览器主题偏好；
 * - 如果组件在 hydration 前直接使用 theme，容易出现“首帧主题闪烁”或服务端客户端不一致告警。
 *
 * @returns HydratedThemeResult
 * - `theme/setTheme`：保留 next-themes 原生能力；
 * - `isHydrated`：供调用方判断是否可安全读取主题；
 * - `selectedTheme`：仅返回项目认可的 ThemeId，避免非法字符串污染业务逻辑。
 */
export function useHydratedTheme(): HydratedThemeResult {
  const { theme, setTheme } = useTheme();
  // 默认 false：确保首帧先按“未水合”策略渲染，避免客户端接管前误用主题值。
  const [isHydrated, setIsHydrated] = React.useState(false);

  React.useEffect(() => {
    // useEffect 只在浏览器执行：用它标记“客户端已接管渲染”是最稳定的 hydration 判定方式。
    setIsHydrated(true);
  }, []);

  const selectedTheme = React.useMemo<ThemeId | null>(() => {
    // 防御性判空原因：
    // 1) 未 hydration 时 theme 可能并不可靠；
    // 2) theme 为空时代表尚未解析出用户偏好；
    // 3) theme 不在白名单时视为无效输入，避免下游样式分支失控。
    if (!isHydrated || !theme || !THEME_ID_SET.has(theme as ThemeId)) {
      return null;
    }
    // 到这里才认为是“可参与业务判断的合法主题”。
    return theme as ThemeId;
  }, [isHydrated, theme]);

  return {
    theme,
    setTheme,
    isHydrated,
    selectedTheme
  };
}
