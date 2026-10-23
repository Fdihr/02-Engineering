import { forwardRef, type SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { controlClass } from "./Input";

/** Native select: the platform's own accessible listbox, styled to the system. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <div className="relative min-w-0">
      <select ref={ref} className={cn(controlClass, "h-9 appearance-none pl-3 pr-9", className)} {...props}>
        {children}
      </select>
      <ChevronDown aria-hidden="true" strokeWidth={1.75} className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-ink-2" />
    </div>
  ),
);
Select.displayName = "Select";
