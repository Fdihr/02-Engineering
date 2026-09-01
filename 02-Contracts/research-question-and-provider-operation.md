# Research Question and Provider Operation Contract

Status: Active baseline
Validated: 2026-09-01
Implementation: `../app/src/modules/research/memo-scope.ts`, `../app/src/modules/research/research-question.ts`, `../app/src/modules/collection/seerist-collection.ts`

## Controlling rule

Relevance originates in explicit research intent, not in material returned by Seerist. A provider operation cannot become executable until human-approved memo-scope and research-question artifacts exist.

The mandatory order is:

`proposed scope -> scope approval -> proposed question -> question approval -> bound provider operation -> Seerist request -> item intake`

## Question approval

A proposal contains a stable question ID, research run ID, scope version, question, rationale, non-empty geographies, ordered time window, and `status: "proposed"`. Approval consumes an externally hashed approved scope and rejects run, version, geography, or time-window expansion.

Approval requires a non-empty human reviewer ID and valid approval timestamp. The canonical approved artifact replaces the status with `approved`, records `approvedBy` and `approvedAt`, and embeds the approved scope artifact reference and checksum. It does not contain its own path or checksum; consumers bind those values after reading and hashing the artifact.

The approval command writes a non-overwritable JSON artifact and a derived read-only Markdown review under:

`runs/<runId>/research-questions/<questionId>/`

## Provider operation

The current operation contract supports one read-only Seerist `/v1/wod` GET with scalar filters. It records an operation ID, run ID, research-question ID, provider, method, endpoint, and filters.

Before credentials are read or HTTP is attempted, deterministic validation requires:

1. A structurally valid approved-question artifact, external SHA-256 lineage, and approved-scope lineage.
2. An approval time no later than the request time.
3. Exact question-ID and run-ID agreement between the operation and approved question.
4. The allowlisted provider, method, endpoint, and filter value types.

A reference to an approved question establishes relevance lineage. It does not prove that arbitrary filters faithfully compile the question semantics; deterministic search-intent compilation remains outside this bounded contract.

## Collection output

The collection command preserves the response body, request manifest, response manifest, checksums, timestamps, HTTP status, question lineage, and append-only events under:

`runs/<runId>/provider-operations/<operationId>/`

Downstream intake consumes this persisted bundle rather than accepting independently supplied run, endpoint, or retrieval-time values. The active reconstruction and output rules are defined in [Seerist Intake Manifest](seerist-intake-manifest.md).

The developer probe remains separate and does not satisfy this production contract. The active scope boundary is [Memo Scope and Research Question Approval](memo-scope-and-question-approval.md).

## Bounded discovery

When one provider operation does not provide sufficient recall, an explicit discovery plan may define up to ten lexical query variants. Each plan records its run and research-question IDs, query IDs, search text, source filters, deterministic ranking terms, page size, page limit, API-call budget, result limit, and minimum score.

The discovery command:

1. Validates the complete plan and approved-question chronology before reading credentials.
2. Applies the approved question's time window to every generated operation.
3. Runs queries sequentially and follows provider pagination only within the recorded limits.
4. Preserves every raw page with request metadata and SHA-256.
5. Deduplicates by provider item ID and records every matching query and raw artifact.
6. Scores explicit ranking-term matches in titles and summaries, then sorts deterministically by score, provider timestamp, and item ID.
7. Assesses adjacent pages for changing totals, timestamp inversions, duplicate IDs, contradictory links, malformed pages, and exhausted budgets.
8. Persists pagination observations and propagates inconsistent-query reasons into candidate collection limitations.
9. Writes canonical JSON and a read-only Markdown review; it does not intake or approve candidates.

The current implementation does not reproduce AskAnna ranking or citation UUIDs. AskAnna citations may be retained as human-supplied leads, but production coverage uses the supported `/v1/wod` contract.

## Non-retroactivity

Material collected without approved research-question lineage cannot be made admissible by inventing or approving a question afterward. It may remain as historical provider-discovery material only.

Legacy approved questions without scope lineage remain readable for immutable historical downstream artifacts, but collection and discovery reject them before credential lookup.