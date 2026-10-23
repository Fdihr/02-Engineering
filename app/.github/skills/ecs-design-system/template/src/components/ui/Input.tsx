import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export const controlClass = cn(
  "w-full min-w-0 rounded-[var(--radius-control)] border border-control bg-canvas text-base text-ink sm:text-ui",
  "placeholder:text-ink-2 transition-[border-color] duration-[var(--t-fast)]",
  "hover:border-ink focus-visible:border-action focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-action",
  "disabled:cursor-not-allowed disabled:border-rule disabled:bg-sunken disabled:text-ink-2",
  "aria-[invalid=true]:border-fn-red",
);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => <input ref={ref} className={cn(controlClass, "h-9 px-3", className)} {...props} />,
);
Input.displayName = "Input";
