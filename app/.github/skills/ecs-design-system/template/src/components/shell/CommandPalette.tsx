import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import { ArrowRight, Search } from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui";
import type { Destination } from "@/app.config";

/** Search and go to (Ctrl K). Add more CommandGroups for your own records (e.g. items by number). */
export function CommandPalette({ open, onOpenChange, destinations }: { open: boolean; onOpenChange: (open: boolean) => void; destinations: Destination[] }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  useEffect(() => { if (!open) setQuery(""); }, [open]);

  function go(to: string) {
    onOpenChange(false);
    navigate(to);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim animate-in" />
        <DialogPrimitive.Content aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 overflow-hidden rounded-[var(--radius-surface)] bg-canvas text-ink shadow-[var(--shadow-float)] float-in focus:outline-none">
          <DialogPrimitive.Title className="sr-only">Search or go to</DialogPrimitive.Title>
          <Command loop label="Search or go to">
            <div className="flex items-center gap-3 border-b border-rule px-4">
              <Search aria-hidden="true" strokeWidth={1.75} className="size-4 shrink-0 text-ink-2" />
              <CommandPrimitive.Input value={query} onValueChange={setQuery} placeholder="A page or a record"
                className="h-12 w-full bg-transparent text-body text-ink outline-none placeholder:text-ink-2" />
            </div>
            <CommandList className="max-h-[min(60dvh,26rem)] p-1">
              <CommandEmpty className="px-3 py-6 text-ui text-ink-2">Nothing matches. Try fewer words.</CommandEmpty>
              <CommandGroup heading="Go to">
                {destinations.map((item) => (
                  <CommandItem key={item.to} value={`${item.label} ${item.keywords ?? ""}`} onSelect={() => go(item.to)}>
                    <ArrowRight aria-hidden="true" />{item.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}