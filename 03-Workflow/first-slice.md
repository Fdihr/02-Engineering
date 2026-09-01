# Implemented Workflow Baseline

Status: Research-question approval, bounded Seerist collection, checksum-bound one-item intake, secure one-source retrieval, native and retrieved-source canonicalization, bounded Copilot PoC question relevance, positive-assessment candidate conversion, and evidence admission implemented and validated. The real NV candidate is pending human review.

## Product boundary

This implementation is the first narrow slice of a general Seerist-plus-OSINT memo tool. Cyber threat intelligence and the CIA Director test question validate the workflow; they do not constrain future memo subjects. The target includes every Seerist endpoint approved for organizational use plus bounded OSINT search, discovery, and retrieval.

The current baseline does not claim that breadth yet. It proves bounded `/v1/wod` collection and discovery and one-hop exact-URL OSINT retrieval. New endpoints and search mechanisms must be added incrementally from observed responses through explicit role mapping, provenance-preserving adapters, and focused tests. The downstream question, evidence, source-assurance, synthesis, and memo contracts remain domain-neutral unless a selected memo profile adds stricter requirements.

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

One verified Seerist collection bundle plus selected item -> validate question, operation, manifests, raw checksum, and observed fields -> classify provider role -> deterministic route -> ledger entry.

The implementation proves the boundary between collection leads, context, and potential evidence before source analysis begins.

Run the executable path from `app/`:

```powershell
npm run intake:seerist -- <raw-provider-artifact.json> <provider-item-id> <approved-research-question.json>
```

The command reconstructs the canonical `/v1/wod` request/response bundle, derives run, endpoint, and receipt time from it, verifies raw and manifest lineage, and selects exactly one feature by provider ID. It writes non-overwritable output under `runs/<runId>/provider-intakes/<operationId>/<providerItemId>/`, appends `runs/intake-events.jsonl`, and prints a narrative-free status summary.

Open `intake-summary.md` in VS Code and use `Ctrl+Shift+V` for the rendered review. The Markdown report has no workflow controls and cannot advance state.

## Completed slice: explicit evidence admission

One persisted intake result -> validate gate eligibility -> explicit human approve or reject -> admission decision -> approved snapshot only when approved -> append event.

Run from `app/`:

```powershell
npm run review:evidence -- <intake-result.json> <approve|reject> <reviewer-id> <reason> [decision-id]
```

The command confines the intake and raw artifact to its configured run root, hashes the referenced raw artifact, refuses to overwrite an existing decision directory, and writes canonical decision JSON plus a read-only Markdown receipt. An approved decision also writes `approved-evidence-snapshot.json`; rejection cannot create that artifact. Initial native Seerist intake remains ineligible; only a checksum-bound candidate created from validated positive question relevance may enter this gate.

No real Seerist item was approved or rejected during implementation validation. The successful command integration test uses synthetic artifacts in an isolated temporary directory.

## Implemented slice: one-source retrieval

One approved Seerist collection lead -> validate exact listed HTTPS URL -> one fixed Firecrawl v2 scrape -> bounded raw response -> canonical resolved or unresolved receipt.

Run from `app/`:

```powershell
npm run retrieve:source -- <intake-result.json> <exact-source-url>
```

The command validates intake route and approved research-question lineage before reading `FIRECRAWL_API_KEY`. It requests Markdown only, forces fresh retrieval, disables Firecrawl cache storage, requires TLS verification, performs no actions or LLM extraction, rejects cross-origin target redirects, and limits the response to 5 MiB.

Firecrawl is recorded as the access provider while the publisher remains the source. Retrieved text is stored as untrusted content under the ignored run directory. `resolved` means content was captured; every result remains `approvalStatus: "not_requested"` and cannot enter evidence admission directly.

The active boundary is `../02-Contracts/source-content-retrieval.md`. Deterministic and strict-TypeScript validation passes. On 2026-08-31, the selected NV lead completed one live exact-URL retrieval: Firecrawl returned HTTP 200, the final URL matched the requested publisher URL, and the canonical outcome was `resolved` with reason `content_retrieved`. Approval remained `not_requested`.

## Implemented slice: canonical source document and anchors

One resolved retrieval result or verified native Seerist intake -> invoke its narrow source adapter -> losslessly normalize line endings -> deterministic content-addressed segments -> exact UTF-8 source anchors.

Run from `app/`:

```powershell
npm run canonicalize:source -- <source-retrieval-result.json|seerist-intake-result.json>
```

The shared pure module is provider-neutral. Firecrawl-specific and Seerist-specific structures end in narrow adapters; later relevance and assurance modules depend only on canonical `SourceDocument` and `SourceAnchor` types. The command confines input and native raw references to the run root, verifies checksums, writes one non-overwritable document, and emits controller-attributed events without source text.

The active boundary is `../02-Contracts/source-document-and-anchors.md`. Focused tests cover deterministic reproduction, CRLF normalization, multilingual UTF-8 offsets, long-block splitting, altered-document and anchor rejection, both source adapters, path confinement, and non-overwrite behavior. The real NV retrieval produced a validated 76-segment document with an exact source-artifact checksum match.

## Implemented slice: Copilot PoC question relevance

One verified canonical source plus its exact approved question -> immutable model-ready request -> one interactive GitHub Copilot JSON proposal -> deterministic schema, lineage, provenance, and exact-anchor validation -> controller-derived routing decision.

Run from `app/`:

```powershell
npm run prepare:question-relevance -- <source-document.json>
npm run record:question-relevance -- <question-relevance-request.json> <copilot-response.json>
```

The model-ready request contains the complete canonical source, fixed untrusted-content instructions, the approved question, provenance, limitations, verdict definitions, and exact output requirements. Response validation rejects altered quotes, mismatched questions or requests, unknown prompt policy, duplicate anchors, positive verdicts without support, and extra model-authored fields. Only deterministic code derives `evidence_candidate_proposal`, `audited_exclusion`, or `human_exception_triage`; no route can produce approval.

This is an explicit development bridge, not a production Copilot API. The invocation records `github-copilot-vscode` and `not-exposed-by-host` because VS Code does not expose the underlying model identity to this workflow. An approved Azure AI Foundry deployment is the intended live adapter; it will replace transport without changing the provider-neutral request or assessment validators.

The real NV source completed this path as `partially-relevant` with three exact anchors and destination `evidence_candidate_proposal / pending_human_review`. It reports the visit, possible purposes, Ratcliffe-to-Bortnikov participation, and Baltic hybrid-threat implications, but does not establish that the visit occurred specifically on 27 August or provide explicit cyber implications.

## Completed slice: positive-assessment candidate conversion

One resolved retrieval result + its verified source-lead lineage + one validated positive question-relevance assessment -> one new evidence candidate routed to pending human review.

Run from `app/`:

```powershell
npm run reintake:source -- <source-retrieval-result.json> <question-relevance-assessment.json> [candidate-id]
```

The command confines every referenced artifact to the run root; verifies source-intake, retrieval-request, raw-response, retrieval-result, canonical-document, assessment, decision, model-request, and model-response checksums; reconstructs the assessment and exact anchors; and writes a non-overwritable canonical intake plus a body-free receipt. `not-relevant` and `uncertain` assessments cannot become candidates. It cannot approve itself; `npm run review:evidence` remains a separate explicit human decision.

The evidence gate validates the exact positive-assessment shape, reopens and hashes the persisted assessment and decision, preserves assessment and retrieval lineage in an approved snapshot, and rejects artifact drift or altered relevance routing. Candidate creation events are controller-attributed; evidence decisions remain human-attributed.

The active boundary is `../02-Contracts/retrieved-source-reintake.md`. Focused tests cover positive-only conversion, source and model artifact lineage, pending-only routing, path confinement, non-overwrite behavior, evidence-gate tampering, and assessment preservation through approval. On 2026-09-01, the live NV assessment was converted into candidate `nv-candidate-question-relevance-001`; it remains pending human review and is not approved.

## KISS boundary

Keep this slice single-item, local, deterministic, and function-first.

Do not add:

1. Chat or another UI.
2. General AI classification or query generation beyond the accepted one-source question-relevance assessment.
3. Crawling, search, agentic extraction, browser actions, or multi-URL retrieval.
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
3. Analyst records with captured content enter canonicalization and question relevance; summary-only news remains a collection lead.
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
15. One-source retrieval preserves Firecrawl and publisher identity separately, records explicit redirect and target-status evidence, and cannot approve or intake its own output.
16. Retrieved-source candidate conversion accepts only a validated positive assessment and verifies complete retrieval, canonical-document, model-request, model-response, assessment, and decision lineage.
17. AI remains responsible only for a typed, source-grounded relevance proposal; deterministic code creates the pending route and humans retain evidence-admission authority.
18. Scalability must preserve the complete source and mandatory `Find -> Sweep -> Judge -> Write`; reuse, per-source isolation, checksum deduplication, and bounded scheduling provide throughput without lowering the final intelligence standard.
19. Canonical source documents give retrieved and provider-captured content one downstream shape; a new source mechanism needs only a narrow adapter when the common contract remains satisfied.
20. The real NV assessment now exists as pending candidate `nv-candidate-question-relevance-001`; no human evidence decision has been made.

## Legacy PoC input rule

If using prior PoC behavior as inspiration, create and accept a mapping note first:

- `../00-PoC-Reference/03-Mapping/mapping-template.md`

Track intake status in:

- `poc-to-workflow-intake.md`

Current cross-session context: `../HANDOFF.md`
