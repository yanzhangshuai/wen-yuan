"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";

interface ThemeToggleProps {}

export function ThemeToggle({}: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const isDark = (theme === "system" ? resolvedTheme : theme) === "dark";

  return (
    <Button
      type="button"
      onClick={() => (mounted ? setTheme(isDark ? "light" : "dark") : null)}
      className="theme-toggle h-9 w-9 p-0"
      aria-label="切换主题"
      title="切换亮暗色"
    >
      {mounted && isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
