import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "selected" | "caution" | "danger" | "done";

const tones: Record<Tone, string> = {
  neutral: "border-rule text-ink-2",
  selected: "border-action bg-tint text-ink",
  caution: "border-transparent bg-fn-yellow-tint text-ink",
  danger: "border-transparent bg-fn-red-tint text-ink",
  done: "border-transparent bg-fn-green-tint text-ink",
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
  /** Accepted for compatibility; meaning never rides on a coloured dot. */
  dot?: boolean;
}

/** A small rectangular tag. The words carry the meaning; tone only supports it. */
export function Badge({ className, tone = "neutral", dot: _dot, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex h-6 max-w-full shrink-0 items-center gap-1.5 truncate rounded-[var(--radius-control)] border px-2 text-meta",
        tones[tone],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}
