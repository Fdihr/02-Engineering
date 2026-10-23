import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Label above the control, optional hint, and an error that names the recovery. Wires ids and aria. */
export function Field({
  label,
  hint,
  error,
  optional,
  children,
  className,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  children: ReactElement;
  className?: string;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: (children.props as { id?: string }).id ?? id,
        "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined,
        "aria-invalid": error ? true : undefined,
      })
    : children;
  return (
    <div className={cn("min-w-0", className)}>
      <label htmlFor={(children.props as { id?: string }).id ?? id} className="mb-1.5 block text-ui font-medium text-ink">
        {label}
        {optional && <span className="font-normal text-ink-2"> (optional)</span>}
      </label>
      {control}
      {hint && <p id={hintId} className="mt-1.5 text-meta text-ink-2">{hint}</p>}
      {error && <p id={errorId} className="mt-1.5 text-meta text-fn-red">{error}</p>}
    </div>
  );
}
