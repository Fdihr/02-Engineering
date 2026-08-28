# Implemented Workflow Baseline

Status: Research-question approval, bounded Seerist collection, one-item evidence intake, and explicit evidence admission completed and validated 2026-08-28.

The canonical target architecture in `memo-workflow.md` is not a fixed implementation contract. This completed slice remains the implementation baseline until a subsequent slice is accepted.

Implementation structure follows `../01-Architecture/script-architecture.md`.

## Completed slice: Seerist reality-check probe

Manual request input -> one read-only Seerist API call -> unchanged raw artifact -> structural summary -> minimal event log.

The generic probe and representative live requests are working. Observed contracts, response limitations, and workflow implications are recorded in:

- `seerist-probe-findings.md`
- `../01-Architecture/seerist-api-capability-board.svg`

The probe established three provider roles:

1. Evidence candidates: source-linked records with sufficient captured content for human review.
2. Collection leads: news/social summaries, cluster records, hotspots, and Scribe events that require source resolution or retrieval.
3. Context: country background, risk ratings, Pulse, and future-looking provider assessments that may inform analysis but do not independently corroborate claims.

## Completed slice: approved research intent and bounded collection

A proposed research question must be explicitly approved by a named human before a production provider operation can run. Relevance therefore originates in approved intent rather than being assigned to returned material after collection.

Run from `app/`:

```powershell
npm run approve:question -- <research-question-proposal.json> <reviewer-id>
npm run collect:seerist -- <provider-operation.json> <approved-research-question.json>
npm run discover:seerist -- <discovery-plan.json> <approved-research-question.json>
```

The approval command writes canonical, non-overwritable JSON plus a read-only Markdown view under `runs/<runId>/research-questions/<questionId>/`. The collection command validates question approval and chronology, requires matching question and run IDs, allows only `GET /v1/wod`, and performs no credential lookup or network operation before that gate succeeds.

The active boundary is `../02-Contracts/research-question-and-provider-operation.md`. The developer probe remains discovery-only and cannot satisfy this contract.

The bounded discovery command supports explicit query variants and limited pagination when one provider operation has insufficient recall. It preserves every raw page, deduplicates provider items, scores explicit title and summary term matches, and creates a read-only candidate report. It cannot intake or approve candidates.

## Completed slice: one-item evidence intake

One manually selected Seerist item -> validate observed fields -> classify provider role -> deterministic route -> ledger entry.

The implementation proves the boundary between collection leads, context, and potential evidence before source analysis begins.

Run the executable path from `app/`:

```powershell
npm run intake:seerist -- <raw-response.json> <provider-item-id> <retrieved-at-ISO-8601> <approved-research-question.json> [run-id]
```

The command selects exactly one `/v1/wod` feature by provider ID, processes it, writes canonical `runs/<runId>/intake-result.json`, writes derived read-only `runs/<runId>/intake-summary.md`, appends `runs/intake-events.jsonl`, and prints a narrative-free status summary.

Open `intake-summary.md` in VS Code and use `Ctrl+Shift+V` for the rendered review. The Markdown report has no workflow controls and cannot advance state.

## Completed slice: explicit evidence admission

One persisted intake result -> validate gate eligibility -> explicit human approve or reject -> admission decision -> approved snapshot only when approved -> append event.

Run from `app/`:

```powershell
npm run review:evidence -- <intake-result.json> <approve|reject> <reviewer-id> <reason> [decision-id]
```

The command hashes the referenced raw provider artifact, refuses to overwrite an existing decision directory, and writes canonical decision JSON plus a read-only Markdown receipt. An approved decision also writes `approved-evidence-snapshot.json`; rejection cannot create that artifact.

No real Seerist item was approved or rejected during implementation validation. The successful command integration test uses synthetic artifacts in an isolated temporary directory.

## KISS boundary

Keep this slice single-item, local, deterministic, and function-first.

Do not add:

1. Chat or another UI.
2. AI classification or query generation.
3. Firecrawl or source-page retrieval.
4. Find, Sweep, Judge, or Write agents.
5. Batch orchestration.
6. A database or plugin framework.
7. Automatic, model-triggered, or narrative-triggered evidence approval.
8. Hash chaining or sealed manifests.

## Completion evidence

1. One manually selected item from a saved probe response reaches the existing `validate -> route -> ledger` flow.
2. Classification uses endpoint, source type, provenance fields, and observed content depth rather than narrative wording.
3. A collection lead cannot be marked claim-eligible or approved.
4. A context item cannot count as independent claim corroboration.
5. A potential evidence item records provider ID, retrieval time, raw artifact reference, content completeness, and available source links or references.
6. No intake code path advances an item to `approved`; only the separate command with explicit reviewer input can create an approved snapshot.
7. Expected failures use `Result<T, E>` with literal error types.
8. Focused tests cover one accepted item, one invalid item, and the no-automatic-approval invariant.
9. Unapproved, late-approved, or mismatched research intent cannot produce a Seerist operation.
10. `npm test`, `npm run typecheck`, and `npm run build` pass.

## Inputs and constraints

1. Use only fields demonstrated in `seerist-probe-findings.md`.
2. Keep raw provider responses in the ignored local run folder until retention rules are confirmed.
3. Do not commit copied provider narrative content as a test fixture without explicit permission.
4. Treat provider taxonomies and source discriminators as open values.
5. Record local retrieval time when provider freshness is absent or ambiguous.

## What this slice established

1. The stable selected-item envelope is provider, endpoint, local retrieval time, raw artifact reference, and an unknown item object.
2. Endpoint, open source discriminator, and structural content depth are sufficient for this first bounded role decision.
3. Analyst records with captured content can enter human review; summary-only news remains a collection lead.
4. Country-background material remains context even when returned through the aggregate `/v1/wod` endpoint.
5. Observed provider IDs may be numeric and are normalized to strings.
6. The active cross-module baseline is `../02-Contracts/provider-item-role-and-provenance.md`.
7. Evidence admission reconstructs persisted JSON, requires reviewer identity and reason, binds approval to the raw artifact SHA-256, and records a human-attributed event.
8. A rejected decision creates no source-assurance input.
9. The active human-gate contract is `../02-Contracts/evidence-admission.md`.
10. Research-question approval is a separate explicit human transition that precedes provider access.
11. Approved artifacts are grouped by research run and bound by external SHA-256 when consumed.
12. The earlier `intake-smoke-analysis-003` artifact is non-admissible because it predates mandatory research-question lineage.
13. One approved four-query, sixteen-page Seerist discovery surfaced 50 unique source URLs across 22 clusters for the CIA Director Moscow question.
14. Supported-API candidates provided close title-level counterparts for all eight human-supplied AskAnna citations, without depending on AskAnna's unsupported retrieval API.

## Legacy PoC input rule

If using prior PoC behavior as inspiration, create and accept a mapping note first:

- `../00-PoC-Reference/03-Mapping/mapping-template.md`

Track intake status in:

- `poc-to-workflow-intake.md`

Current cross-session context: `../HANDOFF.md`
