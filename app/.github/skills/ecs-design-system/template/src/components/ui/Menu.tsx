import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import * as MenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";
import { floatingClass } from "./Popover";

export const Menu = MenuPrimitive.Root;
export const MenuTrigger = MenuPrimitive.Trigger;
export const MenuGroup = MenuPrimitive.Group;

export const MenuContent = forwardRef<ElementRef<typeof MenuPrimitive.Content>, ComponentPropsWithoutRef<typeof MenuPrimitive.Content>>(
  ({ className, align = "end", sideOffset = 6, ...props }, ref) => (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content ref={ref} align={align} sideOffset={sideOffset} collisionPadding={8}
        className={cn(floatingClass, "min-w-52 p-1", className)} {...props} />
    </MenuPrimitive.Portal>
  ),
);
MenuContent.displayName = "MenuContent";

export const MenuItem = forwardRef<ElementRef<typeof MenuPrimitive.Item>, ComponentPropsWithoutRef<typeof MenuPrimitive.Item> & { destructive?: boolean }>(
  ({ className, destructive, ...props }, ref) => (
    <MenuPrimitive.Item ref={ref}
      className={cn(
        "flex min-h-9 cursor-pointer select-none items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 text-ui focus-visible:-outline-offset-2",
        "data-[highlighted]:bg-hover data-[disabled]:cursor-not-allowed data-[disabled]:opacity-45 [&_svg]:size-4 [&_svg]:text-ink-2",
        destructive && "text-fn-red [&_svg]:text-fn-red",
        className,
      )} {...props} />
  ),
);
MenuItem.displayName = "MenuItem";

export function MenuLabel({ className, ...props }: ComponentPropsWithoutRef<typeof MenuPrimitive.Label>) {
  return <MenuPrimitive.Label className={cn("px-2.5 pb-1 pt-2 text-meta text-ink-2", className)} {...props} />;
}

export function MenuSeparator({ className, ...props }: ComponentPropsWithoutRef<typeof MenuPrimitive.Separator>) {
  return <MenuPrimitive.Separator className={cn("my-1 h-px bg-rule", className)} {...props} />;
}
