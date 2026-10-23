import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A placeholder with the shape of the content it replaces. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn("rounded-[var(--radius-control)] bg-sunken [animation:shimmer_900ms_var(--ease)_infinite_alternate]", className)} {...props} />;
}

/** Text-line skeletons at the real line height. */
export function SkeletonLines({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden="true" className={cn("space-y-2", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className="h-3.5" style={{ width: `${index === lines - 1 ? 62 : 100 - index * 7}%` }} />
      ))}
    </div>
  );
}

/** Loading region: announces once and shows the content's shape. */
export function Loading({ label, children }: { label: string; children: ReactNode }) {
  return <div role="status" aria-live="polite"><span className="sr-only">{label}</span>{children}</div>;
}
