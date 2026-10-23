import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { PageHeader } from "@/components/ui";
import { cn } from "@/lib/utils";
import { AppShell } from "./AppShell";
import { appConfig } from "@/app.config";

/** Fades the scrolled row's edges where more links sit out of view. */
function edgeFade(start: boolean, end: boolean) {
  if (!start && !end) return undefined;
  const mask = `linear-gradient(to right, ${start ? "transparent, #000 2rem" : "#000"}, ${end ? "#000 calc(100% - 2rem), transparent" : "#000"})`;
  return { maskImage: mask, WebkitMaskImage: mask };
}

/** The Administration area: one section navigation beside every admin page, a single scrolling row of links on narrow screens. */
export function AdminLayout({ title, meta, actions, children }: { title: ReactNode; meta?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const { pathname } = useLocation();
  const current = appConfig.adminSections.find((section) => pathname.startsWith(section.to));
  const rowRef = useRef<HTMLUListElement>(null);
  const currentRef = useRef<HTMLAnchorElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const update = () => {
      const start = row.scrollLeft > 1;
      const end = row.scrollWidth - row.scrollLeft - row.clientWidth > 1;
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    if (row.scrollWidth > row.clientWidth) currentRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
    update();
    row.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(row);
    return () => {
      row.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [current]);

  return (
    <AppShell>
      <div className="grid lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-x-12">
        <nav aria-label="Administration" className="-mx-2 min-w-0 pt-3 lg:sticky lg:top-14 lg:mx-0 lg:self-start lg:pt-9">
          <p className="hidden px-2 pb-2 text-meta text-ink-2 lg:block">Administration</p>
          <ul
            ref={rowRef}
            className="flex scroll-px-8 gap-x-1 overflow-x-auto lg:block lg:overflow-visible"
            style={edgeFade(edges.start, edges.end)}
          >
            {appConfig.adminSections.map((section) => {
              const on = section === current;
              return (
                <li key={section.to} className="shrink-0">
                  <Link
                    ref={on ? currentRef : undefined}
                    to={section.to}
                    aria-current={on ? "page" : undefined}
                    className={cn(
                      "flex min-h-9 items-center whitespace-nowrap rounded-[var(--radius-control)] px-2 text-ui no-underline transition-colors duration-[var(--t-fast)] max-lg:focus-visible:-outline-offset-2",
                      on ? "bg-tint font-medium text-ink" : "text-ink hover:bg-hover",
                    )}
                  >
                    {section.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0">
          <PageHeader title={title} meta={meta} actions={actions} />
          {children}
        </div>
      </div>
    </AppShell>
  );
}