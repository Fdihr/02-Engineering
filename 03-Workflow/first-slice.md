# Current Workflow Slice

Status: Seerist reality-check probe completed 2026-08-28. Current target: one-item evidence intake.

The architecture in `memo-workflow.md` remains a working hypothesis, not a fixed implementation contract.

## Completed slice: Seerist reality-check probe

Manual request input -> one read-only Seerist API call -> unchanged raw artifact -> structural summary -> minimal event log.

The generic probe and representative live requests are working. Observed contracts, response limitations, and workflow implications are recorded in:

- `seerist-probe-findings.md`
- `../01-Architecture/seerist-api-capability-board.svg`

The probe established three provider roles:

1. Evidence candidates: source-linked records with sufficient captured content for human review.
2. Collection leads: news/social summaries, cluster records, hotspots, and Scribe events that require source resolution or retrieval.
3. Context: country background, risk ratings, Pulse, and future-looking provider assessments that may inform analysis but do not independently corroborate claims.

## Current slice: one-item evidence intake

One manually selected Seerist item -> validate observed fields -> classify provider role -> deterministic route -> ledger entry.

This slice must prove the boundary between collection leads, context, and potential evidence before source analysis begins.

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

## Definition of done

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

## What this slice should teach us

1. The smallest stable envelope shared by heterogeneous provider responses.
2. Which deterministic facts are sufficient to assign a workflow role.
3. Which records require retrieval before source analysis.
4. Which fields belong in an active cross-module intake contract.

## Legacy PoC input rule

If using prior PoC behavior as inspiration, create and accept a mapping note first:

- `../00-PoC-Reference/03-Mapping/mapping-template.md`

Track intake status in:

- `poc-to-workflow-intake.md`

Current cross-session context: `../HANDOFF.md`
