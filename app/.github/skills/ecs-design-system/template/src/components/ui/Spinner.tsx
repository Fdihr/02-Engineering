import { cn } from "@/lib/utils";

/** Three quiet dots for short waits inside controls. Longer waits show their real stage instead. */
export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-1 text-ink-2", className)}>
      <span className="sr-only">{label}</span>
      <i aria-hidden="true" className="size-1 animate-pulse rounded-full bg-current" />
      <i aria-hidden="true" className="size-1 animate-pulse rounded-full bg-current [animation-delay:120ms]" />
      <i aria-hidden="true" className="size-1 animate-pulse rounded-full bg-current [animation-delay:240ms]" />
    </span>
  );
}
