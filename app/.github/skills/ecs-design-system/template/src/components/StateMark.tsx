import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export type MarkState = "compliant" | "partial" | "gap" | "insufficient_evidence" | "not_applicable";

export const STATE_LABEL: Record<MarkState, string> = {
  compliant: "Covered",
  partial: "Partial",
  gap: "Gap",
  insufficient_evidence: "Unclear",
  not_applicable: "Not applicable",
};

export const STATE_DESCRIPTION: Record<MarkState, string> = {
  compliant: "The evidence covers this item.",
  partial: "The evidence covers part of this item.",
  gap: "Nothing covers this item yet.",
  insufficient_evidence: "There is not enough evidence to tell.",
  not_applicable: "This item does not apply here.",
};

export const STATE_PLURAL: Record<MarkState, string> = {
  compliant: "covered",
  partial: "partial",
  gap: "gaps",
  insufficient_evidence: "unclear",
  not_applicable: "not applicable",
};

/** State as a mark in a fixed cell: filled, half, hollow with a yellow centre, dashed, dash. Always paired with words. */
export function StateMark({ state, className, withLabel, size = 12 }: { state: MarkState; className?: string; withLabel?: boolean; size?: number }) {
  const r = 5.25;
  const mark = (
    <svg viewBox="0 0 12 12" width={size} height={size} aria-hidden="true" className={cn("shrink-0", !withLabel && className)}>
      {state === "compliant" && <circle cx="6" cy="6" r={r + 0.75} fill="var(--covered)" />}
      {state === "partial" && <>
        <circle cx="6" cy="6" r={r} fill="none" stroke="var(--covered)" strokeWidth="1.5" />
        <path d="M6 0.75a5.25 5.25 0 0 0 0 10.5z" fill="var(--covered)" />
      </>}
      {state === "gap" && <>
        <circle cx="6" cy="6" r={r} fill="none" stroke="var(--covered)" strokeWidth="1.5" />
        <circle cx="6" cy="6" r="2.25" fill="var(--fn-yellow)" />
      </>}
      {state === "insufficient_evidence" && <circle cx="6" cy="6" r={r} fill="none" stroke="var(--covered)" strokeWidth="1.25" strokeDasharray="2.1 1.6" />}
      {state === "not_applicable" && <path d="M2 6h8" stroke="var(--ink-2)" strokeWidth="1.5" strokeLinecap="round" />}
    </svg>
  );
  if (!withLabel) return mark;
  return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>{mark}{STATE_LABEL[state]}</span>;
}

export type StatusTone = "done" | "active" | "waiting" | "attention" | "failed" | "neutral";

/**
 * Status of work and decisions (not assessment): the same 12-unit geometry as StateMark.
 * done filled · active ring with a blue centre · waiting hollow · attention ring with the yellow "needs you" centre ·
 * failed ring with a cross · neutral a dash. Always paired with the word; shape alone carries the state without colour.
 */
export function StatusMark({ tone, label, className, size = 12 }: { tone: StatusTone; label?: string; className?: string; size?: number }) {
  const ring = <circle cx="6" cy="6" r="5.25" fill="none" stroke={tone === "failed" ? "var(--fn-red)" : "var(--covered)"} strokeWidth="1.5" />;
  const mark = (
    <svg viewBox="0 0 12 12" width={size} height={size} aria-hidden="true" className={cn("shrink-0", !label && className)}>
      {tone === "done" && <circle cx="6" cy="6" r="6" fill="var(--covered)" />}
      {tone === "active" && <>{ring}<circle cx="6" cy="6" r="2.25" fill="var(--action)" /></>}
      {tone === "waiting" && ring}
      {tone === "attention" && <>{ring}<circle cx="6" cy="6" r="2.25" fill="var(--fn-yellow)" /></>}
      {tone === "failed" && <>{ring}<path d="M4 4l4 4M8 4l-4 4" stroke="var(--fn-red)" strokeWidth="1.5" strokeLinecap="round" /></>}
      {tone === "neutral" && <path d="M2 6h8" stroke="var(--ink-2)" strokeWidth="1.5" strokeLinecap="round" />}
    </svg>
  );
  if (!label) return mark;
  return <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", className)}>{mark}{label}</span>;
}

export interface Distribution {
  compliant: number;
  partial: number;
  gap: number;
  insufficient_evidence: number;
  not_applicable: number;
}

const SEGMENT_GAP = 2;
const labelText = (state: MarkState, count: number) => `${count} ${count === 1 ? STATE_LABEL[state].toLowerCase() : STATE_PLURAL[state]}`;
// Vestas Sans at 13 px averages about 7 px a character; labels only need to know when they would collide.
const estimateWidth = (text: string) => Math.ceil(text.length * 7) + 4;

/** Left edge for each label: under its own segment, pushed right only as far as needed to clear the previous label. */
export function placeLabels(width: number, segments: { value: number; text: string }[]) {
  const total = segments.reduce((sum, item) => sum + item.value, 0);
  const free = Math.max(0, width - SEGMENT_GAP * (segments.length - 1));
  let cursor = 0;
  let previousEnd = -Infinity;
  const out: { start: number; left: number; width: number }[] = [];
  for (const item of segments) {
    const start = cursor;
    cursor += (total ? (item.value / total) * free : 0) + SEGMENT_GAP;
    const w = estimateWidth(item.text);
    const left = Math.max(start, previousEnd + 16);
    out.push({ start, left, width: w });
    previousEnd = left + w;
  }
  return previousEnd <= width ? out : null;
}

/**
 * Applicable items on one honest scale: covered and partial carry ink, gaps are the absence.
 * Each count sits under its own segment, marked by a tick at the segment's start. Not applicable sits outside
 * the bar and is counted on its own line.
 */
export function DistributionBar({ value, className, compact }: { value: Distribution; className?: string; compact?: boolean }) {
  const applicable = value.compliant + value.partial + value.gap + value.insufficient_evidence;
  const order: MarkState[] = ["compliant", "partial", "gap", "insufficient_evidence"];
  const fill: Record<string, string> = {
    compliant: "bg-covered",
    partial: "bg-partial",
    gap: "bg-absent",
    insufficient_evidence: "bg-canvas outline-1 -outline-offset-1 outline-dashed outline-control",
  };
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || compact) return;
    setWidth(el.getBoundingClientRect().width);
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, [compact]);
  const shown = order.filter((state) => value[state] > 0);
  const placed = width > 0 ? placeLabels(width, shown.map((state) => ({ value: value[state], text: labelText(state, value[state]) }))) : null;
  return (
    <figure className={cn("min-w-0", className)}>
      <div ref={ref} className={cn("flex w-full gap-0.5", compact ? "h-1.5" : "h-3")} role="img"
        aria-label={`${value.compliant} covered, ${value.partial} partial, ${value.gap} gaps, ${value.insufficient_evidence} unclear, of ${applicable} applicable items; ${value.not_applicable} not applicable`}>
        {applicable === 0 ? <i className="flex-1 bg-absent" /> : shown.map((state) => (
          <i key={state} className={cn("block h-full min-w-0.5", fill[state])} style={{ flexGrow: value[state], flexBasis: 0 }} />
        ))}
      </div>
      {!compact && (placed ? (
        <figcaption aria-hidden="true" className="relative mt-1 h-7 text-meta text-ink-2">
          {shown.map((state, index) => (
            <span key={state}>
              <i className="absolute top-0 h-1.5 w-px bg-ink-2" style={{ left: placed[index].start }} />
              <span className="absolute top-2.5 whitespace-nowrap" style={{ left: placed[index].left }}>
                <b className="figures font-medium text-ink">{value[state]}</b> {value[state] === 1 ? STATE_LABEL[state].toLowerCase() : STATE_PLURAL[state]}
              </span>
            </span>
          ))}
        </figcaption>
      ) : (
        <figcaption aria-hidden="true" className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-meta text-ink-2">
          {shown.map((state) => (
            <span key={state} className="inline-flex items-center gap-1.5">
              <i aria-hidden="true" className={cn("inline-block h-2.5 w-3.5", fill[state])} /><b className="figures font-medium text-ink">{value[state]}</b> {value[state] === 1 ? STATE_LABEL[state].toLowerCase() : STATE_PLURAL[state]}
            </span>
          ))}
        </figcaption>
      ))}
      {!compact && value.not_applicable > 0 && (
        <p aria-hidden="true" className="mt-1 text-meta text-ink-2"><b className="figures font-medium text-ink">{value.not_applicable}</b> not applicable, outside the bar</p>
      )}
    </figure>
  );
}
