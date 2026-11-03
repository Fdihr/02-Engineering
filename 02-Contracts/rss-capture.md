# Bounded RSS Capture

Status: First artifact-based acquisition slice. No polling service, database,
publisher-page fetch, candidate admission, or automatic state advancement.

## Supported surface

The supplied version-2 RSS catalogue remains a proposal, not runtime authority.
The first adapter supports only the observed RSS 2.0 endpoints for
`industrial-cyber` and `cisa-advisories`, at their exact catalogue URLs.
On 2026-11-03 both returned HTTP 200 and RSS items with title, link, GUID,
description and publication date. Industrial Cyber also exposed
`content:encoded` in `http://purl.org/rss/1.0/modules/content/`.
No publisher narrative is committed as a fixture. Atom, RDF and other catalogue
endpoints remain unsupported until separately observed and tested.

## Explicit collection

One plan selects one feed, gives its question-specific selection reason, binds
the approved run/question, and records a permission-review reference and actor.
The command reopens the approved question and scope before making a request.
Permission confirmation is an auditable operator assertion, not a licence
inferred from public availability or a source-assurance judgement.

One HTTPS GET captures at most 8 MiB within 20 seconds, with at most three
same-origin redirects. Private/reserved network destinations, credentials,
nonstandard ports, external entities, DTDs, malformed XML and non-UTF-8 feeds
are rejected. There are no retries, linked-page requests, model calls or
scheduled polling. Up to 500 item elements are parsed; overflow fails explicitly
and retains the completed raw response rather than silently truncating sources.
The byte ceiling accommodates the observed approximately 6 MB CISA response;
description size still does not make an item eligible as captured source text.

The immutable capture directory stores the exact plan, catalogue, request,
raw response bytes, response metadata, and parsed collection receipt. It records
checksums, final feed URL, redirect chain, timestamps, HTTP status, ETag and
Last-Modified when present. Errors append a body-free failure event. Subsequent
operations reconstruct the receipt from its persisted inputs and raw bytes.

## Content and time

Every RSS item retains its GUID, exact absolute article URL, publisher title,
raw date string, parsed publication timestamp when unambiguous, receipt time,
description, and separately labelled content body. Identical item records are
deduplicated with a duplicate count; conflicting versions remain distinct.
Neither feed order nor a headline establishes relevance.
Publication-date handling accepts explicit-zone ISO timestamps and the
observed RFC-style dates, including CISA's two-digit years using the RFC 2822
00-49/50-99 century rule. Raw date strings remain available. Ambiguous formats
and impossible calendar dates remain unknown rather than being guessed.

Descriptions alone remain discovery leads, regardless of length. Explicit
`content:encoded` is extracted as untrusted feed-provided text, not certified
full publisher-page content. HTML text extraction is versioned, never executes
markup, and keeps the original markup and raw XML for inspection. Missing,
ambiguous or out-of-window dates retain the item as a lead; no retrospective
coverage is inferred from a current feed.

Only an in-window item with explicit non-empty content can become an
`rss-feed` canonical source document. Its checksum lineage includes the request,
response, raw feed, catalogue, plan and approved question. It can enter the
existing question-relevance proposal path, never evidence admission by itself.
This slice deliberately stops before new RSS candidate conversion.

## Existing Seerist leads

A separate read-only match command verifies the persisted Seerist intake
against its raw provider item, route, ledger and question lineage. It matches
only the exact article URL in `sourceLinks`. One exact item is reported matched;
no match or multiple conflicting matches remains unresolved. It never uses
similar titles, publisher names or topics, and never rewrites an existing
`pending_rss` intake. A matched description-only item is still not captured
evidence. Historical gaps remain visible.

## Storage and authority

All run artifacts are write-once files under the configured run root. No
database is required. Feed definitions and scores grant no authority. The
existing intent, relevance, admission, assurance and publication boundaries
remain in force. Raw run content is non-committed. A later recurring collector
may add a rebuildable SQLite index without replacing the artifacts.
