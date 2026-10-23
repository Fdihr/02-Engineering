import type { StatusTone } from "@/components/StateMark";

/** Sample data for the example pages. Replace with your API (see lib/api.ts + TanStack Query). */
export interface Item {
  id: string;
  name: string;
  owner: string;
  tone: StatusTone;
  status: string;
  updated: string;
}

export const ITEMS: Item[] = [
  { id: "1", name: "Remote access for substation OT", owner: "jane.doe", tone: "attention", status: "Needs your answer", updated: "10:42" },
  { id: "2", name: "Cloud historian separation", owner: "lars.k", tone: "active", status: "Analysing", updated: "09:15" },
  { id: "3", name: "Operator account model", owner: "mia.s", tone: "done", status: "Done", updated: "Yesterday" },
  { id: "4", name: "Vendor jump host", owner: "jane.doe", tone: "waiting", status: "Waiting for review", updated: "Mon" },
  { id: "5", name: "Firmware signing pipeline", owner: "ole.h", tone: "failed", status: "Failed", updated: "12 Oct" },
];
