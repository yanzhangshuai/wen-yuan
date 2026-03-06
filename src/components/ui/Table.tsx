import type { ReactNode } from "react";

interface TableProps {
  head: ReactNode;
  body: ReactNode;
  className?: string;
}

export function Table({ head, body, className = "" }: TableProps) {
  return (
    <div className={`ui-table w-full overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-700/80 ${className}`.trim()}>
      <table className="min-w-[900px] w-full text-sm">
        <thead className="bg-slate-100/80 text-slate-500 dark:bg-slate-900/70 dark:text-slate-400">{head}</thead>
        <tbody className="bg-white text-slate-900 dark:bg-slate-900/40 dark:text-slate-100">{body}</tbody>
      </table>
    </div>
  );
}
