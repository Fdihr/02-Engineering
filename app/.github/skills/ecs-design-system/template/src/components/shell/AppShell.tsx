import type { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui";
import { TopBar } from "./TopBar";

/** The shared frame: the Night Sky top bar and one working canvas on the brand grid (1,500 px content, 32 px gutters). */
export function AppShell({ children, fullBleed = false }: { children: ReactNode; fullBleed?: boolean }) {
  return (
    <TooltipProvider delayDuration={400} skipDelayDuration={200}>
      <div className="flex min-h-dvh flex-col bg-canvas">
        <TopBar />
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 outline-none">
          {fullBleed ? children : <div className="mx-auto w-full max-w-[1564px] px-4 pb-20 sm:px-6 lg:px-8">{children}</div>}
        </main>
      </div>
    </TooltipProvider>
  );
}