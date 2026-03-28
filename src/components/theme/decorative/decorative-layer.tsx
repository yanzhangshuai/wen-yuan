"use client";

import * as React from "react";
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
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || !resolvedTheme) return null;

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
