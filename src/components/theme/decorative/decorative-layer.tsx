"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { PaperTexture } from "./paper-texture";
import { SuyaBackground } from "./suya-background";
import { MuseumGlow } from "./museum-glow";
import { StarDust } from "./star-dust";

/**
 * 氛围装饰层 — 按主题自动选择装饰效果
 * danqing:  水墨纹理 + 朱砂光晕
 * suya:     宣纸纹理 + 竹青光晕
 * diancang: 黄铜渐变 + 回纹底纹
 * xingkong: Canvas 星空 + 流星
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
    case "suya":
      return <SuyaBackground />;
    case "diancang":
      return <MuseumGlow />;
    case "xingkong":
      return <StarDust />;
    default:
      return null;
  }
}
