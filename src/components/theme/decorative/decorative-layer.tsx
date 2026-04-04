"use client";

import { useHydratedTheme } from "@/hooks/use-hydrated-theme";
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
  const { isHydrated, selectedTheme } = useHydratedTheme();
  if (!isHydrated || !selectedTheme) return null;

  switch (selectedTheme) {
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
