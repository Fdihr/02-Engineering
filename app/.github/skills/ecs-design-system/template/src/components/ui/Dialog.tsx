import type { ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as AlertPrimitive from "@radix-ui/react-alert-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";

const overlay = "fixed inset-0 z-50 bg-scrim animate-in";
const panel =
  "fixed left-1/2 top-[8vh] z-50 flex max-h-[84dvh] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 flex-col rounded-[var(--radius-surface)] bg-canvas text-ink shadow-[var(--shadow-float)] float-in focus:outline-none";

/** Modal dialog on Radix: focus trap, Escape, focus return and aria are handled by the primitive. */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  ariaLabel,
  onCloseAutoFocus,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  className?: string;
  ariaLabel?: string;
  onCloseAutoFocus?: (event: Event) => void;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlay} />
        <DialogPrimitive.Content
          className={cn(panel, className)}
          aria-label={ariaLabel}
          onCloseAutoFocus={onCloseAutoFocus}
          {...(description ? {} : { "aria-describedby": undefined })}
          onOpenAutoFocus={(event) => {
            const first = (event.currentTarget as HTMLElement | null)?.querySelector<HTMLElement>("[data-autofocus], input:not([type=hidden]):not([type=file]):not([tabindex=\"-1\"]):not([aria-hidden=true]):not(:disabled), textarea:not(:disabled), select:not(:disabled)");
            if (first) { event.preventDefault(); first.focus(); }
          }}
        >
          <div className="flex items-start gap-4 px-6 pb-2 pt-5">
            <div className="min-w-0 flex-1">
              {title ? <DialogPrimitive.Title className="text-heading font-medium">{title}</DialogPrimitive.Title>
                : <DialogPrimitive.Title className="sr-only">{ariaLabel ?? "Dialog"}</DialogPrimitive.Title>}
              {description && <DialogPrimitive.Description className="mt-1 text-ui text-ink-2">{description}</DialogPrimitive.Description>}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Close" className="-mr-2 -mt-1"><X strokeWidth={1.75} /></Button>
            </DialogPrimitive.Close>
          </div>
          {children && <div className="min-h-0 flex-1 overflow-y-auto px-6 py-3">{children}</div>}
          {footer && <div className="flex flex-wrap items-center justify-end gap-2 px-6 pb-5 pt-3">{footer}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Confirmation before a consequential change. Destructive confirmations read differently and focus Cancel. */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title = "Are you sure?",
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  busy,
  children,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  children?: ReactNode;
}) {
  return (
    <AlertPrimitive.Root open={open} onOpenChange={(next) => { if (!next && !busy) onClose(); }}>
      <AlertPrimitive.Portal>
        <AlertPrimitive.Overlay className={overlay} />
        <AlertPrimitive.Content className={cn(panel, "max-w-md px-6 pb-5 pt-5")}>
          <AlertPrimitive.Title className="text-heading font-medium">{title}</AlertPrimitive.Title>
          {description ? <AlertPrimitive.Description asChild><div className="mt-2 text-body text-ink-2">{description}</div></AlertPrimitive.Description>
            : <AlertPrimitive.Description className="sr-only">{title}</AlertPrimitive.Description>}
          {children && <div className="mt-3">{children}</div>}
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <AlertPrimitive.Cancel asChild><Button disabled={busy}>{cancelLabel}</Button></AlertPrimitive.Cancel>
            <Button variant={destructive ? "danger" : "accent"} loading={busy} onClick={onConfirm}>{confirmLabel}</Button>
          </div>
        </AlertPrimitive.Content>
      </AlertPrimitive.Portal>
    </AlertPrimitive.Root>
  );
}

/** Side sheet for navigation and previews on narrow screens. */
export function Sheet({
  open,
  onClose,
  side = "end",
  label,
  children,
  className,
}: {
  open: boolean;
  onClose: () => void;
  side?: "start" | "end";
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={overlay} />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed inset-y-0 z-50 flex w-[min(24rem,100vw)] flex-col bg-canvas text-ink shadow-[var(--shadow-float)] focus:outline-none",
            side === "start" ? "left-0 [animation:sheet-in-start_var(--t-panel)_var(--ease)_both]" : "right-0 [animation:sheet-in-end_var(--t-panel)_var(--ease)_both]",
            className,
          )}
        >
          <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const SheetClose = DialogPrimitive.Close;
