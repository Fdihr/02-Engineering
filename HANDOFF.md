# CTI Engineering Handoff

Date: 2026-08-28
Status: Seerist reality-check and one-item evidence intake complete; next slice not yet accepted
Workspace root: `CTI/`
Source domain: Agentic App Engineering
Authority class: Current implementation direction and next-action handoff

## Start here

Open this folder as the VS Code workspace:

`C:\Users\FDIHR\OneDrive - Vestas Wind Systems A S\Cyberstrategy, Risk and OT - General\Strategic Risk Management\CTI`

The new agent must read, in order:

1. `00-Second Brain/agent.md`
2. `00-Second Brain/04-context-map/workspace-source-catalog.md`
3. `.github/copilot-instructions.md`
4. This handoff
5. `02-Engineering/03-Workflow/kiss-reset-plan.md`
6. `02-Engineering/03-Workflow/first-slice.md`

Read `02-Engineering/03-Workflow/memo-workflow.md` and the canonical SVG only as the current target architecture, not as a fixed implementation specification.

## Product direction

Build a modular TypeScript application that turns Seerist evidence into a trustworthy threat-intelligence memo.

The intended shape is:

1. Collect evidence from Seerist.
2. Review and approve evidence.
3. Analyze each source.
4. Synthesize claims across sources.
5. Write and verify a memo.
6. Require human approval before publication.
7. Maintain an event log throughout the run.

This shape is provisional. Real provider behavior and working scripts should determine the final contracts.

## KISS decision

Do not implement the complete workflow next.

Build small scripts and grow the architecture only when working behavior requires it:

1. Seerist reality-check probe (complete).
2. One-item evidence intake and provider-role classification (complete).
3. Accept the next bounded slice before implementation.
4. One-source analysis only after retrieval and human-approval prerequisites work.
5. Sequential multi-source runner.
6. Cross-source claim synthesis.
7. Memo writer and verifier.

Avoid UI work, orchestration frameworks, databases, plugin systems, Firecrawl integration, and Vestas-context integration until the earlier scripts work.

## Completed slice: Seerist reality-check probe

The generic read-only probe accepts manually defined endpoint requests, preserves unchanged raw responses in the ignored run folder, appends minimal events, and prints structural summaries. Twenty-two successful calls across twelve endpoint paths established the live capability boundary.

Key findings:

1. World of Data response shape varies materially by source type.
2. News, social, and tested cluster articles exposed summaries and links but no article body.
3. Analyst reports exposed full multilingual bodies.
4. Hotspots and Scribe retain cluster or source links but are discovery surfaces.
5. Country background, risk ratings, and Pulse are provider context rather than independent corroboration.
6. Targeted risk ratings exposed no freshness timestamp.
7. Bounded historical windows reduced observed pagination snapshot drift.

Use `02-Engineering/03-Workflow/seerist-probe-findings.md` as the observed-fact record.

## Completed slice: one-item evidence intake

The deterministic `validate -> classify -> route -> ledger` script now:

1. Accept one manually selected item from a saved Seerist probe response.
2. Validate only fields observed for that endpoint and source type.
3. Classify the item as an evidence candidate, collection lead, or context.
4. Preserve provider ID, retrieval time, raw artifact reference, available provenance, and content completeness.
5. Route every non-restricted item to human review or retrieval; no narrative text may trigger approval.
6. Append the deterministic decision to the ledger.

The command is:

```powershell
npm run intake:seerist -- <raw-response.json> <provider-item-id> <retrieved-at-ISO-8601> [run-id]
```

Eight focused tests cover all roles, invalid input, observed numeric IDs, country context, explicit ledger time, and the no-automatic-approval invariant. One saved analyst-report feature completed as `evidence_candidate -> human_review -> pending_human_review`.

The active boundary is `02-Engineering/02-Contracts/provider-item-role-and-provenance.md`. Do not begin source analysis until the required retrieval and explicit human-approval slices are accepted and implemented.

## Event-log boundary

An event log is required from the first probe, but keep V1 implementation small.

Initially record only:

- `runId`
- `occurredAt`
- `eventType`
- `status`
- `artifactRef`
- `error` when applicable

The architecture document proposes checksums, hash chaining, and sealed manifests. Treat those as later hardening, not prerequisites for the first successful provider call.

## Existing implementation

`02-Engineering/app/` is a strict TypeScript/NodeNext scaffold.

Available commands:

```powershell
npm run dev
npm run intake:seerist -- <raw-response.json> <provider-item-id> <retrieved-at-ISO-8601> [run-id]
npm test
npm run typecheck
npm run build
npm run start
```

The modules implement the bounded one-item intake baseline, not the full memo workflow. The command selects one saved `/v1/wod` feature, classifies it structurally, persists canonical narrative-free JSON plus a read-only Markdown review, appends a minimal event, and cannot produce an approved state.

## Current design artifacts

- Canonical workflow: `02-Engineering/03-Workflow/memo-workflow.md`
- Canonical visual: `02-Engineering/01-Architecture/memo-workflow-board.svg`
- Source assurance detail: `02-Engineering/01-Architecture/source-assurance-goal-loops.svg`
- Script structure: `02-Engineering/01-Architecture/script-architecture.md`
- KISS rules: `02-Engineering/03-Workflow/kiss-reset-plan.md`
- Immediate slice: `02-Engineering/03-Workflow/first-slice.md`
- Legacy PoC boundary: `02-Engineering/00-PoC-Reference/`

Retired V1 references are preserved only for historical comparison:

- `02-Engineering/03-Workflow/memo-workflow-retired-v1.md`
- `02-Engineering/01-Architecture/memo-workflow-board-retired-v1.svg`

The workflow and SVG currently describe:

- Provider-neutral query intent with deterministic adapters.
- Seerist-first collection and optional Firecrawl fallback.
- Human evidence approval.
- Per-source Find, blind Sweep, Judge, and Write stages.
- Builder, challenger, and adjudicator synthesis.
- Claim-level memo citations and AI verification.
- Append-only event logging and artifact integrity.
- A deferred V2 Vestas-context tool.

These are design hypotheses. Keep what testing supports; simplify or revise what it does not.

## Remaining open questions

1. Which additional source types can become evidence candidates without external source-page retrieval?
2. How should missing authorship, ambiguous timestamps, and provider references affect eligibility?
3. Should the next slice prove one collection-lead retrieval or the explicit human-approval transition first?
4. Do bounded pages remain stable across source types and repeated runs?
5. What provider restrictions govern retention of raw responses and test fixtures?

## Explicit non-goals for the next agent

- Do not build the final application architecture in one pass.
- Do not implement the chat UI.
- Do not implement retrieval until its bounded slice is accepted.
- Do not implement the full Find/Sweep/Judge/Write chain yet.
- Do not build the Vestas context database yet.
- Do not treat TypeScript types in the workflow document as settled API contracts.
- Do not import code from the legacy PoC without an accepted mapping note.

## Validation status at handoff

At this handoff:

- The Seerist probe completed 22 successful read-only calls across 12 endpoint paths.
- Findings and the capability board record the observed provider behavior.
- Routing no longer auto-approves content based on narrative wording.
- Eight focused intake and routing tests pass.
- One saved analyst-report item reaches human review with approval pending.
- TypeScript typecheck and build pass.
- Raw provider artifacts remain only in the ignored local `app/runs/` folder.

## Suggested opening prompt

> Read `00-Second Brain/agent.md`, the engineering source route, `HANDOFF.md`, and the completed baseline in `02-Engineering/03-Workflow/first-slice.md`. Propose the smallest next slice needed before source assurance, choosing between one collection-lead retrieval and one explicit human-approval transition. Do not implement until the slice and its definition of done are accepted.

## Human input required

Confirm provider rules for retaining raw responses and derived fixtures before committing any provider content. Credentials remain local environment configuration and must never be pasted into chat or committed.