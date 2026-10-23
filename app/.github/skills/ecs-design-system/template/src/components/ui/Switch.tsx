import { cn } from "@/lib/utils";

/** A switch is a small control: it alone keeps a fully rounded track. */
export function Switch({
  checked,
  onChange,
  disabled,
  className,
  ariaLabel,
  id,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-10 shrink-0 items-center rounded-full border transition-colors duration-[var(--t-fast)]",
        checked ? "border-action bg-action" : "border-control bg-canvas",
        "disabled:opacity-45",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "inline-block size-4 rounded-full transition-transform duration-[var(--t-fast)] ease-[var(--ease)]",
          checked ? "translate-x-[19px] bg-on-action" : "translate-x-[3px] bg-control",
        )}
      />
    </button>
  );
}
