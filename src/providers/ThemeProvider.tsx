"use client";

import { ThemeProvider as NextThemesProvider, ThemeProviderProps } from "next-themes";

/**
 * 功能：注入 next-themes 主题上下文。
 * 输入：ThemeProviderProps。
 * 输出：主题 Provider 组件。
 * 异常：无。
 * 副作用：向 html 注入 class（light/dark）并持久化用户主题偏好。
 */
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange {...props}>
      {children}
    </NextThemesProvider>
  );
}
