import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
}

export function Card({ children, className = "" }: CardProps) {
  return (
    <section
      className={`ui-card rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-700/80 dark:bg-slate-900/50 ${className}`.trim()}
    >
      {children}
    </section>
  );
}
