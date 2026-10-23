import { forwardRef, type ComponentPropsWithoutRef, type ElementRef } from "react";
import { Command as CommandPrimitive } from "cmdk";
import { cn } from "@/lib/utils";
import { controlClass } from "./Input";

export const Command = forwardRef<ElementRef<typeof CommandPrimitive>, ComponentPropsWithoutRef<typeof CommandPrimitive>>(
  ({ className, ...props }, ref) => <CommandPrimitive ref={ref} className={cn("flex w-full flex-col", className)} {...props} />,
);
Command.displayName = "Command";

export const CommandInput = forwardRef<ElementRef<typeof CommandPrimitive.Input>, ComponentPropsWithoutRef<typeof CommandPrimitive.Input>>(
  ({ className, ...props }, ref) => <CommandPrimitive.Input ref={ref} className={cn(controlClass, "h-9 px-3", className)} {...props} />,
);
CommandInput.displayName = "CommandInput";

export const CommandList = forwardRef<ElementRef<typeof CommandPrimitive.List>, ComponentPropsWithoutRef<typeof CommandPrimitive.List>>(
  ({ className, ...props }, ref) => <CommandPrimitive.List ref={ref} className={cn("max-h-72 overflow-y-auto overscroll-contain", className)} {...props} />,
);
CommandList.displayName = "CommandList";

export const CommandGroup = forwardRef<ElementRef<typeof CommandPrimitive.Group>, ComponentPropsWithoutRef<typeof CommandPrimitive.Group>>(
  ({ className, ...props }, ref) => (
    <CommandPrimitive.Group ref={ref}
      className={cn("[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-meta [&_[cmdk-group-heading]]:text-ink-2", className)}
      {...props} />
  ),
);
CommandGroup.displayName = "CommandGroup";

export const CommandEmpty = CommandPrimitive.Empty;

export const CommandItem = forwardRef<ElementRef<typeof CommandPrimitive.Item>, ComponentPropsWithoutRef<typeof CommandPrimitive.Item>>(
  ({ className, ...props }, ref) => (
    <CommandPrimitive.Item ref={ref}
      className={cn(
        "flex min-h-10 cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)] px-2.5 py-1.5 text-ui",
        "data-[selected=true]:bg-hover data-[selected=true]:outline data-[selected=true]:outline-2 data-[selected=true]:-outline-offset-2 data-[selected=true]:outline-action data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-45 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-ink-2",
        className,
      )} {...props} />
  ),
);
CommandItem.displayName = "CommandItem";
