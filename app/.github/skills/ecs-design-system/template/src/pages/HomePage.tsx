import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui";
import { StatusMark } from "@/components/StateMark";
import { ITEMS } from "./sample-data";

const STARTERS = ["Start a new review", "Import items from a spreadsheet", "Invite a colleague"];

/** Home: one light question, a 7:5 split, rows divided by rules. No cards, no KPI tiles. */
export function HomePage() {
  const waiting = ITEMS.filter((item) => item.tone === "attention" || item.tone === "waiting");
  return (
    <AppShell>
      <div className="grid gap-x-16 gap-y-12 pt-12 lg:grid-cols-[minmax(0,7fr)_minmax(20rem,5fr)] lg:pt-16">
        <section aria-labelledby="home-question" className="min-w-0">
          <h1 id="home-question" className="text-display font-light text-ink">What are you working on?</h1>
          <p className="mt-4 max-w-[60ch] text-body text-ink-2">Pick up where you left off, or start something new.</p>
          <div className="mt-6"><Button variant="accent">New item</Button></div>
          <ul className="mt-10 border-t border-rule" aria-label="Quick starts">
            {STARTERS.map((starter) => (
              <li key={starter} className="border-b border-rule">
                <button type="button" className="flex min-h-11 w-full items-center gap-3 py-2.5 text-left text-ui text-ink hover:text-action">
                  <span className="min-w-0 flex-1">{starter}</span>
                  <ArrowRight aria-hidden="true" strokeWidth={1.75} className="size-4 shrink-0 text-ink-2" />
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="your-work" className="min-w-0">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 id="your-work" className="text-heading font-medium">Your work</h2>
            <Link to="/items" className="text-ui text-action no-underline hover:underline">All items</Link>
          </div>
          <ul className="border-t border-rule">
            {ITEMS.map((item) => (
              <li key={item.id} className="relative grid grid-cols-[1.5rem_minmax(0,1fr)_auto] gap-x-2 border-b border-rule py-3 hover:bg-hover">
                <span className="flex h-[1.375rem] items-center"><StatusMark tone={item.tone} /></span>
                <div className="min-w-0">
                  <Link to="/items" className="block truncate text-label font-medium text-ink no-underline after:absolute after:inset-0">{item.name}</Link>
                  <p className="mt-0.5 text-meta text-ink-2">{item.status}</p>
                </div>
                <span className="figures pt-0.5 text-right text-meta text-ink-2">{item.updated}</span>
              </li>
            ))}
          </ul>
          {waiting.length > 0 && (
            <p className="mt-6 text-ui text-ink"><span className="figures font-medium">{waiting.length}</span> items are waiting for you.</p>
          )}
        </section>
      </div>
    </AppShell>
  );
}
