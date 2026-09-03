import type { SourceAnchor, SourceDocument } from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";
import { validateSourceAnchor } from "../source/source-document.js";
import { locateQuote } from "./locator.js";
import type { ProfilePolicy, QuoteMatchProvenance } from "./types.js";

export type AnchorError =
  | "SEGMENT_NOT_FOUND"
  | "QUOTE_LENGTH_OUT_OF_POLICY"
  | "QUOTE_NOT_FOUND_IN_SEGMENT"
  | "QUOTE_AMBIGUOUS_IN_SEGMENT"
  | "ANCHOR_REJECTED_BY_SOURCE_MODULE";

export type AnchoredQuote = {
  anchor: SourceAnchor;
  proposedQuote: string;
  matchedVia: QuoteMatchProvenance;
};

/**
 * The proposed quote is only a locator hint; anchored evidence is cut from the
 * segment's own bytes and the source module remains the final authority.
 */
export const anchorQuote = (
  document: SourceDocument,
  documentArtifactRef: string,
  documentArtifactSha256: string,
  segmentId: unknown,
  proposedQuote: unknown,
  policy: ProfilePolicy
): Result<AnchoredQuote, AnchorError> => {
  const segment = document.segments.find((entry) => entry.id === segmentId);
  if (!segment) {
    return err("SEGMENT_NOT_FOUND");
  }
  if (typeof proposedQuote !== "string" || !proposedQuote.trim()) {
    return err("QUOTE_LENGTH_OUT_OF_POLICY");
  }

  const located = locateQuote(segment.text, proposedQuote, policy.quoteMatchRules);
  if (!located.ok) {
    return err(
      located.error === "QUOTE_AMBIGUOUS"
        ? "QUOTE_AMBIGUOUS_IN_SEGMENT"
        : "QUOTE_NOT_FOUND_IN_SEGMENT"
    );
  }

  const quoteBytes = located.value.endUtf8Byte - located.value.startUtf8Byte;
  if (
    quoteBytes < policy.limits.quoteMinUtf8Bytes ||
    quoteBytes > policy.limits.quoteMaxUtf8Bytes
  ) {
    return err("QUOTE_LENGTH_OUT_OF_POLICY");
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
      quote: located.value.quote,
      quoteStartUtf8Byte: located.value.startUtf8Byte,
      quoteEndUtf8Byte: located.value.endUtf8Byte
    }
  );
  if (!validated.ok) {
    return err("ANCHOR_REJECTED_BY_SOURCE_MODULE");
  }

  return ok({
    anchor: validated.value,
    proposedQuote,
    matchedVia: located.value.matchedVia
  });
};
