import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui";

export interface AppNotification {
  id: string;
  /** Short kind shown above the message, e.g. "Review", "Export ready". */
  kind: string;
  message: string;
  link: string;
}

/** Notifications on a Radix popover. The count badge is the one place the yellow "needs you" chip appears in the shell. */
export function Notifications({ items, error }: { items?: AppNotification[]; error?: boolean }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const list = items ?? [];
  const fresh = Math.max(0, list.length - seen);

  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (next) setSeen(list.length); }}>
      <PopoverTrigger
        aria-label={fresh ? `Notifications, ${fresh} new` : "Notifications"}
        className="relative grid size-9 place-items-center rounded-[var(--radius-control)] text-shell-ink-2 transition-colors hover:bg-white/10 hover:text-shell-ink"
      >
        <Bell className="size-[18px]" strokeWidth={1.75} aria-hidden="true" />
        {fresh > 0 && (
          <span aria-hidden="true" className="figures absolute -right-0.5 top-0.5 min-w-4 rounded-[3px] bg-fn-yellow px-1 text-center text-meta font-medium leading-4 text-on-yellow">
            {fresh > 9 ? "9+" : fresh}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(24rem,var(--radix-popover-content-available-width))] p-0">
        <div className="flex items-baseline justify-between px-4 pb-2 pt-3">
          <h2 className="text-label font-medium">Notifications</h2>
          {fresh > 0 && <span className="text-meta text-ink-2">{fresh} new</span>}
        </div>
        {error && !items ? (
          <p className="px-4 pb-4 text-ui text-ink-2">Notifications could not be loaded. They refresh every 30 seconds.</p>
        ) : list.length === 0 ? (
          <p className="px-4 pb-4 text-ui text-ink-2">Nothing needs your attention.</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto border-t border-rule">
            {list.map((item) => (
              <li key={item.id} className="border-b border-rule last:border-0">
                <button type="button" onClick={() => { setOpen(false); navigate(item.link); }} className="block w-full px-4 py-3 text-left hover:bg-hover">
                  <span className="block text-meta text-ink-2">{item.kind}</span>
                  <span className="block text-ui text-ink">{item.message}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}