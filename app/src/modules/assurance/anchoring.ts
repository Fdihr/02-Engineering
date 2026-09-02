import type { SourceAnchor, SourceDocument } from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";
import { validateSourceAnchor } from "../source/source-document.js";
import type { ProfilePolicy } from "./types.js";

export type AnchorError =
  | "SEGMENT_NOT_FOUND"
  | "QUOTE_LENGTH_OUT_OF_POLICY"
  | "QUOTE_NOT_FOUND_IN_SEGMENT"
  | "QUOTE_AMBIGUOUS_IN_SEGMENT"
  | "ANCHOR_REJECTED_BY_SOURCE_MODULE";

/**
 * Derives a Panel 1 SourceAnchor from a segment id plus a byte-exact quote.
 * The source module remains the final authority on anchor validity.
 */
export const anchorQuote = (
  document: SourceDocument,
  documentArtifactRef: string,
  documentArtifactSha256: string,
  segmentId: unknown,
  quote: unknown,
  policy: ProfilePolicy
): Result<SourceAnchor, AnchorError> => {
  const segment = document.segments.find((entry) => entry.id === segmentId);
  if (!segment) {
    return err("SEGMENT_NOT_FOUND");
  }
  if (typeof quote !== "string" || !quote.trim()) {
    return err("QUOTE_LENGTH_OUT_OF_POLICY");
  }

  const quoteBytes = Buffer.from(quote, "utf8");
  if (
    quoteBytes.length < policy.limits.quoteMinUtf8Bytes ||
    quoteBytes.length > policy.limits.quoteMaxUtf8Bytes
  ) {
    return err("QUOTE_LENGTH_OUT_OF_POLICY");
  }

  const segmentBytes = Buffer.from(segment.text, "utf8");
  const start = segmentBytes.indexOf(quoteBytes);
  if (start < 0) {
    return err("QUOTE_NOT_FOUND_IN_SEGMENT");
  }
  if (segmentBytes.indexOf(quoteBytes, start + 1) >= 0) {
    return err("QUOTE_AMBIGUOUS_IN_SEGMENT");
  }

  const validated = validateSourceAnchor(
    document,
    documentArtifactRef,
    documentArtifactSha256,
    {
      sourceDocumentId: document.id,
      sourceDocumentArtifactRef: documentArtifactRef,
      sourceDocumentArtifactSha256: documentArtifactSha256,
      segmentId: segment.id,
      segmentSha256: segment.textSha256,
      quote,
      quoteStartUtf8Byte: start,
      quoteEndUtf8Byte: start + quoteBytes.length
    }
  );
  if (!validated.ok) {
    return err("ANCHOR_REJECTED_BY_SOURCE_MODULE");
  }
  return ok(validated.value);
};
