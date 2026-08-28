# Seerist Reality-Check Findings

Date: 2026-08-28
Status: Three representative live queries completed

## Confirmed request contract

- Base URL: `https://app.seerist.com/hyperionapi/`
- Endpoint: `GET /v1/wod`
- Authentication: `x-api-key` request header
- Input: manually defined query parameters
- All three successful responses were GeoJSON `FeatureCollection` objects with `metadata` and `features`.
- All observed feature geometries were GeoJSON `Point` objects.

## Live query results

| Query | Returned | Total | Observed sources | Next page |
| --- | ---: | ---: | --- | --- |
| Poland, default recent window | 5 | 1,928 | `news` (4), `instagram` (1) | Yes |
| Germany, search `cyber`, sources `news,analysis` | 5 | 12 | `news` (5) | Yes |
| Ukraine, verified `political,maritime` events | 5 | 32 | `political` (5) | Yes |

Each query requested `pageSize=5`, `pageOffset=0`, and descending timestamp order. Only the first page was retrieved.

## Observed payload shape

News and social results exposed fields including:

- `id`, `title`, `summary`, `link`, `source`, `lang`
- `@timestamp`, `@completed`, `translated`, `veracity`
- `cluster_id`, `cluster_size`, `filtered_cluster_size`
- `location_metadata`, `references`, and sometimes `source_metadata`
- Classification, sentiment, emotion, and severity fields when available

No `body` or `sanitizedBody` field was present in any of the ten observed news or social features. For these results, Seerist supplied a title, summary, link, and metadata rather than article body content.

Verified political events exposed a different shape including:

- `id`, `title`, `source`, `eventType`, and `severity`
- `@timestamp`, `initialPublishedDate`, `revisedPublishedDate`, and `publishedHistory`
- `countryCode`, `countryName`, `regionCode`, `regionName`, and structured `location`
- `references`, `sources`, categories, sectors, assets, attack types, and casualty counts

No `summary` or `body` field was present in the five observed verified political features.

The source discriminator is not a closed contract. The live queries observed `news`, `instagram`, and `political`. The field shape varies materially by source.

## Pagination and caching

- Observed metadata fields included `status`, `statusCode`, `pageSize`, `total`, `prev`, and `next`.
- All three first pages had a non-null `next` value and a null `prev` value.
- All three responses reported `Miss from cloudfront` through `X-Cache`.
- No rate-limit, quota, or retry header was returned by the three successful calls.
- The API blueprint describes offset pagination up to 10,000 results, but that limit was not exercised.

## Search behavior

The Germany `search=cyber` query returned one headline without a visible cyber term. Matching may use summaries, hidden indexed content, or broader relevance behavior. Do not model search as a title-only match without further testing.

## Errors and rate limits

- The script's missing-query validation was exercised locally and produced a failed JSONL event without making a provider request.
- No provider-side `400`, `401`, or `429` response was deliberately triggered.
- The blueprint states that `429` indicates exhausted daily quota and that quota resets daily. This remains documentation evidence, not live observation.

## Contract implications

1. Preserve provider responses before parsing or normalization.
2. Treat feature properties as source-dependent and optional.
3. Normalize only fields present in each feature; do not synthesize absent body, author, publisher, or date fields.
4. Treat `@timestamp` carefully because the blueprint permits ingest time when publish time cannot be extracted.
5. Keep `references` and source URLs as distinct provenance evidence when both are present.
6. Use metadata `next` and `total` for pagination checks; do not infer completion from page length alone.

## Remaining questions

- Whether other source types or licensed endpoints provide full body content.
- Whether pagination can be followed consistently across all source types.
- Actual `400`, `401`, and `429` response payloads and headers.
- Effective quota and rate-limit policy for the issued key.
- Provider restrictions governing retention of raw responses. Raw artifacts currently remain only in the ignored local `app/runs/` directory.