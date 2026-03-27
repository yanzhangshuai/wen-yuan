"use client";

import { useTheme } from "next-themes";
import { PaperTexture } from "./paper-texture";
import { MuseumGlow } from "./museum-glow";
import { StarDust } from "./star-dust";

/**
 * 氛围装饰层 — 按主题自动选择装饰效果
 * danqing:  宣纸纹理 + 朱砂微光
 * suya:     无装饰（素雅）
 * diancang: 展厅微光
 * xingkong: 星尘粒子 + 星云辉光
 */
export function DecorativeLayer() {
  const { resolvedTheme } = useTheme();
  if (!resolvedTheme) return null;

  switch (resolvedTheme) {
    case "danqing":
      return <PaperTexture />;
    case "diancang":
      return <MuseumGlow />;
    case "xingkong":
      return <StarDust />;
    default:
      return null;
  }
}
