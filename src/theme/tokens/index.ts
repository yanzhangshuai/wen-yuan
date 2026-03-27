import type { ThemeId } from "../constants";
import { danqing  } from "./danqing";
import { suya     } from "./suya";
import { diancang } from "./diancang";
import { xingkong } from "./xingkong";

export interface ThemeTokens {
  readonly id           : ThemeId;
  readonly label        : string;
  readonly factionColors: readonly string[];
}

export const THEME_TOKENS: Record<ThemeId, ThemeTokens> = {
  danqing : danqing,
  suya    : suya,
  diancang: diancang,
  xingkong: xingkong
};

export function getFactionColorsForTheme(theme: string | undefined): readonly string[] {
  if (theme && theme in THEME_TOKENS) {
    return THEME_TOKENS[theme as ThemeId].factionColors;
  }
  return THEME_TOKENS["suya"].factionColors;
}
