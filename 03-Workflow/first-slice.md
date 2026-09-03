# Implemented Workflow Baseline

Status: Panel 1 is complete and Panel 2 has a committed NV extraction plus checksum-bound review package. Human review was deliberately deferred on 2026-09-03, so no NV source note or assurance metrics exist and the extract cannot enter Panel 3.

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

A memo scope and its bounded research question must each be explicitly approved by a named human before a production provider operation can run. Relevance therefore originates in approved intent rather than being assigned to returned material after collection.

Run from `app/`:

```powershell
npm run approve:scope -- <memo-scope-proposal.json> <reviewer-id>
npm run approve:question -- <research-question-proposal.json> <approved-memo-scope.json> <reviewer-id>
npm run collect:seerist -- <provider-operation.json> <approved-research-question.json>
npm run discover:seerist -- <discovery-plan.json> <approved-research-question.json>
```

The approval commands write canonical, non-overwritable JSON plus read-only Markdown views. Question approval verifies the exact approved-scope artifact and rejects run, version, geography, or time-window expansion. Collection and discovery require scope lineage, validate question approval and chronology, allow only `GET /v1/wod`, and perform no credential lookup or network operation before both human gates succeed.

The active boundary is `../02-Contracts/research-question-and-provider-operation.md`. The developer probe remains discovery-only and cannot satisfy this contract.

The bounded discovery command supports explicit query variants and limited pagination when one provider operation has insufficient recall. It preserves every raw page, detects changing totals, timestamp inversions, duplicate IDs, contradictory pagination links, malformed pages, and budget exhaustion, then carries those reasons into affected candidate limitations. It deduplicates provider items, scores explicit title and summary term matches, and creates a read-only candidate report. It cannot intake or approve candidates.

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

One persisted intake result -> validate gate eligibility -> explicit human approve, reject, or revise -> admission decision -> approved snapshot only when approved -> append event.

Run from `app/`:

```powershell
npm run review:evidence -- <intake-result.json> <approve|reject|revise> <reviewer-id> <reason> [decision-id]
```

The command confines the intake and raw artifact to its configured run root, hashes the referenced raw artifact, refuses to overwrite an existing decision directory, and writes canonical decision JSON plus a read-only Markdown receipt. An approved decision also writes `approved-evidence-snapshot.json`; rejection and revision requests cannot create that artifact. Initial native Seerist intake remains ineligible; only a checksum-bound candidate created from validated positive question relevance may enter this gate.

Initial command integration used synthetic artifacts in an isolated temporary directory. After that validation, human reviewer `FDIHR` approved the real retrieved-source candidate `nv-candidate-question-relevance-001` as decision `nv-evidence-review-001`.

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

The active boundary is `../02-Contracts/retrieved-source-reintake.md`. Focused tests cover positive-only conversion, source and model artifact lineage, pending-only routing, path confinement, non-overwrite behavior, evidence-gate tampering, and assessment preservation through approval. On 2026-09-01, the live NV assessment was converted into candidate `nv-candidate-question-relevance-001` and subsequently approved by `FDIHR` as decision `nv-evidence-review-001`.

## Implemented slice: Panel 2 Extract under a deterministic controller

One approved evidence snapshot + approved information requirements + versioned profile policy -> immutable model-ready request -> one interactive GitHub Copilot proposal -> deterministic checks, exact-span location, and anchor validation -> committed extraction.

Run from `app/`:

```powershell
npm run approve:requirements -- <requirements-proposal.json> <approved-research-question.json> <reviewer-id>
npm run prepare:assurance-extract -- <approved-evidence-snapshot.json> <approved-requirements.json> <profile-policy.json> [attempt-authorisation.json]
npm run record:assurance-extract -- <extract-request.json> <copilot-response.json>
npm run authorise:assurance-attempt -- <extract-failed.json> <profile-policy.json> <reviewer-id> <reason> [--revalidates=<copilot-response.json>]
npm run prepare:assurance-review -- <extract-commit.json>
npm run record:assurance-review -- <review-package.json> <review-response.json>
npm run assemble:assurance -- <approved-evidence-snapshot.json> <extract-commit.json> <review-record.json>
npm run measure:assurance -- <source-note.json> <extract-stage-directory> <review-record.json>
```

Panel 2 consumes Panel 1 artifacts without altering them. It reopens the canonical source document referenced by the approved snapshot, verifies its checksum, and reuses `validateSourceDocument` and `validateSourceAnchor` as the final authority on every anchor. It introduces no second normalization, no second document hash, and no character-offset anchors.

### Measured failure classes and code-side responses

The first live NV extraction produced three distinct failure classes across four attempts. Each was answered by removing work from the model rather than by relaxing a check.

| Stage | Attempt | Failures | Class |
| --- | --- | --- | --- |
| `extract` | 1 | E2 x2, E3 x14 | Quote transcription |
| `extract` | 2 | E3 x15 | Quote transcription |
| `extract-2` | 1 | E2 x2 | Segment identifier transcription |
| `extract-2` | 2 | E6 x1 | Coverage bookkeeping |
| `extract-3` | 1 | none | Committed |

Diagnosis and response for each class:

1. Quote transcription. Every failing quote matched the canonical segment after markdown escapes, whitespace runs, quotation variants, and NFC were accounted for; the model selected correct spans but substituted lookalike codepoints. The response is an exact-span locator governed by a closed, versioned rule list. Normalization is used only to find the span; the stored anchor is always the segment's own bytes, and Panel 1's validator still runs on the result. Every observation records `proposedQuote` and `matchedVia`, so transcription drift stays measurable instead of invisible.
2. Segment identifier transcription. Hash-like segment ids were fabricated on the first attempt of both stage runs. The prompt now addresses segments by short ordinal alias and code maps the alias back to the canonical id. The alias is a locator hint; the anchor is unchanged.
3. Coverage bookkeeping. The single E6 failure was one missing index in a declared list of eleven, on a requirement whose observations were correctly tagged. `observationIndexes` was a hand-maintained copy of data the model had already supplied through `irIds`, so it was removed from the contract. Code derives the coverage set from the tags, and E6 keeps its exact semantics against the derived set: `silent` requires no tagged observation, and every other disposition requires at least one. A failure there now means the model's tags contradict its own dispositions, which is a judgement error worth failing on.

The generalized rule taken from this: ask the model only for judgement, and derive every bookkeeping field in code.

Three failure classes, three code-side fixes, zero loosening of an invariant. Quote fidelity failures fell from 15 to 0 once the locator landed and stayed at 0 afterwards.

On the committed extraction, 4 of 20 quotes were byte-exact as transcribed and 16 required the locator, with whitespace reflow needed on all 16 and quotation-variant substitution on 7. Transcription drift is therefore the normal case rather than the exception, which makes the locator a permanent component and not a patch for one source. Models normalize whitespace and quotation marks even on clean text, and markdown-converted captures always carry escape artifacts, so the component is required regardless of any later improvement to Panel 1 canonicalization.

### Re-validation boundary

The committed extraction is the stored `extract-2` attempt 2 proposal re-validated under the corrected contract, with no new model invocation. This is permitted only under an explicit rule recorded in the authorisation artifact:

> Re-validation of a stored proposal is permitted only when the contract change removes a bookkeeping requirement or makes a locator more tolerant, never when it alters an invariant on a judgement field.

Both changes qualify. The authorisation names the superseded stage, its failure artifact checksum, and the originating model invocation. Failed stages are retained unchanged; the authorised stage supersedes them in lineage rather than replacing them. This is what separates a principled contract correction from selecting rules until an output passes.

Attempt budget stays at two. Every attempt corrected what was reported and introduced no new failure, so retries were effective; the constraint was the number of failure classes, not the budget.

### Requirement tagging criterion

An observation earns an information-requirement tag only if it answers that requirement as written, not because it is about the same topic. Human review can remove a tag through `correctedIrIds` on a supported verdict; the proposed `irIds` stay in the commit and in the note, and coverage is derived from the corrected set.

This keeps two different errors apart. A quote that does not support its text is a support failure. A supported observation attached to a requirement it does not answer is a tagging failure. Without the distinction, over-tagging would either inflate the coverage graph passed to Panel 3 or be absorbed into the support-failure rate and drive the wrong next slice. `tagPrecision` records tags proposed, tags removed, and the resulting precision. It is an added measurement and changes no pre-registered threshold.

### Boundaries this slice preserves
1. The model never sets an anchor, an observation id, or a coverage set.
2. Retry feedback carries check ids, counts, and fixed rules only, never prior output or source content.
3. `silent` is a first-class success; no check fails because a requirement is unmet by the source.
4. Claim kind and attribution never upgrade anywhere in Panel 2.
5. Every canonical artifact is write-once, and no command advances state from a model response.
6. Events record ids, checksums, and typed errors, never prompts, quotes, or observation text.

The active contract version and the exact check definitions an attempt was judged under are recorded in the request, the commit, and the source note lineage.

### Deferred human review boundary

The reviewer elected to defer the reduced rows-only pass because its interaction cost was disproportionate at this POC stage. No review response, review record, source note, or metrics were created, and no tentative chat answer is reviewer authority. The immutable extract and review package remain available for a later versioned review, but worksheet exposure means that review cannot claim a blind omission pass.

Development may proceed on the deterministic Panel 3 Build envelope with synthetic source notes. A live NV Build remains blocked until `record:assurance-review` and `assemble:assurance` produce a valid checksum-bound source note. Build must reject the extract commit and review package as inputs.

### Open Panel 1 finding

The admitted NV canonical segments carry markdown escape artifacts and internal newlines from the Firecrawl markdown capture. That is a Panel 1 canonicalization concern and is recorded as backlog only: changing it would produce a different canonical document and require a new admission decision. The locator is required regardless, because models normalize whitespace and quotation marks even on clean text.

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
20. Human reviewer `FDIHR` approved real NV candidate `nv-candidate-question-relevance-001` in decision `nv-evidence-review-001`; snapshot `snapshot-nv-evidence-review-001` is the first real input ready for source assurance.

## Legacy PoC input rule

If using prior PoC behavior as inspiration, create and accept a mapping note first:

- `../00-PoC-Reference/03-Mapping/mapping-template.md`

Track intake status in:

- `poc-to-workflow-intake.md`

Current cross-session context: `../HANDOFF.md`
