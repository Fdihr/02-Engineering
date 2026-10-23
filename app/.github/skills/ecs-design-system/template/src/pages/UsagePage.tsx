import { useState } from "react";
import { AdminLayout } from "@/components/shell/AdminLayout";
import { DistributionBar } from "@/components/StateMark";
import { Facts, Section, Segmented, Table, TBody, TD, TH, THead, TR } from "@/components/ui";

const nf = new Intl.NumberFormat("en-GB");
type Period = "day" | "week" | "month";
const ROWS: Record<Period, { period: string; visits: number; visitors: number }[]> = {
  day: [{ period: "Mon 13 Oct 2026", visits: 412, visitors: 61 }, { period: "Sun 12 Oct 2026", visits: 98, visitors: 14 }],
  week: [{ period: "Week starting 13 Oct 2026", visits: 2310, visitors: 140 }, { period: "Week starting 6 Oct 2026", visits: 2104, visitors: 133 }],
  month: [{ period: "October 2026", visits: 8840, visitors: 210 }, { period: "September 2026", visits: 9120, visitors: 204 }],
};

/** Usage: figures as Facts and a ruled table. Never KPI tiles or cards. */
export function UsagePage() {
  const [period, setPeriod] = useState<Period>("day");
  return (
    <AdminLayout title="Usage" meta="Page views and visitors, in UTC.">
      <Section title="At a glance">
        <Facts items={[
          { label: "Total visits", value: <span className="figures">{nf.format(48210)}</span> },
          { label: "Unique users", value: <span className="figures">{nf.format(318)}</span> },
          { label: "Last 7 days", value: <span className="figures">{nf.format(2310)}</span> },
        ]} />
      </Section>
      <Section title="Assessment coverage" meta="How the latest items were assessed.">
        <DistributionBar value={{ compliant: 41, partial: 12, gap: 6, insufficient_evidence: 3, not_applicable: 8 }} className="max-w-xl" />
      </Section>
      <Section title="Visits" actions={
        <Segmented<Period> label="Group by" value={period} onChange={setPeriod}
          options={[{ value: "day", label: "Day" }, { value: "week", label: "Week" }, { value: "month", label: "Month" }]} />
      }>
        <Table caption="Visits by period">
          <THead><TR><TH>Period</TH><TH className="text-right">Visits</TH><TH className="text-right">Visitors</TH></TR></THead>
          <TBody>
            {ROWS[period].map((row) => (
              <TR key={row.period}>
                <TD>{row.period}</TD>
                <TD className="figures text-right">{nf.format(row.visits)}</TD>
                <TD className="figures text-right">{nf.format(row.visitors)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </Section>
    </AdminLayout>
  );
}
