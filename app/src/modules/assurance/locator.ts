import { err, ok, type Result } from "../../core/result.js";
import type { QuoteMatchProvenance, QuoteMatchRule } from "./types.js";

export type QuoteLocatorError = "QUOTE_NOT_FOUND" | "QUOTE_AMBIGUOUS";

export type LocatedQuote = {
  /** Bytes cut from the segment, never the caller's string. */
  quote: string;
  startUtf8Byte: number;
  endUtf8Byte: number;
  matchedVia: QuoteMatchProvenance;
};

const APOSTROPHE_VARIANTS = new Set([
  "\u2018",
  "\u2019",
  "\u201A",
  "\u201B",
  "\u02BC",
  "\u02B9",
  "\u0060",
  "\u00B4",
  "\u2032"
]);

const DOUBLE_QUOTE_VARIANTS = new Set([
  "\u201C",
  "\u201D",
  "\u201E",
  "\u201F",
  "\u00AB",
  "\u00BB",
  "\u2033"
]);

type Normalised = {
  text: string;
  /** Original UTF-16 range that produced each emitted code unit. */
  unitStart: number[];
  unitEnd: number[];
};

const normalise = (
  text: string,
  rules: QuoteMatchRule[],
  fired: Set<QuoteMatchRule>
): Normalised => {
  const units: string[] = [];
  const unitStart: number[] = [];
  const unitEnd: number[] = [];
  const stripEscapes = rules.includes("markdown-escape");
  const collapseWhitespace = rules.includes("whitespace-collapse");
  const unifyQuotes = rules.includes("quote-variants");
  const applyNfc = rules.includes("nfc");

  let index = 0;
  let lastEmittedSpace = false;
  while (index < text.length) {
    const codePoint = text.codePointAt(index);
    let cluster = String.fromCodePoint(codePoint ?? 0);
    let clusterEnd = index + cluster.length;

    // Combining marks join the base character so NFC can compose the cluster.
    if (applyNfc) {
      while (clusterEnd < text.length) {
        const nextPoint = text.codePointAt(clusterEnd);
        const next = String.fromCodePoint(nextPoint ?? 0);
        if (!/\p{M}/u.test(next)) {
          break;
        }
        cluster += next;
        clusterEnd += next.length;
      }
    }

    if (stripEscapes && cluster === "\\") {
      fired.add("markdown-escape");
      index = clusterEnd;
      continue;
    }

    let emitted = cluster;
    if (unifyQuotes) {
      if (APOSTROPHE_VARIANTS.has(emitted)) {
        emitted = "'";
        fired.add("quote-variants");
      } else if (DOUBLE_QUOTE_VARIANTS.has(emitted)) {
        emitted = '"';
        fired.add("quote-variants");
      }
    }
    if (applyNfc) {
      const composed = emitted.normalize("NFC");
      if (composed !== emitted) {
        fired.add("nfc");
        emitted = composed;
      }
    }
    if (collapseWhitespace && /^\s+$/u.test(emitted)) {
      if (lastEmittedSpace) {
        fired.add("whitespace-collapse");
        index = clusterEnd;
        continue;
      }
      if (emitted !== " ") {
        fired.add("whitespace-collapse");
      }
      emitted = " ";
      lastEmittedSpace = true;
    } else {
      lastEmittedSpace = false;
    }

    for (let offset = 0; offset < emitted.length; offset += 1) {
      unitStart.push(index);
      unitEnd.push(clusterEnd);
    }
    units.push(emitted);
    index = clusterEnd;
  }

  return { text: units.join(""), unitStart, unitEnd };
};

const trimmedRange = (
  text: string,
  start: number,
  end: number
): { start: number; end: number } => {
  let from = start;
  let to = end;
  while (from < to && /\s/u.test(text.charAt(from))) {
    from += 1;
  }
  while (to > from && /\s/u.test(text.charAt(to - 1))) {
    to -= 1;
  }
  return { start: from, end: to };
};

const byteRange = (
  segmentText: string,
  start: number,
  end: number
): { startUtf8Byte: number; endUtf8Byte: number; quote: string } => {
  const quote = segmentText.slice(start, end);
  const startUtf8Byte = Buffer.byteLength(segmentText.slice(0, start), "utf8");
  return {
    quote,
    startUtf8Byte,
    endUtf8Byte: startUtf8Byte + Buffer.byteLength(quote, "utf8")
  };
};

const uniqueIndexOf = (
  haystack: string,
  needle: string
): Result<number, QuoteLocatorError> => {
  const first = haystack.indexOf(needle);
  if (first < 0) {
    return err("QUOTE_NOT_FOUND");
  }
  return haystack.indexOf(needle, first + 1) >= 0
    ? err("QUOTE_AMBIGUOUS")
    : ok(first);
};

/**
 * Locates a proposed quote inside one segment. Normalisation is used only to find the
 * span; the returned quote is always cut from the segment's own bytes.
 */
export const locateQuote = (
  segmentText: string,
  proposedQuote: string,
  rules: QuoteMatchRule[]
): Result<LocatedQuote, QuoteLocatorError> => {
  const exact = uniqueIndexOf(segmentText, proposedQuote);
  if (exact.ok) {
    const range = trimmedRange(
      segmentText,
      exact.value,
      exact.value + proposedQuote.length
    );
    if (range.start >= range.end) {
      return err("QUOTE_NOT_FOUND");
    }
    return ok({
      ...byteRange(segmentText, range.start, range.end),
      matchedVia: "exact"
    });
  }
  if (rules.length === 0) {
    return err(exact.error);
  }

  const fired = new Set<QuoteMatchRule>();
  const segment = normalise(segmentText, rules, fired);
  const quote = normalise(proposedQuote, rules, fired);
  const normalisedQuote = quote.text.trim();
  if (!normalisedQuote) {
    return err("QUOTE_NOT_FOUND");
  }

  const located = uniqueIndexOf(segment.text, normalisedQuote);
  if (!located.ok) {
    return located;
  }

  const start = segment.unitStart[located.value];
  const end = segment.unitEnd[located.value + normalisedQuote.length - 1];
  if (start === undefined || end === undefined) {
    return err("QUOTE_NOT_FOUND");
  }
  const range = trimmedRange(segmentText, start, end);
  if (range.start >= range.end) {
    return err("QUOTE_NOT_FOUND");
  }

  const snapped = byteRange(segmentText, range.start, range.end);
  const confirmation = new Set<QuoteMatchRule>();
  if (normalise(snapped.quote, rules, confirmation).text.trim() !== normalisedQuote) {
    return err("QUOTE_NOT_FOUND");
  }

  const matchedVia = rules.filter((rule) => fired.has(rule));
  return ok({
    ...snapped,
    matchedVia: matchedVia.length > 0 ? matchedVia : "exact"
  });
};
