import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

/** One page header pattern: an optional parent link, the title, one line of meta, actions on the right. */
export function PageHeader({
  title,
  meta,
  parent,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  meta?: ReactNode;
  parent?: { to: string; label: string };
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end gap-x-6 gap-y-4 pb-6 pt-8", className)}>
      <div className="min-w-0 flex-1 basis-80">
        {parent && <Link to={parent.to} className="mb-1 inline-block text-meta text-ink-2 no-underline hover:text-ink hover:underline">{parent.label}</Link>}
        <h1 className="text-title font-light text-ink [overflow-wrap:anywhere]">{title}</h1>
        {meta && <div className="mt-1 text-meta text-ink-2">{meta}</div>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** A titled region separated by space and a rule, never by a box. */
export function Section({
  title,
  meta,
  actions,
  children,
  className,
  id,
  headingLevel = 2,
}: {
  title?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section id={id} aria-labelledby={title && id ? `${id}-title` : undefined} className={cn("pt-8", className)}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-end gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1">
            {title && <Heading id={id ? `${id}-title` : undefined} className={headingLevel === 2 ? "text-heading font-medium" : "text-label font-medium"}>{title}</Heading>}
            {meta && <div className="mt-0.5 text-meta text-ink-2">{meta}</div>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Label-value pairs in a strict two-column rhythm. */
export function Facts({ items, className }: { items: { label: ReactNode; value: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[minmax(7rem,auto)_minmax(0,1fr)] gap-x-4 gap-y-2 text-ui", className)}>
      {items.map((item, index) => (
        <div key={index} className="contents">
          <dt className="text-ink-2">{item.label}</dt>
          <dd className="min-w-0 text-ink [overflow-wrap:anywhere]">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Keyboard shortcut hint. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return <kbd className={cn("rounded-[3px] border border-current px-1 font-sans text-meta opacity-80", className)}>{children}</kbd>;
}
