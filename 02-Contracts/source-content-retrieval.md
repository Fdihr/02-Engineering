# Source Content Retrieval

Status: Active contract for one-hop retrieval of one exact source URL from an approved Seerist collection lead.

## Purpose

Resolve a summary-only lead into captured publisher content without treating retrieval success as evidence admission, factual confirmation, or research relevance.

The approved research question remains the source of relevance. Firecrawl is an access provider. The publisher URL remains the source.

## Required input

The command accepts:

1. One persisted intake result.
2. One exact source URL already present in that intake item's `sourceLinks`.

Before credential access or network activity, deterministic validation requires:

1. A valid approved research-question artifact bound to the same run.
2. Matching provider item IDs across item and route decision.
3. `collection_lead -> source_retrieval -> not_applicable`.
4. An HTTPS URL with no credentials, non-default port, local hostname, or literal private, loopback, link-local, or multicast address.
5. The exact requested string to be present in the lead's source links.

This lexical URL gate is defense in depth, not a claim that local code resolves every possible DNS rebinding or provider-side network condition. The target is fetched from Firecrawl infrastructure, not the local process.

## Firecrawl operation

The adapter uses direct REST with a fixed destination:

```text
POST https://api.firecrawl.dev/v2/scrape
```

The request is fixed to:

```json
{
  "url": "<exact approved source URL>",
  "formats": ["markdown"],
  "onlyMainContent": true,
  "onlyCleanContent": false,
  "maxAge": 0,
  "storeInCache": false,
  "skipTlsVerification": false,
  "removeBase64Images": true,
  "blockAds": true,
  "waitFor": 0,
  "mobile": false,
  "timeout": 30000
}
```

The adapter must not send source credentials, custom target headers, actions, profiles, locations, prompts, schemas, screenshots, raw HTML, links, summaries, questions, highlights, crawl instructions, or agent instructions.

The API key is read only from `FIRECRAWL_API_KEY`, sent only in the authorization header, and never written to an artifact or event.

## Transport limits

1. The Firecrawl API origin is constant and cannot be supplied by input or environment configuration.
2. Redirects by the Firecrawl API request itself are rejected.
3. Firecrawl's request timeout is 30 seconds; the local transport timeout is 35 seconds.
4. The response body is capped at 5 MiB while streaming and by declared content length when available.
5. The command performs one call and no automatic retry. A later manual attempt receives a new retrieval ID and audit trail.
6. Raw responses remain in the ignored local run directory and receive a SHA-256 checksum.

## Response admission

`resolved` means only that substantive source content was retrieved. It requires all of:

1. Firecrawl HTTP `200` and body `success: true`.
2. `metadata.sourceURL` normalizes to the exact requested URL.
3. A safe `metadata.url` is present as final-URL evidence.
4. The final URL has the same origin as the requested URL.
5. The publisher status in `metadata.statusCode` is 2xx or 304.
6. Non-empty Markdown of at least 200 characters.

Provider failures, publisher failures, absent final-URL evidence, cross-origin redirects, and missing or weak content produce a persisted `unresolved` result. Malformed or lineage-conflicting envelopes fail the command after preserving the raw response when one was received.

The threshold is only a cheap content-presence check. It is not a quality, relevance, credibility, or factuality score.

## Artifacts and state

Each non-overwritable retrieval directory contains:

1. `retrieval-request.json` without credentials.
2. `raw-firecrawl-response.json` as quarantined provider output.
3. `source-retrieval-result.json` as the canonical interpreted result.
4. `source-retrieval-summary.md` as a read-only receipt that does not reproduce fetched content.

The canonical result records:

1. Research-question and intake lineage.
2. Firecrawl as access provider and its HTTP status.
3. Requested, reported, and final publisher URLs separately.
4. Publisher host, target status, redirect status, metadata, and explicit limitations.
5. Request, intake, and raw-response checksums.
6. Retrieved content as `trust: "untrusted"` only when resolved.
7. `approvalStatus: "not_requested"` in every outcome.

No retrieval result is an evidence candidate or approved evidence snapshot. Resolved content first enters the provider-neutral [canonical source document and anchors](source-document-and-anchors.md) boundary through `npm run canonicalize:source`. The separate [retrieved source relevance and re-intake](retrieved-source-reintake.md) boundary then assesses that complete source against the exact approved research question, validates the typed AI proposal and artifact lineage, and may create only a pending candidate for the existing human evidence-admission command.

## Security and provider limitations

1. Plain Markdown retrieval does not enable Firecrawl's LLM formats or this application's model execution. Prompt-like source text remains inert data.
2. Firecrawl may render the target in a remote browser. Publisher JavaScript may therefore execute in Firecrawl infrastructure even though no source script executes in this application and no browser actions are requested.
3. Firecrawl v2 documents `skipTlsVerification: true`, two-day cache reuse, and cache storage as defaults. This contract overrides all three with TLS verification, `maxAge: 0`, and `storeInCache: false`.
4. `storeInCache: false` is not Zero Data Retention. Firecrawl documents ZDR, key restrictions, IP restrictions, Threat Protection, and SIEM logging as enterprise controls. Their availability and organization policy must be verified separately before making stronger retention or threat-control claims.
5. Firecrawl's general privacy policy describes caching/indexing and US data storage. Do not send confidential URLs, target credentials, or non-public source material under this contract.
6. Firecrawl's terms place responsibility for lawful use and third-party rights on the user. Publisher restrictions continue to apply. Retrieved publisher content must remain local and uncommitted until retention and quotation rules are confirmed.
7. Firecrawl status and content are collection evidence, not proof of source liveness or factual accuracy.

For a production enterprise key, prefer server-side restriction to the `scrape` endpoint and `markdown` format, inbound IP restriction, Threat Protection with fail-closed policy, ZDR, and SIEM audit logging where contractually available.

## Official documentation basis

Reviewed 2026-08-28:

- [Scrape](https://docs.firecrawl.dev/features/scrape)
- [Scrape API reference](https://docs.firecrawl.dev/api-reference/endpoint/scrape)
- [Advanced Scraping Guide](https://docs.firecrawl.dev/advanced-scraping-guide)
- [Errors](https://docs.firecrawl.dev/api-reference/errors)
- [Rate Limits](https://docs.firecrawl.dev/rate-limits)
- [Faster Scraping](https://docs.firecrawl.dev/features/fast-scraping)
- [Verifying Freshness and Liveness](https://docs.firecrawl.dev/developer-guides/usage-guides/verifying-freshness-and-liveness)
- [Lockdown Mode](https://docs.firecrawl.dev/features/lockdown)
- [Threat Protection](https://docs.firecrawl.dev/features/threat-protection)
- [Key Restrictions](https://docs.firecrawl.dev/features/key-restrictions)
- [IP Restrictions](https://docs.firecrawl.dev/features/ip-restrictions)
- [SIEM Audit Logging](https://docs.firecrawl.dev/features/siem)
- [Enterprise](https://docs.firecrawl.dev/enterprise)
- [Privacy Policy](https://www.firecrawl.dev/privacy-policy)
- [Terms of Service](https://www.firecrawl.dev/terms-of-service)
- [Trust Center](https://trust.firecrawl.dev/)