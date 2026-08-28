# Current Workflow Slice

Status: One-item evidence intake completed and validated 2026-08-28. No subsequent slice is yet accepted.

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

## Completed slice: one-item evidence intake

One manually selected Seerist item -> validate observed fields -> classify provider role -> deterministic route -> ledger entry.

The implementation proves the boundary between collection leads, context, and potential evidence before source analysis begins.

Run the executable path from `app/`:

```powershell
npm run intake:seerist -- <raw-response.json> <provider-item-id> <retrieved-at-ISO-8601> [run-id]
```

The command selects exactly one `/v1/wod` feature by provider ID, processes it, writes canonical `runs/<runId>/intake-result.json`, writes derived read-only `runs/<runId>/intake-summary.md`, appends `runs/intake-events.jsonl`, and prints a narrative-free status summary.

Open `intake-summary.md` in VS Code and use `Ctrl+Shift+V` for the rendered review. The Markdown report has no workflow controls and cannot advance state.

## KISS boundary

Keep this slice single-item, local, deterministic, and function-first.

Do not add:

1. Chat or another UI.
2. AI classification or query generation.
3. Firecrawl or source-page retrieval.
4. Find, Sweep, Judge, or Write agents.
5. Batch orchestration.
6. A database or plugin framework.
7. Automatic evidence approval.
8. Hash chaining or sealed manifests.

## Completion evidence

1. One manually selected item from a saved probe response reaches the existing `validate -> route -> ledger` flow.
2. Classification uses endpoint, source type, provenance fields, and observed content depth rather than narrative wording.
3. A collection lead cannot be marked claim-eligible or approved.
4. A context item cannot count as independent claim corroboration.
5. A potential evidence item records provider ID, retrieval time, raw artifact reference, content completeness, and available source links or references.
6. No code path advances an item to `approved`; human approval remains a later explicit input.
7. Expected failures use `Result<T, E>` with literal error types.
8. Focused tests cover one accepted item, one invalid item, and the no-automatic-approval invariant.
9. `npm test`, `npm run typecheck`, and `npm run build` pass.

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

## Legacy PoC input rule

If using prior PoC behavior as inspiration, create and accept a mapping note first:

- `../00-PoC-Reference/03-Mapping/mapping-template.md`

Track intake status in:

- `poc-to-workflow-intake.md`

Current cross-session context: `../HANDOFF.md`
