# Seerist Reality-Check Findings

Date: 2026-08-28
Status: Twenty-two successful read-only calls across twelve endpoint paths

## Confirmed request contract

- Base URL: `https://app.seerist.com/hyperionapi/`
- Tested endpoints: `GET /v1/wod`, `GET /v1/wod/country-background/{countryCode}`, `GET /v1/wod/risk-rating/{geoCode}`, `GET /v1/hotspots`, `GET /v1/config/topics`, `GET /v1/config/calendar-events`, `GET /v2/clusters/{category}`, `GET /v2/clusters/{id}/articles`, `GET /v2/pulse/country/{code}`, `GET /v1/wod/breaking-events`, `GET /v1/wod/calendar-events`, and `GET /v2/auto-summary/{locationCode}/{locationType}`
- Authentication: `x-api-key` request header
- Input: manually defined relative GET path and query parameters
- World of Data and cluster responses were GeoJSON `FeatureCollection` objects with `metadata` and `features`.
- The topics helper returned a plain JSON array, disproving the blueprint's global claim that all GET responses are GeoJSON.
- All observed feature geometries were GeoJSON `Point` objects.

## Live query results

| Query | Returned | Total | Observed sources | Next page |
| --- | ---: | ---: | --- | --- |
| Poland, default recent window | 5 | 1,928 | `news` (4), `instagram` (1) | Yes |
| Germany, search `cyber`, sources `news,analysis` | 5 | 12 | `news` (5) | Yes |
| Ukraine, verified `political,maritime` events | 5 | 32 | `political` (5) | Yes |
| Analyst reports, sources `analysis` | 5 | 23 | `analysis` (5) | Yes |

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

All five analyst-report features contained `title`, `summary`, multilingual `body`, and `sanitizedBody` fields together with countries, regions, and risks. Analyst reports therefore provide substantially deeper content than the observed news, social, verified-event, and cluster-article results.

The source discriminator is not a closed contract. The live queries observed `news`, `instagram`, `twitter`, `political`, and `analysis`. The field shape varies materially by source.

## Taxonomy and filter discovery

- `GET /v1/config/topics?ui=true` returned 111 records with 109 unique `apiName` values.
- `unrest` and `crime` each appeared twice as API names, so `apiName` is not a unique identifier.
- 86 topic records explicitly reported `supportsDetected=true`.
- World of Data filter counts exposed 15 count families, including source metadata, sentiment, emotion, geolocation precision, topic, source, and risk categories.
- The observed filter-count response had 58 source buckets, 109 topic buckets, and 40 risk-category buckets.
- The live filter-count shape is much broader than the blueprint's three-field example.

Calendar-event configuration returned an object rather than the array described by the blueprint:

- `impactTypes`: 8 entries
- `severities`: 3 entries
- `categories`: 9 entries
- `subCategories`: 11 entries

Config impact values used singular `Disaster` and `Transport`, while the future-event feed also returned `Disasters` and `Transportation`. Config severity values were lowercase, while feed values were title case. Runtime config is useful for discovery and display, but it does not currently support exact strict validation of event values without explicit normalization rules.

## Cluster expansion

- A Germany crime-cluster query returned three cluster features.
- The tested representative cluster reported `cluster_size=1`.
- Expanding that cluster returned one article with the same `cluster_id`.
- The article exposed `title`, `summary`, `source`, `source_url`, language, location, veracity, severity, and topic fields.
- No article body was present. Cluster article expansion improves provenance and grouping, but did not supply full article text in this test.

## Hotspot discovery and evidence linkage

- A bounded Poland hotspot request returned zero features. Empty hotspot results must remain a normal outcome rather than a collection failure.
- A bounded global request returned five of 184 hotspot features and exposed seven distinct cluster IDs.
- Hotspot properties included `headline`, `clusterIds`, `hotspotTypes`, `topics`, `keywords`, `age_in_hours`, `startTime`, `trigger_start`, `geohash`, and `location_metadata`.
- Resolving one hotspot cluster ID through `GET /v1/wod` returned ten of 13 candidate records. Every returned record preserved the requested ID as `cluster_id`.
- The candidates spanned `news`, `facebook`, and `instagram`. All ten had an item ID, source link, timestamp, and references; eight also had `source_metadata`.
- Hotspots are useful discovery and prioritization signals. Their cluster IDs must resolve to source-linked records before use at the evidence gate, and multiple records in one cluster do not prove independent corroboration.

## Pagination and caching

- Observed metadata fields included `status`, `statusCode`, `pageSize`, `total`, `prev`, and `next`.
- Tested first pages had a non-null `next` value and a null `prev` value.
- A Poland page-one refresh was a CloudFront cache hit with a total of 1,928 and newest timestamp 08:44 UTC. A page-two request made seconds earlier was a cache miss with a total of 1,965 and newest timestamp 09:08 UTC.
- The two pages had no duplicate IDs, but page two contained newer records than page one. Offset pages can therefore reflect different cached feed snapshots and cannot be assumed to form one stable ordered result set.
- Repeating the adjacent-page test with a closed 24-hour historical interval produced consistent results: both pages reported 1,559 total records, no IDs overlapped, page two was strictly older than page one, and forward/back links were present.
- A bounded interval reduced snapshot drift in this test, but it is not yet proven across source types or repeated collection runs.
- Both CloudFront hits and misses were observed.
- No rate-limit, quota, or retry header was returned by successful calls.
- The API blueprint describes offset pagination up to 10,000 results, but that limit was not exercised.

## Search behavior

The Germany `search=cyber` query returned one headline without a visible cyber term. Matching may use summaries, hidden indexed content, or broader relevance behavior. Do not model search as a title-only match without further testing.

## Pulse v2 forecast

- `GET /v2/pulse/country/pl?model=v2&omitGeometry=true&includeForecast=true` returned one country feature.
- Response metadata confirmed `model=v2` and included seven forecast entries.
- Forecast entries were located in `metadata.forecast`, not feature properties, and contained `startTime`, `lower`, `mean`, and `upper`.
- The feature's `stability_score` included `score`, `score_gauge`, `baseline`, `baseline_delta`, `delta`, history, trend, adjustments, and mean event counts.
- Seven live adjustment fields were observed: `conflict`, `crime`, `disaster`, `inflation`, `political`, `terrorism`, and `unrest`. The blueprint's shorter example is not exhaustive.
- Ten mean-event-count entries were returned.
- `omitGeometry=true` removed the geometry field rather than returning `geometry: null`.
- Fields marked legacy or ignorable in the blueprint, including `daily_histogram` and `subscores`, were still present.

Pulse is suitable as contextual and outlook evidence with explicit provider attribution. Its derived scores and forecasts should not be treated as independent event corroboration.

## Country background and targeted risk rating

The Poland country-background request returned one GeoJSON feature:

- The feature contained a 2,708-character English body, a 2,581-character sanitized body, two body items, 22 risk-content sections, and three scenarios.
- The top-level record, every risk-content section, and every scenario had a publication date.
- The response exposed a provider source label but no references field.
- Country background is deep provider-authored context, not independently sourced claim evidence.

The targeted Poland risk-rating request also returned one GeoJSON feature:

- It contained 29 leaf-category ratings grouped under six parent risk categories.
- Each rating exposed category IDs and names plus a rate ID, name, and value.
- The feature had a provider source label but no publication, update, or effective-date field.
- Risk ratings are contextual snapshots. Collection time must be recorded locally because response freshness cannot be established from the observed payload.

## Breaking and future events

The bounded breaking-events request returned five of seven matching features:

- Every feature contained multilingual `title` and `content` objects with `en` and `raw` values.
- English content length ranged from 623 to 2,358 characters.
- Observed statuses were `Confirmed` (3), `Verified` (1), and `Update` (1).
- All features exposed an absolute `source` URL plus a `sources` reference array containing one to eight entries.
- Publication history contained one or two entries, alongside initial and revised publication dates.
- Features used GeoJSON `Point` geometry and structured location metadata.

Breaking events provide an early-warning and revision-tracking lane. Their status and publication history must remain visible through review; a breaking event must not be silently treated as equivalent to a verified event.

The 30-day future-events request returned five of 147 matching features:

- Every feature contained multilingual `title` and `content` objects with `en` and `raw` values.
- English content length ranged from 579 to 1,114 characters.
- Event ranges used `@eventDaterange.gte` and `@eventDaterange.lte`.
- Observed date types were `One-off` and `Recurring`; ascending sort produced ascending event start dates.
- Observed severity values were `Low` and `Medium`.
- Event details included category, impact category, location precision, perpetrator details, and severity.
- Impact values included both `Disaster` and `Disasters`, and both `Transport` and `Transportation`. These values are not clean closed enums.
- Every feature exposed an absolute `source` URL and location metadata.

Future events are suitable for scenario and outlook inputs. They describe anticipated or scheduled events, not evidence that an incident has occurred.

## Scribe auto-summary

The dated Poland country request returned a plain object with a `narrative` property, not GeoJSON. The live narrative contained:

- `doc_count` with web and mobile text
- `pulse` with web and mobile text
- `hotspots` with a narrative paragraph, location, and one event
- `top_events` with a narrative paragraph and five events
- An undocumented `explanation` section with a paragraph and one event

Scribe retained item-level provenance:

- All five top events had direct absolute `source_url` values, summaries, and cluster IDs.
- The hotspot and explanation events also exposed direct source URLs and cluster IDs.
- Three top events contained an additional `links` object.
- Top-event summaries ranged from 365 to 581 characters.

The live top events did not contain the blueprint's nested `newspaper` or `src` objects, and none contained `newspaper.text` or any other full article-text field. The blueprint's Scribe article schema is stale for this response.

Scribe can support orientation, comparison, and candidate lead discovery because its events remain traceable. Its generated narrative paragraphs are not source evidence; source URLs or cluster IDs should be resolved through an evidence endpoint before claim use.

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
7. Detect changing totals or timestamp-order inversions across pages and mark the collection as snapshot-inconsistent.
8. Use helper/config endpoints at runtime instead of hard-coding provider taxonomies.
9. Treat cluster IDs as grouping and provenance links, not proof of independent corroboration.
10. Model Pulse forecasts as response metadata and treat score-adjustment names as an open set.
11. Preserve breaking-event status and publication history so revisions remain auditable.
12. Keep future-event categories, impacts, and severities provider-defined until live config values are reconciled.
13. Route breaking and future events through distinct review semantics: early report versus anticipated event.
14. Treat calendar config as a discovery vocabulary, not an exact event-validation contract.
15. Separate Scribe-generated narrative from its source-linked event records.
16. Resolve Scribe source URLs or cluster IDs through an evidence endpoint before claim use.
17. Treat country background and risk ratings as attributed provider context, not independent corroboration.
18. Record retrieval time for risk ratings because the observed response has no freshness field.
19. Treat an empty hotspot result as valid and resolve any returned cluster ID to source-linked records before evidence review.

## Remaining questions

- Whether pagination can be followed consistently across all source types and repeated bounded runs.
- Whether hotspot linkage remains stable across later World of Data pages and direct cluster-article expansion.
- Whether any article-oriented endpoint supplies full source text; the tested cluster article did not.
- How Pulse forecasts and adjustments vary across country, region, city, and county endpoints.
- How often country background is updated and whether risk-rating freshness is available from another endpoint or header.
- How breaking-event records evolve across repeated requests and publication-history updates.
- Whether Scribe narratives remain faithful to their linked events across dates, locations, and empty-result cases.
- Whether city-level Scribe responses use the same live schema as the tested country response.
- Actual `400`, `401`, and `429` response payloads and headers.
- Effective quota and rate-limit policy for the issued key.
- Provider restrictions governing retention of raw responses. Raw artifacts currently remain only in the ignored local `app/runs/` directory.