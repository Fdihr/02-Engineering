# CTI Engineering Handoff

Date: 2026-08-31
Status: Retrieval and canonical source-document baselines validated; AI question-relevance is next; human-input re-intake is transitional and must not be used live
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

1. Define and approve research questions.
2. Collect question-bound material from Seerist.
3. Losslessly canonicalize each captured source into stable, content-addressed segments.
4. Use bounded AI reasoning to assess each canonical source against the approved question.
5. Deterministically validate exact anchors and persist only proposed or pending candidates.
6. Review and approve evidence with a human decision.
7. Analyze each approved source through independent Find, blind Sweep, Judge, and Write.
8. Synthesize claims across sources.
9. Write and verify a memo.
10. Require human approval before publication.
11. Maintain an event log throughout the run.

This shape is provisional. Real provider behavior and working scripts should determine the final contracts.

## KISS decision

Do not implement the complete workflow next.

Build small scripts and grow the architecture only when working behavior requires it:

1. Seerist reality-check probe (complete).
2. Explicit research-question approval and bounded Seerist collection (complete).
3. One-item evidence intake and provider-role classification (complete).
4. Explicit human evidence admission (complete).
5. One exact-URL source retrieval from an approved collection lead (implemented and checked live).
6. One lossless canonical source document with exact anchor validation (implemented and checked on the retrieved NV source).
7. One bounded AI source-to-question relevance assessment plus deterministic proposal validation.
8. One-source `Find -> Sweep -> Judge -> Write` after a real human-approved snapshot exists.
9. Sequential multi-source runner.
10. Cross-source claim synthesis.
11. Memo writer and verifier.

Avoid UI work, orchestration frameworks, databases, plugin systems, broader Firecrawl discovery, and Vestas-context integration until the earlier scripts work.

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
npm run intake:seerist -- <raw-response.json> <provider-item-id> <retrieved-at-ISO-8601> <approved-research-question.json> [run-id]
```

Eight focused tests cover all roles, invalid input, observed numeric IDs, country context, explicit ledger time, and the no-automatic-approval invariant. One saved analyst-report feature completed as `evidence_candidate -> human_review -> pending_human_review`.

The active intake boundary is `02-Engineering/02-Contracts/provider-item-role-and-provenance.md`.

## Completed slice: approved research intent and bounded collection

Research questions now cross an explicit human approval boundary before production provider access. The canonical artifact is immutable, carries reviewer and approval time, and is externally hashed when a consumer binds it. One Seerist operation must match the approved question ID and run ID and may target only the proven `GET /v1/wod` endpoint.

```powershell
npm run approve:question -- <research-question-proposal.json> <reviewer-id>
npm run collect:seerist -- <provider-operation.json> <approved-research-question.json>
```

Validation occurs before credential lookup or `fetch`. The active boundary is `02-Engineering/02-Contracts/research-question-and-provider-operation.md`. Earlier smoke item `1030013` has no approved pre-collection question lineage and remains non-admissible.

## Completed slice: explicit evidence admission

The new human-review command accepts one persisted intake result, `approve` or `reject`, reviewer ID, reason, and an optional decision ID. It reconstructs and validates the intake artifact, hashes the referenced raw response, writes a canonical decision and read-only Markdown receipt, and appends a human-attributed event. Approval alone creates a non-overwritable approved evidence snapshot.

```powershell
npm run review:evidence -- <intake-result.json> <approve|reject> <reviewer-id> <reason> [decision-id]
```

The active boundary is `02-Engineering/02-Contracts/evidence-admission.md`. Validation used synthetic temporary artifacts; no real Seerist item was approved or rejected.

## Implemented slice: one-source retrieval

The source-retrieval command accepts one persisted collection-lead intake and the exact source URL already present on that lead. It validates approved research lineage and route eligibility before credential access, then makes one fixed Firecrawl v2 Markdown scrape with cache reuse and storage disabled, TLS verification required, no target headers or actions, and bounded time and response size.

```powershell
npm run retrieve:source -- <intake-result.json> <exact-source-url>
```

The raw provider envelope, canonical result, checksums, read-only receipt, and events remain under ignored `app/runs/`. The result distinguishes Firecrawl as access provider from the original publisher, treats fetched text as untrusted, rejects cross-origin redirects, and always records `approvalStatus: "not_requested"`.

The active boundary is `02-Engineering/02-Contracts/source-content-retrieval.md`. Automated tests and strict TypeScript pass. On 2026-08-31, the selected NV source completed one bounded live retrieval: Firecrawl returned HTTP 200, the final URL matched the requested publisher URL, and the canonical result recorded `resolved` / `content_retrieved` with `approvalStatus: "not_requested"`.

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
npm run approve:question -- <research-question-proposal.json> <reviewer-id>
npm run collect:seerist -- <provider-operation.json> <approved-research-question.json>
npm run discover:seerist -- <discovery-plan.json> <approved-research-question.json>
npm run intake:seerist -- <raw-response.json> <provider-item-id> <retrieved-at-ISO-8601> <approved-research-question.json> [run-id]
npm run retrieve:source -- <intake-result.json> <exact-source-url>
npm run canonicalize:source -- <source-retrieval-result.json>
npm run reintake:source -- <source-retrieval-result.json> <analyst-id> <relevance-to-question> [candidate-id]
npm run review:evidence -- <intake-result.json> <approve|reject> <reviewer-id> <reason> [decision-id]
npm test
npm run typecheck
npm run build
npm run start
```

The modules implement explicit research-question approval, bounded question-linked collection and discovery, one-item intake, one-hop source retrieval, lossless source canonicalization, transitional retrieved-source re-intake, and human evidence admission, not the full memo workflow. Discovery may run multiple explicit query pages under a hard budget but cannot advance candidates into intake. Retrieval handles one exact URL and cannot create an evidence candidate. Canonicalization creates stable provider-neutral source documents and anchors but makes no semantic judgment. The current re-intake command proves verified lineage and pending-only routing, but its human-authored relevance input is superseded and must not be used for live re-intake. Only the review command can create an approved snapshot, and only with explicit reviewer metadata.

The accepted replacement first creates a lossless provider-neutral source document, then produces a bounded AI question-relevance artifact grounded in exact `SourceAnchor` references and the approved research question. Deterministic code validates its schema, anchors, model provenance, and lineage before persisting a pending proposal. The human evidence gate reviews that proposal rather than writing routine relevance rationales.

This change must not lower output quality. Every admitted source still receives independent `Find`, blind `Sweep`, `Judge`, and `Write`; cross-source challenge, Vestas dual-lineage relevance, independent verification, and human publication approval remain required. Similar cases scale through source adapters, immutable per-source state, checksum deduplication, sequential reuse, and later bounded concurrency, not reduced analysis depth.

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
- AI question-relevance proposals before human evidence admission.
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
3. What compact source support and explanation should the evidence gate show so humans can efficiently verify AI relevance proposals?
4. Do bounded pages remain stable across source types and repeated runs?
5. What provider restrictions govern retention of raw responses and test fixtures?

## Explicit non-goals for the next agent

- Do not build the final application architecture in one pass.
- Do not implement the chat UI.
- Do not broaden retrieval beyond one exact source URL or add Firecrawl search, crawl, actions, profiles, or LLM formats.
- Do not use the transitional human-input re-intake command for the live NV source.
- Implement the provider-neutral source document and exact anchor validator before the bounded source-to-question assessment adapter.
- Preserve the complete source and mandatory `Find -> Sweep -> Judge -> Write`; do not trade intelligence depth for throughput.
- Do not implement the full Find/Sweep/Judge/Write chain yet.
- Do not build the Vestas context database yet.
- Do not treat TypeScript types in the workflow document as settled API contracts.
- Do not import code from the legacy PoC without an accepted mapping note.

## Validation status at handoff

At this handoff:

- The Seerist probe completed 22 successful read-only calls across 12 endpoint paths.
- Findings and the capability board record the observed provider behavior.
- Routing no longer auto-approves content based on narrative wording.
- Production Seerist collection rejects absent, unapproved, late-approved, or mismatched research intent before credential or network access.
- Bounded discovery uses supported `/v1/wod` query variants, limited pagination, deduplication, and deterministic local ranking; it surfaced 50 unique URLs for the CIA Director Moscow test.
- AskAnna citation UUIDs are not reproducible through tested `/v1/wod` ID or cluster-ID filters and remain manually supplied leads only.
- Intake, reporting, approval workflow, and isolated command tests pass.
- The earlier saved analyst-report item is retained only as non-admissible historical output because it has no approved pre-collection question lineage.
- Explicit approval and rejection are implemented; no real item has been decided.
- One-source Firecrawl retrieval is implemented with fixed-origin, exact-URL, no-cache-storage, TLS, timeout, size, redirect, checksum, and untrusted-content controls; the live NV check completed successfully on 2026-08-31 without requesting evidence approval.
- Provider-neutral canonicalization is implemented with deterministic IDs, exact UTF-8 anchors, path confinement, non-overwrite behavior, and lossless complete-source retention; the NV retrieval produced a validated 76-segment document.
- Retrieved-source re-intake scaffolding verifies retrieval and lead lineage, creates only a pending candidate, and preserves lineage through the evidence gate. Its human-authored relevance input is superseded and retained only as reusable scaffolding until the AI assessment migration is implemented.
- TypeScript typecheck and build pass.
- Raw provider artifacts remain only in the ignored local `app/runs/` folder.

## Suggested opening prompt

> Read `00-Second Brain/agent.md`, `HANDOFF.md`, the completed baseline in `02-Engineering/03-Workflow/first-slice.md`, `02-Engineering/02-Contracts/source-document-and-anchors.md`, and the revised retrieved-source relevance contract. Implement one bounded AI question-relevance assessment over the canonical NV source document. Require exact `SourceAnchor` support, model and prompt-policy provenance, all four verdict routes, and deterministic schema and lineage validation. Do not let model output approve evidence or change downstream `Find -> Sweep -> Judge -> Write` quality requirements.

## Human input required

Confirm provider rules for retaining raw responses and derived fixtures before committing any provider content. Credentials remain local environment configuration and must never be pasted into chat or committed.