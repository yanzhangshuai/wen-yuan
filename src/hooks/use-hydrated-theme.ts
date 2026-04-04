"use client";

import * as React from "react";
import { useTheme } from "next-themes";

import { THEME_IDS, type ThemeId } from "@/theme";

export interface HydratedThemeResult {
  theme        : string | undefined;
  setTheme     : (theme: string) => void;
  isHydrated   : boolean;
  selectedTheme: ThemeId | null;
}

const THEME_ID_SET = new Set<ThemeId>(THEME_IDS);

/**
 * 统一封装 next-themes 的 hydration 行为，避免各组件重复 mounted guard 导致首帧不一致。
 */
export function useHydratedTheme(): HydratedThemeResult {
  const { theme, setTheme } = useTheme();
  const [isHydrated, setIsHydrated] = React.useState(false);

  React.useEffect(() => {
    setIsHydrated(true);
  }, []);

  const selectedTheme = React.useMemo<ThemeId | null>(() => {
    if (!isHydrated || !theme || !THEME_ID_SET.has(theme as ThemeId)) {
      return null;
    }
    return theme as ThemeId;
  }, [isHydrated, theme]);

  return {
    theme,
    setTheme,
    isHydrated,
    selectedTheme
  };
}
