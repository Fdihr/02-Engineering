import type { SourceAnchor } from "../../core/types.js";
import type { ClaimKind } from "./types.js";
import { sha256Text } from "./validators.js";

const UNIT_SEPARATOR = "\u001f";

export const observationId = (
  anchor: SourceAnchor,
  claimKind: ClaimKind,
  text: string
): string =>
  `obs-${sha256Text(
    [
      anchor.sourceDocumentId,
      anchor.segmentId,
      String(anchor.quoteStartUtf8Byte),
      String(anchor.quoteEndUtf8Byte),
      claimKind,
      text
    ].join(UNIT_SEPARATOR)
  ).slice(0, 12)}`;
