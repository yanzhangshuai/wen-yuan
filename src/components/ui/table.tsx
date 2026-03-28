import type {
  HTMLAttributes,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes
} from "react";

import { cn } from "@/lib/utils";

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {}
export interface TableSectionProps extends HTMLAttributes<HTMLTableSectionElement> {}
export interface TableRowProps extends HTMLAttributes<HTMLTableRowElement> {}
export interface TableHeadProps extends ThHTMLAttributes<HTMLTableCellElement> {}
export interface TableCellProps extends TdHTMLAttributes<HTMLTableCellElement> {}
export interface TableCaptionProps
  extends HTMLAttributes<HTMLTableCaptionElement> {}

export function Table({ className, ...props }: TableProps) {
  return (
    <div className="ui-table-wrapper w-full overflow-x-auto">
      <table className={cn("ui-table w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({ className, ...props }: TableSectionProps) {
  return <thead className={cn("ui-table-header [&_tr]:border-b", className)} {...props} />;
}

export function TableBody({ className, ...props }: TableSectionProps) {
  return (
    <tbody
      className={cn("ui-table-body [&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

export function TableFooter({ className, ...props }: TableSectionProps) {
  return (
    <tfoot
      className={cn(
        "ui-table-footer border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  );
}

export function TableRow({ className, ...props }: TableRowProps) {
  return (
    <tr
      className={cn(
        "ui-table-row border-b transition-colors hover:bg-muted/50",
        className
      )}
      {...props}
    />
  );
}

export function TableHead({ className, ...props }: TableHeadProps) {
  return (
    <th
      className={cn(
        "ui-table-head h-10 px-4 text-left align-middle font-medium text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export function TableCell({ className, ...props }: TableCellProps) {
  return (
    <td className={cn("ui-table-cell p-4 align-middle", className)} {...props} />
  );
}

export function TableCaption({ className, ...props }: TableCaptionProps) {
  return (
    <caption
      className={cn("ui-table-caption mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}
