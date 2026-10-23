import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cn } from "@/lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;
export const PopoverClose = PopoverPrimitive.Close;

interface PopoverContentProps extends ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  /** Portal target, for content rendered inside another layer. */
  container?: HTMLElement | null;
}

export const floatingClass = "z-50 rounded-[var(--radius-surface)] bg-canvas text-ink shadow-[var(--shadow-float)] ring-1 ring-rule float-in outline-none";

export const PopoverContent = forwardRef<ElementRef<typeof PopoverPrimitive.Content>, PopoverContentProps>(
  ({ className, container, align = "start", sideOffset = 6, collisionPadding = 8, ...props }, ref) => (
    <PopoverPrimitive.Portal container={container ?? undefined}>
      <PopoverPrimitive.Content
        ref={ref}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          floatingClass,
          "overflow-y-auto overscroll-contain",
          "max-h-[min(var(--radix-popover-content-available-height),28rem)] w-[min(26rem,var(--radix-popover-content-available-width))]",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  ),
);
PopoverContent.displayName = "PopoverContent";
