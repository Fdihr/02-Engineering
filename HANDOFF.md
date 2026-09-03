# CTI Engineering Handoff

Date: 2026-09-03
Status: Panel 2 Extract committed for the NV snapshot under contract v2; human review deliberately deferred, Panel 3 contract corrected, and deterministic Build preparation is next
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

Build a modular TypeScript application that turns material from the approved Seerist API surface and OSINT search, discovery, and retrieval into trustworthy evidence-grounded memos. Cyber threat intelligence is the first validated profile, not the product boundary. The domain-neutral workflow must also support geopolitical, country-risk, physical-security, supply-chain, operational-risk, and similar research questions.

The long-term target includes every Seerist endpoint the organization is permitted to use. The executable baseline covers only endpoints and OSINT mechanisms whose live behavior has been observed and mapped into explicit evidence-candidate, collection-lead, or context roles. Current proof covers bounded `/v1/wod` collection and discovery plus exact-URL OSINT retrieval; endpoint breadth must grow through narrow tested adapters rather than unverified generic handling.

Cyber terminology, CTI-specific quality policy, Vestas context, and organizational relevance are selectable memo-profile concerns. They must not become prerequisites for unrelated memo types. When organizational relevance is requested, it remains downstream of supported external claims and requires governed context lineage.

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
2. Explicit memo-scope and research-question approval plus bounded Seerist collection (complete).
3. One-item evidence intake and provider-role classification (complete).
4. Explicit human evidence admission (complete).
5. One exact-URL source retrieval from an approved collection lead (implemented and checked live).
6. One lossless canonical source document with exact anchor validation (implemented and checked on the retrieved NV source).
7. One bounded AI source-to-question relevance assessment plus deterministic proposal validation (implemented as an interactive Copilot PoC).
8. Convert one validated positive assessment into a pending candidate and exercise human evidence admission (complete; real NV snapshot approved).
9. One-source `Find -> Sweep -> Judge -> Write` from the approved NV snapshot.
10. Sequential multi-source runner.
11. Cross-source claim synthesis.
12. Memo writer and verifier.

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

1. Accept one manually selected item from a verified Seerist collection bundle.
2. Validate the bound question, operation, request and response manifests, raw SHA-256, and fields observed for the endpoint and source type.
3. Classify the item as an evidence candidate, collection lead, or context.
4. Preserve provider ID, retrieval time, raw and manifest checksums, available provenance, and content completeness.
5. Route native captured content to canonicalization, leads to retrieval, and context to context-only handling; no narrative text may trigger approval.
6. Append the deterministic decision to the ledger.

The command is:

```powershell
npm run intake:seerist -- <raw-provider-artifact.json> <provider-item-id> <approved-research-question.json>
```

Focused workflow and command tests cover all roles, invalid input, numeric IDs, country context, run binding, path confinement, bundle checksums, immutable output, and the no-automatic-approval invariant. Native analyst content now completes initial intake as `evidence_candidate -> source_canonicalization -> not_applicable`.

The active intake boundary is `02-Engineering/02-Contracts/provider-item-role-and-provenance.md`.

## Completed slice: approved research intent and bounded collection

Memo scope and research questions now cross separate explicit human approval boundaries before production provider access. Each canonical artifact is immutable and human-attributed. Question approval verifies approved-scope lineage and bounded geography/time; collection and discovery reject unscoped questions before credential access. One Seerist operation must match the approved question ID and run ID and may target only the proven `GET /v1/wod` endpoint.

```powershell
npm run approve:scope -- <memo-scope-proposal.json> <reviewer-id>
npm run approve:question -- <research-question-proposal.json> <approved-memo-scope.json> <reviewer-id>
npm run collect:seerist -- <provider-operation.json> <approved-research-question.json>
```

Validation occurs before credential lookup or `fetch`. The active boundary is `02-Engineering/02-Contracts/research-question-and-provider-operation.md`. Earlier smoke item `1030013` has no approved pre-collection question lineage and remains non-admissible.

## Completed slice: explicit evidence admission

The human-review command accepts one eligible relevance-assessed intake result, `approve`, `reject`, or `revise`, reviewer ID, reason, and an optional decision ID. It confines and validates the intake and raw artifact, hashes the raw response, writes a canonical decision and read-only Markdown receipt, and appends a human-attributed event. Initial native Seerist intake is explicitly ineligible; approval alone creates a non-overwritable approved evidence snapshot.

```powershell
npm run review:evidence -- <intake-result.json> <approve|reject|revise> <reviewer-id> <reason> [decision-id]
```

The active boundary is `02-Engineering/02-Contracts/evidence-admission.md`. Initial command validation used synthetic temporary artifacts; reviewer `FDIHR` later approved the real retrieved-source candidate as `nv-evidence-review-001`.

## Implemented slice: one-source retrieval

The source-retrieval command accepts one persisted collection-lead intake and the exact source URL already present on that lead. It validates approved research lineage and route eligibility before credential access, then makes one fixed Firecrawl v2 Markdown scrape with cache reuse and storage disabled, TLS verification required, no target headers or actions, and bounded time and response size.

```powershell
npm run retrieve:source -- <intake-result.json> <exact-source-url>
```

The raw provider envelope, canonical result, checksums, read-only receipt, and events remain under ignored `app/runs/`. The result distinguishes Firecrawl as access provider from the original publisher, treats fetched text as untrusted, rejects cross-origin redirects, and always records `approvalStatus: "not_requested"`.

The active boundary is `02-Engineering/02-Contracts/source-content-retrieval.md`. Automated tests and strict TypeScript pass. On 2026-08-31, the selected NV source completed one bounded live retrieval: Firecrawl returned HTTP 200, the final URL matched the requested publisher URL, and the canonical result recorded `resolved` / `content_retrieved` with `approvalStatus: "not_requested"`.

## Implemented slice: canonical source and Copilot relevance PoC

Retrieved and native Seerist content now terminate in the same canonical source contract. The retrieved NV source was losslessly canonicalized into 76 deterministic segments with exact UTF-8 anchors. The provider-neutral relevance module creates one fixed-policy request containing the approved question and complete source, validates all four verdict routes, rejects model-authored authority, and verifies exact source quotes.

Because no approved Azure AI Foundry endpoint is currently available, GitHub Copilot in VS Code is used only as an interactive PoC model executor between two local commands:

```powershell
npm run prepare:question-relevance -- <source-document.json>
npm run record:question-relevance -- <question-relevance-request.json> <copilot-response.json>
```

The adapter honestly records `model: "not-exposed-by-host"`. This is not a production Copilot API integration. A future Foundry adapter replaces the manual transport while preserving the request, assessment, exact-anchor, and authority contracts.

The real NV assessment completed as `partially-relevant` with three exact anchors and controller-derived destination `evidence_candidate_proposal / pending_human_review`. On 2026-09-01 it was converted into candidate `nv-candidate-question-relevance-001`; human reviewer `FDIHR` then approved it in decision `nv-evidence-review-001`, creating snapshot `snapshot-nv-evidence-review-001` for source assurance.

## Provider content storage decision

The repository sits inside a OneDrive-synced, access-controlled team library, so ignored `runs/` content is stored in Vestas tenant cloud storage. This is recorded as a decision rather than treated as a leak: provider content lives there because organizational policy places work data there, and the library is the team's controlled channel.

The contract owner has confirmed that Seerist's terms and the captured publisher pages permit internal storage of retrieved content, which closes the previously open retention question. Two rules continue to apply, because permission to store internally is not permission to publish. Raw provider content never leaves the tenant, and committing provider content to git remains a separate deliberate decision rather than an automatic consequence: committed test fixtures stay synthetic unless a specific fixture is explicitly approved. Content-free run values such as counts, rates, and checksums may be recorded in committed documentation.

Operational consequences of that placement are handled in code and configuration. `git config core.longpaths true` is set, the deep working directory is reachable through a `subst` drive letter for shorter tool-visible paths, run directory identifiers are short, and the shared file layer wraps absolute paths with `toNamespacedPath`. Filesystem writes retry only `EPERM` and `EBUSY`, which are the transient locks a sync client causes; `EEXIST` is never retried because that is the write-once guard reporting a real collision. Windows PowerShell 5.1 still fails to enumerate the deepest paths, so prefer PowerShell 7 for directory listings.

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
npm run approve:scope -- <memo-scope-proposal.json> <reviewer-id>
npm run approve:question -- <research-question-proposal.json> <approved-memo-scope.json> <reviewer-id>
npm run collect:seerist -- <provider-operation.json> <approved-research-question.json>
npm run discover:seerist -- <discovery-plan.json> <approved-research-question.json>
npm run intake:seerist -- <raw-provider-artifact.json> <provider-item-id> <approved-research-question.json>
npm run retrieve:source -- <intake-result.json> <exact-source-url>
npm run canonicalize:source -- <source-retrieval-result.json|seerist-intake-result.json>
npm run prepare:question-relevance -- <source-document.json>
npm run record:question-relevance -- <question-relevance-request.json> <copilot-response.json>
npm run reintake:source -- <source-retrieval-result.json> <question-relevance-assessment.json> [candidate-id]
npm run review:evidence -- <intake-result.json> <approve|reject|revise> <reviewer-id> <reason> [decision-id]
npm test
npm run typecheck
npm run build
npm run start
```

The modules implement explicit memo-scope and research-question approval, bounded question-linked collection and discovery, one-item intake, one-hop source retrieval, lossless source canonicalization, Copilot PoC question relevance, positive-assessment candidate conversion, and human evidence admission, not the full memo workflow. Discovery may run multiple explicit query pages under a hard budget but cannot advance candidates into intake. Retrieval handles one exact URL and cannot create an evidence candidate. Canonicalization creates stable provider-neutral source documents and anchors but makes no semantic judgment. The relevance boundary produces only a proposed assessment and controller-derived route. Re-intake reconstructs only validated positive assessments, verifies complete retrieval and model artifact lineage, and creates a pending candidate. Only the review command can create an approved snapshot, and only with explicit reviewer metadata.

The accepted path now creates a lossless provider-neutral source document, a bounded AI question-relevance artifact grounded in exact `SourceAnchor` references, and a checksum-bound pending candidate only for positive validated assessments. The evidence gate preserves assessment, model, and retrieval lineage in an approved snapshot. The verified real NV snapshot is ready for one-source `Find -> Sweep -> Judge -> Write`.

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
5. Which Azure AI Foundry endpoint, model deployment, authentication mode, region, and retention policy will be approved for the live adapter?

## Explicit non-goals for the next agent

- Do not build the final application architecture in one pass.
- Do not implement the chat UI.
- Do not broaden retrieval beyond one exact source URL or add Firecrawl search, crawl, actions, profiles, or LLM formats.
- Do not alter or recreate real decision `nv-evidence-review-001`; it records reviewer `FDIHR` and reason `it fits`.
- Do not add a live model provider until an approved Foundry endpoint and authentication policy are known.
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
- Bounded discovery uses supported `/v1/wod` query variants, limited pagination, integrity assessment, deduplication, deterministic local ranking, and candidate limitation propagation; it surfaced 50 unique URLs for the CIA Director Moscow test.
- AskAnna citation UUIDs are not reproducible through tested `/v1/wod` ID or cluster-ID filters and remain manually supplied leads only.
- Intake reconstructs the exact collection bundle, records raw and manifest checksums, refuses overwrite, and confines all artifacts to the run root.
- Native captured content routes through canonicalization and question relevance and cannot enter evidence admission directly.
- Intake, reporting, approval workflow, and isolated command tests pass.
- The earlier saved analyst-report item is retained only as non-admissible historical output because it has no approved pre-collection question lineage.
- Explicit approval, rejection, and revision-request decisions are implemented; the real NV candidate was approved by `FDIHR`.
- One-source Firecrawl retrieval is implemented with fixed-origin, exact-URL, no-cache-storage, TLS, timeout, size, redirect, checksum, and untrusted-content controls; the live NV check completed successfully on 2026-08-31 without requesting evidence approval.
- Provider-neutral canonicalization is implemented for retrieved and native Seerist content with deterministic IDs, exact UTF-8 anchors, path confinement, non-overwrite behavior, and lossless complete-source retention; the NV retrieval produced a validated 76-segment document.
- Bounded relevance request and response validation is implemented with fixed untrusted-source policy, exact question and source lineage, all four verdict routes, model-authority rejection, and content-safe events. The real NV proposal validated as `partially-relevant` with three exact anchors.
- Retrieved-source re-intake accepts only a validated positive assessment, verifies retrieval, canonical-document, model-request, model-response, assessment, and decision checksums, creates only a pending candidate, and preserves assessment and retrieval lineage through the evidence gate.
- The real NV candidate was approved as `nv-evidence-review-001`; `snapshot-nv-evidence-review-001` preserves its raw, retrieval, model, assessment, and question lineage.
- TypeScript typecheck and build pass.
- Raw provider artifacts remain only in the ignored local `app/runs/` folder.

## Suggested opening prompt

> Read `HANDOFF.md` and the implemented baseline in `03-Workflow/first-slice.md`. Panel 2 Extract is committed for the NV snapshot, but human review is deliberately deferred and no source note exists. Implement the deterministic Panel 3 Build envelope and synthetic tests against the corrected contract in `03-Workflow/memo-workflow.md`. Do not pass the NV extract commit or review package off as a source note.

## Deferred Panel 2 review

On 2026-09-03, the human reviewer deliberately deferred the reduced review because the interaction remained too costly for this POC stage. No review response, review record, source note, or assurance metrics were created. Tentative chat answers were not persisted as reviewer judgment.

The committed extraction and checksum-bound package remain valid immutable artifacts. A later versioned rows-only review may still supply the 20 support verdicts, corrected IR tags, six requirement dispositions, and source assessment without overwriting them. Because the worksheet has been read, that later pass cannot be represented as a blind omission measurement; `omissionPass` remains `not-performed`, omission count remains `null`, and disposition underclaims remain unmeasured.

An extract commit or review package is not a source note and cannot enter Panel 3. The live NV synthesis exercise waits for a completed checksum-bound note.

## Immediate next action: Panel 3 Build preparation

The target contract in `03-Workflow/memo-workflow.md` now matches the structured note Panel 2 emits and records the agreed tradecraft boundaries. Implement the smallest deterministic Build slice:

1. Validate completed source notes and reject extract commits, review packages, or incomplete lineage.
2. Assign short aliases to source notes and observations and map model references back to canonical IDs.
3. Derive source relationships from attribution and source identity, IR coverage and gaps from note dispositions, claim-kind bounds from supporting observations, and confidence ceilings from a versioned policy.
4. Prepare and validate atomic claim proposals without giving the model authority over dependency, coverage, gaps, IDs, or ceilings.
5. Test with synthetic notes, including two notes that relay the same upstream reporting, until the real NV note exists.

Do not implement Challenge, Adjudicate, writer, relevance, semantic verification, or a general orchestrator in this slice. The first live Build remains the reviewed NV note plus one clearly labelled synthetic note that relays the same NYT reporting.

## Human input still required

Confirm provider rules for retaining raw responses and derived fixtures before committing any provider content. When Foundry access becomes available, provide only non-secret endpoint type, deployment name, authentication policy, API version, region, and retention constraints. Credentials remain local environment configuration and must never be pasted into chat or committed.