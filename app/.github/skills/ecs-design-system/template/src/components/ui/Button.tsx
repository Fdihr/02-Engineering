import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Variant = "accent" | "outline" | "subtle" | "ghost" | "danger" | "inverse";
type Size = "sm" | "md" | "icon" | "icon-sm";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** accent = primary action; outline = secondary; ghost = quiet; danger = destructive; inverse = on the Night Sky shell. */
  variant?: Variant;
  size?: Size;
  /** Shows a working state without changing the label width. */
  loading?: boolean;
}

const variants: Record<Variant, string> = {
  accent: "bg-action text-on-action border border-action hover:bg-action-strong hover:border-action-strong",
  outline: "bg-canvas text-ink border border-control hover:bg-hover hover:border-ink",
  subtle: "bg-tint text-ink border border-transparent hover:border-action",
  ghost: "bg-transparent text-ink border border-transparent hover:bg-hover",
  danger: "bg-canvas text-fn-red border border-fn-red hover:bg-fn-red hover:text-canvas",
  inverse: "bg-transparent text-shell-ink border border-shell-rule hover:border-shell-ink hover:bg-white/10",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 gap-1.5 text-ui",
  md: "h-9 px-3.5 gap-2 text-ui",
  icon: "h-9 w-9",
  "icon-sm": "h-8 w-8",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "outline", size = "md", loading, disabled, children, ...props }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap rounded-[var(--radius-control)] font-medium",
        "transition-[background-color,border-color,color,scale] duration-[var(--t-fast)] ease-[var(--ease)] active:scale-[0.96]",
        "disabled:cursor-not-allowed disabled:opacity-45 disabled:active:scale-100",
        "[&_svg]:size-4 [&_svg]:shrink-0",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <>
          <span className="inline-flex items-center gap-[inherit] opacity-0">{children}</span>
          <span aria-hidden="true" className="absolute inset-0 flex items-center justify-center gap-1">
            <i className="size-1 animate-pulse rounded-full bg-current" />
            <i className="size-1 animate-pulse rounded-full bg-current [animation-delay:120ms]" />
            <i className="size-1 animate-pulse rounded-full bg-current [animation-delay:240ms]" />
          </span>
        </>
      ) : children}
    </button>
  ),
);
Button.displayName = "Button";
