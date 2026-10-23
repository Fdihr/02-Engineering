import type { ReactNode } from "react";
import { CircleAlert, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Empty, permission and first-run states: one sentence of what is true, one of what to do, one action.
 * A plain icon at text size, never an illustration.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  align = "start",
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
  align?: "start" | "center";
}) {
  return (
    <div className={cn("flex gap-4 py-10", align === "center" ? "flex-col items-center text-center" : "items-start", className)}>
      {Icon ? <Icon aria-hidden="true" strokeWidth={1.5} className="mt-0.5 size-6 shrink-0 text-ink-2" /> : null}
      <div className="min-w-0 max-w-[52ch]">
        <h3 className="text-label font-medium text-ink">{title}</h3>
        {description && <div className="mt-1 text-body text-ink-2">{description}</div>}
        {action && <div className={cn("mt-4 flex flex-wrap gap-2", align === "center" && "justify-center")}>{action}</div>}
      </div>
    </div>
  );
}

/** Error with its recovery. Never a dead end. */
export function ErrorState({ title, detail, action, className }: { title: string; detail?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div role="alert" className={cn("flex items-start gap-3 py-1", className)}>
      <CircleAlert aria-hidden="true" strokeWidth={1.75} className="mt-0.5 size-5 shrink-0 text-fn-red" />
      <div className="min-w-0">
        <p className="text-label font-medium text-ink">{title}</p>
        {detail && <div className="mt-0.5 text-ui text-ink-2">{detail}</div>}
        {action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}
