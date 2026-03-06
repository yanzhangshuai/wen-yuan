import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "outline" | "ghost";
  children: ReactNode;
}

export function Button({ variant = "outline", className = "", children, ...props }: ButtonProps) {
  const variantClass =
    variant === "ghost"
      ? "border-transparent bg-transparent hover:bg-slate-100 dark:hover:bg-slate-800/70"
      : "border-slate-200 bg-white hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900/60 dark:hover:bg-slate-800/80";

  return (
    <button
      className={`ui-button inline-flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium text-slate-700 transition-colors disabled:cursor-not-allowed disabled:opacity-70 dark:text-slate-100 ${variantClass} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}
