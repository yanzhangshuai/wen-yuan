"use client";

import { useTheme } from "next-themes";
import { PaperTexture } from "./paper-texture";
import { MuseumGlow } from "./museum-glow";
import { StarDust } from "./star-dust";

/**
 * 氛围装饰层 — 按主题自动选择装饰效果
 * theme-01: 宣纸纹理
 * theme-02: 无装饰
 * theme-03: 展厅微光
 * theme-04: 星尘粒子
 */
export function DecorativeLayer() {
  const { theme } = useTheme();
  if (!theme) return null;

  switch (theme) {
    case "theme-01":
      return <PaperTexture />;
    case "theme-03":
      return <MuseumGlow />;
    case "theme-04":
      return <StarDust />;
    default:
      return null;
  }
}
