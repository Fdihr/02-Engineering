import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// The type scale (text-display … text-meta) are font sizes; without this, tailwind-merge reads them as
// colours and drops text-on-action and friends from the same class list.
const twMerge = extendTailwindMerge({
  extend: { classGroups: { "font-size": [{ text: ["display", "title", "heading", "label", "body", "ui", "meta"] }] } },
});

/** Merge conditional class names, resolving Tailwind conflicts. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
