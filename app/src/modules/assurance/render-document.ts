import type { SourceDocument } from "../../core/types.js";

/** Segment markers are prompt framing only; they are never part of segment text. */
export const renderDocumentForPrompt = (document: SourceDocument): string =>
  document.segments
    .map((segment) => `[segment: ${segment.id}]\n${segment.text}\n`)
    .join("\n");
