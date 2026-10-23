import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

const tabClass = (on: boolean) =>
  cn(
    "relative inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap text-ui transition-colors duration-[var(--t-fast)]",
    "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:transition-colors",
    on ? "font-medium text-ink after:bg-action" : "text-ink-2 hover:text-ink after:bg-transparent",
  );

const listClass = "flex min-w-0 flex-wrap gap-x-6 border-b border-rule";

export interface TabItem {
  key: string;
  label: string;
  count?: number;
  /** Accepted for compatibility; tabs carry text only. */
  icon?: unknown;
  /** Accepted for compatibility; unfinished features are not flagged with warning chips. */
  wip?: boolean;
}

/** Tab panels on Radix (roving focus, arrow keys, aria wiring). Render one TabsContent per value. */
export function Tabs({
  items,
  value,
  onChange,
  className,
  children,
  label,
}: {
  items: TabItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
  children?: ReactNode;
  label?: string;
}) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={onChange} className={className}>
      <TabsPrimitive.List aria-label={label} className={listClass}>
        {items.map((item) => (
          <TabsPrimitive.Trigger key={item.key} value={item.key} className={tabClass(item.key === value)}>
            {item.label}
            {item.count !== undefined && <span className="figures font-normal text-ink-2">{item.count}</span>}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  );
}

export function TabsContent({ value, className, children }: { value: string; className?: string; children: ReactNode }) {
  return <TabsPrimitive.Content value={value} className={className}>{children}</TabsPrimitive.Content>;
}

/** Views that live in the URL are navigation, not tabs: links with aria-current. */
export function ViewTabs({ items, value, label, hrefFor }: { items: TabItem[]; value: string; label: string; hrefFor: (key: string) => string }) {
  return (
    <nav aria-label={label} className={listClass}>
      {items.map((item) => (
        <Link key={item.key} to={hrefFor(item.key)} replace aria-current={item.key === value ? "page" : undefined}
          className={cn(tabClass(item.key === value), "no-underline")}>
          {item.label}
          {item.count !== undefined && <span className="figures font-normal text-ink-2">{item.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

/** A filter whose options carry their counts. Toggle buttons, so state is announced. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: { value: T; label: string; count?: number; disabled?: boolean }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap gap-1", className)}>
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button key={option.value} type="button" aria-pressed={on} disabled={option.disabled} onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] border px-2.5 text-ui transition-colors duration-[var(--t-fast)]",
              on ? "border-action bg-tint font-medium text-ink" : "border-rule text-ink hover:border-control",
              "disabled:opacity-45",
            )}>
            {option.label}
            {option.count !== undefined && <span className="figures text-ink-2">{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
