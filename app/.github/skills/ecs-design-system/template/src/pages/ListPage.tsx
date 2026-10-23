import { useMemo, useState } from "react";
import { Inbox, Plus, Search } from "lucide-react";
import { AppShell } from "@/components/shell/AppShell";
import { StatusMark } from "@/components/StateMark";
import {
  Button, ConfirmDialog, EmptyState, ErrorState, Input, Menu, MenuContent, MenuItem, MenuTrigger, IconButton,
  PageHeader, Segmented, SkeletonLines, Table, TBody, TD, TH, THead, TR, useToast,
} from "@/components/ui";
import { MoreHorizontal } from "lucide-react";
import { ITEMS, type Item } from "./sample-data";

type Filter = "all" | "mine" | "attention";

/** List page: header with one accent action, counts in the filter, a ruled table, and every state (loading, empty, error). */
export function ListPage() {
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [removing, setRemoving] = useState<Item | null>(null);
  // Swap these for a TanStack Query result: { isLoading, error, data }.
  const isLoading = false;
  const error: Error | null = null as Error | null;

  const counts = {
    all: ITEMS.length,
    mine: ITEMS.filter((i) => i.owner === "jane.doe").length,
    attention: ITEMS.filter((i) => i.tone === "attention" || i.tone === "failed").length,
  };
  const rows = useMemo(() => ITEMS
    .filter((i) => filter === "all" || (filter === "mine" ? i.owner === "jane.doe" : i.tone === "attention" || i.tone === "failed"))
    .filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase())), [filter, query]);

  return (
    <AppShell>
      <PageHeader
        title="Items"
        meta={<><span className="figures">{ITEMS.length}</span> items, sorted by last change</>}
        actions={<Button variant="accent"><Plus aria-hidden="true" />New item</Button>}
      />
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Segmented<Filter>
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "mine", label: "Mine", count: counts.mine },
            { value: "attention", label: "Needs attention", count: counts.attention },
          ]}
        />
        <div className="relative ml-auto w-full sm:w-72">
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-2" />
          <Input aria-label="Filter items" placeholder="Filter by name" value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
      </div>

      <div className="mt-6">
        {isLoading ? <SkeletonLines lines={6} /> : error ? (
          <ErrorState title="Items could not be loaded" detail={error.message} action={<Button>Try again</Button>} />
        ) : rows.length === 0 ? (
          <EmptyState icon={Inbox} title="No items match" description="Clear the filter or choose another view." action={<Button onClick={() => { setQuery(""); setFilter("all"); }}>Clear filter</Button>} />
        ) : (
          <Table caption="Items">
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Status</TH>
                <TH>Owner</TH>
                <TH className="text-right">Updated</TH>
                <TH><span className="sr-only">Actions</span></TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((item) => (
                <TR key={item.id}>
                  <TD className="font-medium">{item.name}</TD>
                  <TD><StatusMark tone={item.tone} label={item.status} /></TD>
                  <TD className="text-ink-2">{item.owner}</TD>
                  <TD className="figures text-right text-ink-2">{item.updated}</TD>
                  <TD className="w-10 text-right">
                    <Menu>
                      <MenuTrigger asChild><IconButton label={`Actions for ${item.name}`} variant="ghost" size="icon-sm"><MoreHorizontal aria-hidden="true" /></IconButton></MenuTrigger>
                      <MenuContent align="end">
                        <MenuItem onSelect={() => toast(`Opened ${item.name}`, "info")}>Open</MenuItem>
                        <MenuItem destructive onSelect={() => setRemoving(item)}>Delete</MenuItem>
                      </MenuContent>
                    </Menu>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => { toast(`${removing?.name} deleted`, "success"); setRemoving(null); }}
        title="Delete this item?"
        description={<>Confirming deletes <strong className="font-medium">{removing?.name}</strong> and its history. This cannot be undone.</>}
        confirmLabel="Delete item"
        destructive
      />
    </AppShell>
  );
}
