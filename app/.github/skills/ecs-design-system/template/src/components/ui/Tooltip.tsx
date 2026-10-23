import { forwardRef, type ReactNode } from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";
import { Button, type ButtonProps } from "./Button";

export const TooltipProvider = TooltipPrimitive.Provider;

/** A short label on hover and focus. Never the only place information lives. */
export function Tooltip({ content, children, side = "bottom" }: { content: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} collisionPadding={8}
          className="z-[60] max-w-64 rounded-[var(--radius-control)] bg-tooltip px-2 py-1 text-meta text-white shadow-[var(--shadow-float)] animate-in">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

/** Icon-only control: the label is both its accessible name and its tooltip. */
export const IconButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, "aria-label"> & { label: string; tooltip?: boolean }>(
  ({ label, tooltip = true, size = "icon", variant = "ghost", className, ...props }, ref) => {
    const button = <Button ref={ref} aria-label={label} size={size} variant={variant} className={cn(className)} {...props} />;
    return tooltip ? <Tooltip content={label}>{button}</Tooltip> : button;
  },
);
IconButton.displayName = "IconButton";
