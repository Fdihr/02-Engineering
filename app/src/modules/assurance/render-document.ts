import type { SourceDocument } from "../../core/types.js";

/** Short ordinal alias; hash-like ids are not reliably transcribed by a model. */
export const segmentAlias = (ordinal: number): string =>
  String(ordinal + 1).padStart(2, "0");

export const segmentAliasMap = (
  document: SourceDocument
): Map<string, string> =>
  new Map(
    document.segments.map((segment) => [segmentAlias(segment.ordinal), segment.id])
  );

/** Alias markers are prompt framing only; they are never part of segment text. */
export const renderDocumentForPrompt = (document: SourceDocument): string =>
  document.segments
    .map(
      (segment) => `[segment ${segmentAlias(segment.ordinal)}]\n${segment.text}\n`
    )
    .join("\n");
