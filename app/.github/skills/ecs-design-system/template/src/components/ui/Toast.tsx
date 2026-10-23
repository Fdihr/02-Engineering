import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastType = "success" | "error" | "info";
interface Toast { id: number; message: string; type: ToastType; }

const ToastCtx = createContext<(message: string, type?: ToastType) => void>(() => {});

/** `const toast = useToast(); toast("Saved", "success")`. Errors stay until dismissed. */
export function useToast() {
  return useContext(ToastCtx);
}

const LABEL: Record<ToastType, string> = { success: "Done", error: "Problem", info: "Note" };

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((message: string, type: ToastType = "success") => {
    setToasts((list) => [...list, { id: Date.now() + Math.random(), message, type }]);
  }, []);
  const drop = (id: number) => setToasts((list) => list.filter((toast) => toast.id !== id));

  return (
    <ToastCtx.Provider value={push}>
      <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
        {children}
        {toasts.map((toast) => (
          <ToastPrimitive.Root key={toast.id} type={toast.type === "error" ? "foreground" : "background"}
            duration={toast.type === "error" ? Infinity : 5000}
            onOpenChange={(open) => { if (!open) drop(toast.id); }}
            className={cn(
              "flex items-start gap-3 rounded-[var(--radius-surface)] bg-canvas py-3 pl-4 pr-2 text-ui text-ink shadow-[var(--shadow-float)] ring-1 ring-rule float-in",
              "data-[state=closed]:animate-out data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]",
            )}>
            <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full",
              toast.type === "error" ? "bg-fn-red" : toast.type === "success" ? "bg-fn-green" : "bg-ink-2")} />
            <ToastPrimitive.Description className="min-w-0 flex-1">
              <span className="sr-only">{LABEL[toast.type]}: </span>{toast.message}
            </ToastPrimitive.Description>
            <ToastPrimitive.Close aria-label="Dismiss" className="-my-1 grid size-8 shrink-0 place-items-center rounded-[var(--radius-control)] text-ink-2 hover:bg-hover hover:text-ink">
              <X className="size-4" strokeWidth={1.75} />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[70] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" />
      </ToastPrimitive.Provider>
    </ToastCtx.Provider>
  );
}
