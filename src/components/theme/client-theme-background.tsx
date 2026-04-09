"use client";

import * as React from "react";
import * as ReactDOM from "react-dom";

import { ThemeBackground } from "./theme-background";

export function ClientThemeBackground() {
  const [container, setContainer] = React.useState<HTMLElement | null>(null);

  React.useEffect(() => {
    const element = document.createElement("div");
    element.setAttribute("data-theme-bg", "");
    element.setAttribute("aria-hidden", "true");
    element.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:0";
    document.body.appendChild(element);
    setContainer(element);

    return () => {
      document.body.removeChild(element);
    };
  }, []);

  if (!container) {
    return null;
  }

  return ReactDOM.createPortal(<ThemeBackground />, container);
}
