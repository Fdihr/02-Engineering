# Provider Item Role and Provenance Contract

Status: Active baseline
Validated: 2026-08-28
Implementation: `../app/src/core/types.ts`, `../app/src/modules/intake/intake.ts`

## Scope

This contract covers one manually selected Seerist item. The executable command currently selects one feature by provider ID from a saved `/v1/wod` GeoJSON response. It does not define batch ingestion, source retrieval, human approval, or source assurance.

## Selected item input

The workflow receives:

| Field | Rule |
| --- | --- |
| `provider` | Must equal `seerist`. |
| `endpoint` | Must be an explicitly supported observed endpoint. |
| `retrievedAt` | Must be a valid timestamp supplied by the side-effect boundary. |
| `rawArtifactRef` | Must be a non-empty reference to the preserved provider response. |
| `item` | Must be a JSON object or GeoJSON feature with a `properties` object. |

The intake module accepts string or finite numeric provider IDs and normalizes them to strings. Source discriminators remain open strings.

## Provider-neutral output

Every accepted item records:

- Provider and endpoint.
- Provider item ID when present.
- Source discriminator when present and not itself a URL.
- Provider timestamp when present.
- Local retrieval time and raw artifact reference.
- Available source URLs, provider-reference count, and source-metadata presence.
- Content completeness and provider role.

Provider title, summary, body, and content are not copied into the intake result. They remain in the preserved raw artifact.

The command also renders `intake-summary.md` from the accepted provider-neutral output. This report is a read-only view; `intake-result.json` remains canonical and the report cannot create an approval or state transition.

## Content completeness

Completeness is assigned by structural field presence in this order:

1. `captured_content`: `sanitizedBody`, `body`, or `content` contains text.
2. `summary_only`: `sanitizedSummary` or `summary` contains text.
3. `metadata_only`: neither captured content nor summary text is present.

The check determines availability only. It does not judge truth, relevance, quality, or claim eligibility.

## Role classification

| Condition | Role |
| --- | --- |
| Country-background, risk-rating, or Pulse endpoint | `context` |
| `/v1/wod` item with observed source `country-background` | `context` |
| `/v1/wod` item with source `analysis` and captured content | `evidence_candidate` |
| Other accepted `/v1/wod` item | `collection_lead` |

An evidence candidate requires a provider item ID. Classification uses endpoint, source discriminator, and content depth; narrative wording is not an input to the routing decision.

## Routing

| Role | Destination | Approval status |
| --- | --- | --- |
| `evidence_candidate` | `human_review` | `pending_human_review` |
| `collection_lead` | `source_retrieval` | `not_applicable` |
| `context` | `context_only` | `not_applicable` |

No output type contains an `approved` destination or status. Approval requires a later explicit human transition.

## Expected failures

Validation and selection return discriminated `Result<T, E>` values with literal errors. Current failures cover invalid selections, unsupported providers or endpoints, invalid retrieval time, missing raw lineage, invalid items, missing required provider IDs or source types, invalid feature collections, missing item IDs, missing selected items, and duplicate IDs.

## Proven boundary

Synthetic tests cover all three roles, invalid input, numeric IDs, aggregate country context, explicit ledger time, and the no-automatic-approval invariant. A saved analyst-report feature completed the executable path as:

`evidence_candidate -> human_review -> pending_human_review`

Additional provider source types or response shapes require new observed evidence and focused tests before this contract expands.