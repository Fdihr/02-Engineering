import type { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/** Level 01 table: white ground, a strong heading rule and light row rules; no boxes, no vertical rules. */
export function Table({ className, caption, children, ...props }: HTMLAttributes<HTMLTableElement> & { caption?: string }) {
  return (
    <div className="relative min-w-0 overflow-x-auto">
      <table className={cn("w-full border-collapse text-ui", className)} {...props}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function THead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn("[&_th]:border-b [&_th]:border-ink", className)} {...props} />;
}

export function TBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn("[&_td]:border-b [&_td]:border-rule", className)} {...props} />;
}

export function TR({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn("transition-colors duration-[var(--t-fast)] [&:has(td)]:hover:bg-hover", className)} {...props} />;
}

export function TH({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th scope="col" className={cn("whitespace-nowrap py-2 pr-4 text-left align-bottom text-meta font-medium text-ink-2 first:pl-0 last:pr-0", className)} {...props} />;
}

export function TD({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn("py-2.5 pr-4 align-top text-ui text-ink first:pl-0 last:pr-0", className)} {...props} />;
}
