import assert from "node:assert/strict";
import test from "node:test";
import { locateQuote } from "./locator.js";
import type { QuoteMatchRule } from "./types.js";

const ALL_RULES: QuoteMatchRule[] = [
  "markdown-escape",
  "whitespace-collapse",
  "quote-variants",
  "nfc"
];

/** The located span must always be the segment's own bytes, never the caller's string. */
const assertByteExact = (segment: string, located: {
  quote: string;
  startUtf8Byte: number;
  endUtf8Byte: number;
}): void => {
  const bytes = Buffer.from(segment, "utf8");
  assert.equal(
    bytes.subarray(located.startUtf8Byte, located.endUtf8Byte).toString("utf8"),
    located.quote
  );
  assert.ok(segment.includes(located.quote));
};

test("reports an exact match without applying any rule", () => {
  const segment = "The ministry announced a formal review on 4 March.";
  const result = locateQuote(segment, "announced a formal review", ALL_RULES);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.value.matchedVia, "exact");
  assert.equal(result.value.quote, "announced a formal review");
  assertByteExact(segment, result.value);
});

test("recovers a span whose markdown escapes the model dropped", () => {
  const segment = "Ivan Petrov\\\\ said the review would continue.";
  const result = locateQuote(segment, "Ivan Petrov said the review", ALL_RULES);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.deepEqual(result.value.matchedVia, ["markdown-escape"]);
  assert.equal(result.value.quote, "Ivan Petrov\\\\ said the review");
  assertByteExact(segment, result.value);
});

test("recovers a span the model reflowed across a newline", () => {
  const segment = "The ministry announced\na formal review on 4 March.";
  const result = locateQuote(segment, "The ministry announced a formal review", ALL_RULES);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.deepEqual(result.value.matchedVia, ["whitespace-collapse"]);
  assert.equal(result.value.quote, "The ministry announced\na formal review");
  assertByteExact(segment, result.value);
});

test("recovers a span whose quotation marks the model straightened", () => {
  const segment = "Officials called it a \u201creview\u201d of defence readiness.";
  const result = locateQuote(
    segment,
    'Officials called it a "review" of defence',
    ALL_RULES
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.deepEqual(result.value.matchedVia, ["quote-variants"]);
  assert.equal(
    result.value.quote,
    "Officials called it a \u201creview\u201d of defence"
  );
  assertByteExact(segment, result.value);
});

test("recovers a Ukrainian apostrophe variant the model substituted", () => {
  const segment = "\u0443 \u043f\u2019\u044f\u0442\u043d\u0438\u0446\u044e, 28 \u0441\u0435\u0440\u043f\u043d\u044f, \u0443 \u0441\u0432\u043e\u0454\u043c\u0443 \u0425.";
  const result = locateQuote(
    segment,
    "\u0443 \u043f'\u044f\u0442\u043d\u0438\u0446\u044e, 28 \u0441\u0435\u0440\u043f\u043d\u044f",
    ALL_RULES
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.deepEqual(result.value.matchedVia, ["quote-variants"]);
  assert.equal(
    result.value.quote,
    "\u0443 \u043f\u2019\u044f\u0442\u043d\u0438\u0446\u044e, 28 \u0441\u0435\u0440\u043f\u043d\u044f"
  );
  assertByteExact(segment, result.value);
});

test("recovers a span the model composed under NFC", () => {
  const segment = "Review of i\u0308nfrastructure readiness continued.";
  const result = locateQuote(
    segment,
    "Review of \u00efnfrastructure readiness",
    ALL_RULES
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.deepEqual(result.value.matchedVia, ["nfc"]);
  assert.equal(result.value.quote, "Review of i\u0308nfrastructure readiness");
  assertByteExact(segment, result.value);
});

test("excludes leading and trailing whitespace from the snapped span", () => {
  const segment = "Officials said:\n\n   the review continues   \nuntil spring.";
  const result = locateQuote(segment, " the review continues ", ALL_RULES);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.value.quote, "the review continues");
  assertByteExact(segment, result.value);
});

test("prefers a unique exact match over normalised candidates", () => {
  const segment = "The same claim appeared.\nThe same  claim appeared.";
  const result = locateQuote(segment, "The same claim appeared.", ALL_RULES);
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.value.matchedVia, "exact");
  assert.equal(result.value.startUtf8Byte, 0);
  assertByteExact(segment, result.value);
});

test("treats two normalised candidates as ambiguous when no exact match exists", () => {
  const segment = "The  same claim appeared.\nThe same  claim appeared.";
  assert.deepEqual(locateQuote(segment, "The same claim appeared.", ALL_RULES), {
    ok: false,
    error: "QUOTE_AMBIGUOUS"
  });
});

test("keeps exact ambiguity ambiguous rather than normalising around it", () => {
  const segment = "Repeated span here. Repeated span here.";
  assert.deepEqual(locateQuote(segment, "Repeated span here.", ALL_RULES), {
    ok: false,
    error: "QUOTE_AMBIGUOUS"
  });
});

test("rejects a span that is absent even under every rule", () => {
  const segment = "The ministry announced a formal review on 4 March.";
  assert.deepEqual(
    locateQuote(segment, "The ministry cancelled the review", ALL_RULES),
    { ok: false, error: "QUOTE_NOT_FOUND" }
  );
});

test("applies no rules when the policy enables none", () => {
  const segment = "Ivan Petrov\\\\ said the review would continue.";
  assert.deepEqual(locateQuote(segment, "Ivan Petrov said the review", []), {
    ok: false,
    error: "QUOTE_NOT_FOUND"
  });
});

test("reports every rule that the recovery actually needed", () => {
  const segment = "Officials\\\\ called it a \u201creview\u201d\nof readiness.";
  const result = locateQuote(
    segment,
    'Officials called it a "review" of readiness.',
    ALL_RULES
  );
  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.deepEqual(result.value.matchedVia, [
    "markdown-escape",
    "whitespace-collapse",
    "quote-variants"
  ]);
  assertByteExact(segment, result.value);
});
