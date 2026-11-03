import assert from "node:assert/strict";
import test from "node:test";
import type { ApprovedResearchQuestion } from "../../core/types.js";
import {
  createRssCapture, extractRssHtmlText, isPublicFeedUrl, matchRssArticle,
  OBSERVED_RSS_FEEDS, parseRssItems, prepareRssCollection, RSS_MAX_BYTES,
  rssSha256, type RssItem, type RssResponse
} from "./rss-capture.js";
import { adaptRssSourceContent } from "../source/rss-source-adapter.js";
import { createSourceDocument, validateSourceAnchor } from "../source/source-document.js";

const question: ApprovedResearchQuestion = {
  id: "rq-1", runId: "run-1", scopeVersion: 1, question: "Which factory incidents occurred?",
  rationale: "Bounded test", geographies: ["Europe"],
  timeWindow: { from: "2026-10-01", to: "2026-11-03" }, status: "approved",
  approvedBy: "test-operator", approvedAt: "2026-10-01T00:00:00Z",
  artifactRef: "runs/run-1/question.json", artifactSha256: "a".repeat(64),
  scopeApproval: { scopeId: "scope-1", scopeVersion: 1, artifactRef: "runs/run-1/scope.json", artifactSha256: "b".repeat(64) }
};
const plan = {
  schemaVersion: "rss-collection-plan-v1", id: "rss-test", runId: "run-1",
  researchQuestionId: "rq-1", feedId: "industrial-cyber", selectionReason: "Inspect industrial incidents",
  permission: { reference: "test-only-permission", confirmedBy: "test-operator", confirmedAt: "2026-10-01T00:00:00Z" }
};
const catalogue = {
  catalogueVersion: 2, feeds: [{ id: "industrial-cyber", url: OBSERVED_RSS_FEEDS["industrial-cyber"], name: "Synthetic feed", format: "rss" }]
};
const rawItem = (overrides = "") =>
  `<item><title>Synthetic incident</title><link>https://publisher.example/incident?x=1&amp;y=2</link><guid>stable-1</guid><pubDate>Tue, 03 Nov 2026 10:00:00 +0000</pubDate>${overrides}</item>`;
const envelope = (items: string) => Buffer.from(
  `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Synthetic</title>${items}</channel></rss>`
);
const parse = (xml: Buffer) => parseRssItems(xml, "https://publisher.example/feed", question);
const requireItems = (xml: Buffer): RssItem[] => {
  const parsed = parse(xml);
  assert.ok(parsed.ok, JSON.stringify(parsed));
  return parsed.value;
};

test("RSS plans require bound approved intent, explicit permission and an observed exact feed", () => {
  assert.ok(prepareRssCollection(plan, catalogue, question, "2026-11-03T11:00:00Z").ok);
  for (const invalid of [
    { ...plan, id: "../escape" }, { ...plan, runId: "other-run" },
    { ...plan, selectionReason: "" }, { ...plan, permission: {} },
    { ...plan, permission: { ...plan.permission, confirmedAt: "2026-12-01T00:00:00Z" } }
  ]) assert.equal(prepareRssCollection(invalid, catalogue, question, "2026-11-03T11:00:00Z").ok, false);
  assert.equal(prepareRssCollection(plan, catalogue, { ...question, status: "proposed" }, "2026-11-03T11:00:00Z").ok, false);
  assert.equal(prepareRssCollection(plan, catalogue, { ...question, scopeApproval: undefined }, "2026-11-03T11:00:00Z").ok, false);
  const altered = { ...catalogue, feeds: [{ ...catalogue.feeds[0], url: "https://attacker.example/feed" }] };
  assert.equal(prepareRssCollection(plan, altered, question, "2026-11-03T11:00:00Z").ok, false);
});

test("RSS parser preserves exact identities, dates, raw content and text extraction without granting approval", () => {
  const html = "<p>A synthetic incident affected Łódź.</p><script>do not run</script><p>A &amp; B.</p>";
  const items = requireItems(envelope(rawItem(`<description>Short lead</description><content:encoded><![CDATA[${html}]]></content:encoded>`)));
  assert.equal(items.length, 1);
  const item = items[0]!;
  assert.equal(item.articleUrl, "https://publisher.example/incident?x=1&y=2");
  assert.equal(item.itemIdentity, "stable-1");
  assert.equal(item.publisherDate, "Tue, 03 Nov 2026 10:00:00 +0000");
  assert.equal(item.publishedAt, "2026-11-03T10:00:00.000Z");
  assert.equal(item.timeStatus, "in-window");
  assert.equal(item.contentHtml, html);
  assert.equal(item.body, "A synthetic incident affected Łódź.\n\nA & B.");
  assert.equal(item.contentStatus, "captured-feed-text");
  assert.deepEqual(requireItems(envelope(rawItem(`<description>Short lead</description><content:encoded><![CDATA[${html}]]></content:encoded>`))), items);
});

test("long descriptions remain leads and missing or out-of-window dates remain explicit", () => {
  const descriptionOnly = requireItems(envelope(rawItem(`<description>${"Description. ".repeat(1000)}</description>`)))[0]!;
  assert.equal(descriptionOnly.contentStatus, "lead-only");
  assert.equal(descriptionOnly.body, null);
  for (const date of ["bad date", "03 Nov 2026 10:00:00", "31 Feb 2026 10:00:00 GMT"]) {
    const item = rawItem().replace("Tue, 03 Nov 2026 10:00:00 +0000", date);
    assert.equal(requireItems(envelope(item))[0]?.timeStatus, "unknown");
  }
  assert.equal(requireItems(envelope(rawItem().replace("03 Nov 2026", "03 Nov 2025")))[0]?.timeStatus, "out-of-window");
  assert.equal(requireItems(envelope(rawItem().replace("03 Nov 2026", "03 Nov 26")))[0]?.publishedAt, "2026-11-03T10:00:00.000Z");
  assert.equal(requireItems(envelope(rawItem().replace("10:00:00", "24:00:00")))[0]?.timeStatus, "unknown");
});

test("identical records deduplicate with counts, conflicting records remain ambiguous", () => {
  const items = requireItems(envelope(rawItem() + rawItem() + rawItem().replace("Synthetic incident", "Changed report")));
  assert.equal(items.length, 2);
  assert.equal(items[0]?.duplicateCount, 1);
  assert.equal(matchRssArticle(items, ["https://publisher.example/incident?x=1&y=2"]).reason, "ambiguous_exact_url");
});

test("exact-URL matching never matches by topic, title, redirects or approximate URLs", () => {
  const items = requireItems(envelope(rawItem()));
  const exact = matchRssArticle(items, ["https://publisher.example/incident?x=1&y=2"]);
  assert.equal(exact.outcome, "matched");
  assert.equal(exact.capturedContentAvailable, false);
  assert.equal(exact.approvalStatus, "not_requested");
  for (const link of ["http://publisher.example/incident?x=1&y=2", "https://publisher.example/incident", "https://publisher.example/incident?y=2&x=1"]) {
    assert.equal(matchRssArticle(items, [link]).outcome, "unresolved");
  }
});

test("XML rejects entities, DTD, malformed XML, unsupported envelopes, encodings and budgets", () => {
  for (const xml of [
    '<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///secret">]><rss>&x;</rss>',
    '<!DOCTYPE rss SYSTEM "https://attacker.example/entity"><rss/>',
    "<rss><channel></rss>", "<feed xmlns='http://www.w3.org/2005/Atom'/>",
    "<rdf:RDF xmlns:rdf='urn:rdf'/>",
    '<?xml version="1.0" encoding="ISO-8859-1"?><rss version="2.0"><channel/></rss>'
  ]) assert.equal(parse(Buffer.from(xml)).ok, false, xml);
  assert.equal(parse(Buffer.alloc(RSS_MAX_BYTES + 1)).ok, false);
  assert.equal(parse(Buffer.from([0xff, 0xfe, 0x00])).ok, false);
  assert.equal(parse(envelope(rawItem().repeat(501))).ok, false);
  assert.deepEqual(requireItems(envelope("")), []);
});

test("content namespace must be the observed namespace, duplicate scalar fields fail closed", () => {
  const spoof = envelope(rawItem("<content:encoded>Do not trust namespace aliases</content:encoded>"))
    .toString().replace("http://purl.org/rss/1.0/modules/content/", "urn:wrong");
  assert.equal(requireItems(Buffer.from(spoof))[0]?.body, null);
  const scopedSpoof = envelope(rawItem('<content:encoded xmlns:content="urn:wrong">Untrusted namespace override</content:encoded>'));
  assert.equal(requireItems(scopedSpoof)[0]?.body, null);
  const duplicateLink = requireItems(envelope(rawItem("<link>https://elsewhere.example/other</link>")))[0]!;
  assert.equal(duplicateLink.articleUrl, null);
});

test("HTML extraction never executes markup and decodes once at its own layer", () => {
  assert.equal(extractRssHtmlText("<style>bad</style><p>A &lt; B &amp; C</p><p>D<br>E</p>"), "A < B & C\n\nD\nE");
});

test("feed URLs exclude credentials, non-HTTPS, private literals and nonstandard ports", () => {
  assert.equal(isPublicFeedUrl("https://industrialcyber.co/feed/"), true);
  for (const url of ["http://public.org/feed", "https://127.0.0.1/feed", "https://[::1]/feed", "https://user:pass@public.org/feed", "https://public.org:8080/feed", "https://host.local/feed"]) {
    assert.equal(isPublicFeedUrl(url), false);
  }
});

test("verified RSS content canonicalizes with exact anchors; metadata and date gaps cannot", () => {
  const prepared = prepareRssCollection(plan, catalogue, question, "2026-11-03T11:00:00Z");
  assert.ok(prepared.ok);
  const raw = envelope(rawItem("<content:encoded><![CDATA[<p>A synthetic source passage long enough to anchor.</p>]]></content:encoded>"));
  const binding = { artifactRef: "runs/run-1/rss/raw.xml", artifactSha256: rssSha256(raw) };
  const response: RssResponse = {
    requestedAt: "2026-11-03T11:00:00Z", receivedAt: "2026-11-03T11:00:01Z",
    finalUrl: prepared.value.feed.url, redirects: [], httpStatus: 200,
    mediaType: "application/rss+xml; charset=UTF-8", etag: null, lastModified: null
  };
  const capture = createRssCapture(prepared.value, raw, response, {
    raw: binding, request: binding, response: binding, plan: binding, catalogue: binding
  });
  assert.ok(capture.ok);
  const item = capture.value.items[0]!;
  const captured = adaptRssSourceContent(capture.value, item.id, binding);
  assert.ok(captured.ok);
  const document = createSourceDocument(captured.value);
  assert.ok(document.ok);
  assert.equal(document.value.sourceKind, "rss-feed");
  const segment = document.value.segments[0]!;
  assert.ok(validateSourceAnchor(document.value, "doc.json", "c".repeat(64), {
    sourceDocumentId: document.value.id, sourceDocumentArtifactRef: "doc.json",
    sourceDocumentArtifactSha256: "c".repeat(64), segmentId: segment.id,
    segmentSha256: segment.textSha256, quote: segment.text,
    quoteStartUtf8Byte: 0, quoteEndUtf8Byte: Buffer.byteLength(segment.text)
  }).ok);
  const changed = { ...capture.value, items: [{ ...item, contentStatus: "lead-only" as const, body: null }] };
  assert.equal(adaptRssSourceContent(changed, item.id, binding).ok, false);
  assert.equal(adaptRssSourceContent({ ...capture.value, items: [{ ...item, timeStatus: "unknown" }] }, item.id, binding).ok, false);
  assert.equal(createRssCapture(prepared.value, raw, { ...response, httpStatus: 403 }, capture.value.lineage).ok, false);
  assert.equal(createRssCapture(prepared.value, raw, { ...response, mediaType: "text/html" }, capture.value.lineage).ok, false);
});
