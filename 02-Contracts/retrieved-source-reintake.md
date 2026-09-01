# Retrieved Source Relevance and Re-intake

Status: AI assessment boundary implemented as an interactive Copilot PoC; evidence-candidate migration pending
Validated: 2026-08-31
Implementation: `../app/src/modules/relevance/question-relevance.ts`, `../app/src/modules/relevance/copilot-poc.ts`, `../app/src/commands/prepare-question-relevance.ts`, `../app/src/commands/record-question-relevance.ts`

## Purpose

Assess one resolved source against the exact approved research question with a bounded AI call, then convert a validated positive assessment into one pending evidence candidate.

Retrieval success does not establish relevance, credibility, factuality, or approval. Re-intake does not approve evidence; it creates input for the separate evidence-admission gate.

This is question relevance, not Vestas relevance. The AI may propose whether and how the source addresses the approved question. It cannot admit evidence, expand scope, or infer organizational impact.

## Transitional implementation

Run from `app/`:

```powershell
npm run reintake:source -- <source-retrieval-result.json> <analyst-id> <relevance-to-question> [candidate-id]
```

This command proves artifact confinement, checksum verification, non-overwrite behavior, pending-only routing, and evidence-gate compatibility. Its analyst-authored relevance argument does not scale and is superseded for live use by this revision.

The human-input command remains disabled for live use. Its replacement is split into a provider-neutral request and validation boundary. The current PoC uses GitHub Copilot in VS Code as the interactive model executor because no approved Azure AI Foundry endpoint is available yet:

```powershell
npm run prepare:question-relevance -- <source-document.json>
npm run record:question-relevance -- <question-relevance-request.json> <copilot-response.json>
```

The first command verifies the retrieval, canonical document, and approved-question artifacts before creating a complete model-ready request. The second hashes the exact request and response, rechecks the source-document and question artifacts, validates every anchor, and persists the assessment plus controller-derived routing decision. Chat narrative and raw model prose cannot substitute for the typed response artifact or invoke evidence approval.

This is explicitly not a production Copilot API integration. Provenance records `provider: "github-copilot-vscode"` and `model: "not-exposed-by-host"`; the assessment must state that limitation. When an approved Foundry deployment becomes available, a narrow live adapter replaces this manual transport while the request, assessment, anchor, and authority contracts remain unchanged.

## Eligibility

The command reconstructs unknown JSON and requires:

1. A canonical retrieval with `resolved`, `content_retrieved`, resolution depth one, and `approvalStatus: "not_requested"`.
2. The fixed Firecrawl scrape endpoint, a successful access-provider status, Markdown-only retrieval, fresh/no-store cache controls, and TLS verification enabled.
3. Safe requested and final HTTPS URLs on the same origin, with publisher-host consistency.
4. Captured untrusted Markdown whose recorded character count matches the body.
5. A valid approved research question bound to the retrieval run and approved before retrieval.
6. The original persisted collection-lead intake, revalidated through the existing exact-source retrieval gate.
7. Matching run, provider-item, source-URL, and research-question lineage across the lead and retrieval.
8. Exact SHA-256 matches for the source intake, retrieval request, and raw response, plus a newly computed SHA-256 for the retrieval-result artifact.
9. A typed model assessment bound to the exact canonical source document and approved research-question ID.
10. Model invocation identity, model and prompt-policy version, assessment time, allowed verdict, rationale, exact `SourceAnchor` references, and explicit limitations. The Copilot PoC records the underlying model version as unavailable rather than inventing one; a live enterprise adapter must record the deployed model identifier.
11. A positive verdict of `relevant` or `partially-relevant`. `not-relevant` is retained as an audited exclusion; `uncertain` enters bounded human exception triage.

The commands resolve the retrieval result and all referenced artifacts only inside the configured run directory. IDs are path-safe and assessment output directories are non-overwritable.

## Assessment outcome

The validated assessment always has `status: "proposed"`. Deterministic code derives, rather than accepts from the model, one routing decision:

1. `relevant` or `partially-relevant` -> `evidence_candidate_proposal` / `pending_human_review`.
2. `not-relevant` -> `audited_exclusion` / `not_applicable`.
3. `uncertain` -> `human_exception_triage` / `pending_human_review`.

The model response has exactly four fields: `verdict`, `rationale`, `support`, and `limitations`. Extra authority fields such as `approvalStatus` are rejected. Positive verdicts require at least one exact anchor. Anchor resolution proves exact source presence, not semantic correctness.

## Pending candidate contract

The next implementation step converts only a validated positive assessment into a candidate with `provider: "source_retrieval"`; it must not mislabel Firecrawl as the publisher or Seerist as the captured-content provider. It records:

1. The approved research question.
2. Publisher host plus requested and final source URLs.
3. Firecrawl endpoint as retrieval lineage, not source identity.
4. Original lead, source-intake, retrieval-result, request, and raw-response references and checksums.
5. Canonical source-document lineage plus model invocation provenance, assessment time, research-question ID, verdict, grounded rationale, and exact source anchors.
6. Retrieval limitations.

Fetched body text is not copied into the candidate or Markdown receipt. The candidate references the quarantined raw retrieval artifact and records `captured_content` only because the resolved retrieval has already passed the bounded content-presence checks.

## State transition

Successful positive re-intake deterministically produces:

```text
evidence_candidate -> human_review -> pending_human_review
```

It cannot produce `approved`. Only `npm run review:evidence` with a separate explicit human decision can create an approved snapshot. The human reviews the source and AI proposal; routine operation does not require the reviewer to author the initial relevance rationale.

The evidence-admission validator reconstructs Seerist-native and retrieved-source candidates through separate branches. For a retrieved source, it recomputes the referenced raw artifact hash and requires equality with the re-intake lineage before a decision can succeed. After migration, retrieved-source approval must preserve the AI assessment, model invocation provenance, and retrieval lineage in the snapshot.

## Artifacts and events

The implemented assessment directory contains:

```text
runs/<runId>/sources/<sourceItemId>/<sourceDocumentId>/question-relevance/<requestId>/
  question-relevance-request.json
  copilot-response.json
  assessments/<assessmentId>/
    question-relevance-assessment.json
    question-relevance-decision.json
```

The request includes the complete canonical source and is retained only in the ignored run folder. Console output and events omit source content. Proposal events are model-attributed, validation and persistence events are controller-attributed, and evidence decisions remain human-attributed.

## Modularity boundary

The model adapter owns one scoped semantic assessment and no workflow permissions. During the interactive PoC, Copilot produces the typed response but cannot write a validated assessment directly. The pure relevance module owns schema, lineage, anchor, and routing validation. Commands own arguments, time, identifiers, filesystem confinement, hashing, persistence, events, console output, and process exit. Evidence admission owns the later human approval decision.

A future access provider can produce the canonical source-retrieval contract and add a narrow validated variant when demonstrated. This baseline does not add a provider plugin system or batch orchestrator.

## Proven boundary

Tests cover request-policy tampering, question binding, exact source anchors, altered quotes, prompt-policy and model provenance, all four verdict routes, model-authored authority rejection, source-document drift, path confinement, content-safe console and event output, and non-overwrite behavior.

The real NV source completed one Copilot PoC assessment with verdict `partially-relevant`, three exact anchors, and destination `evidence_candidate_proposal`. The assessment notes that the article reports occurrence, possible purposes, participation, and hybrid-security implications, but does not establish a visit specifically on 27 August or explicit cyber implications. No evidence candidate or approval was created. Candidate conversion and preservation through human evidence admission remain pending.