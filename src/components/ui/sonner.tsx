"use client";

import { useHydratedTheme } from "@/hooks/use-hydrated-theme";
import type { ThemeId } from "@/theme";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const LIGHT_THEME_SET = new Set<ThemeId>(["suya"]);

function mapToSonnerTheme(theme: ThemeId | null): ToasterProps["theme"] {
  if (!theme) return "dark";
  return LIGHT_THEME_SET.has(theme) ? "light" : "dark";
}

const Toaster = ({ ...props }: ToasterProps) => {
  const { selectedTheme } = useHydratedTheme();

  return (
    <Sonner
      theme={mapToSonnerTheme(selectedTheme)}
      className="toaster group"
      style={
        {
          "--normal-bg"    : "var(--popover)",
          "--normal-text"  : "var(--popover-foreground)",
          "--normal-border": "var(--border)"
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
