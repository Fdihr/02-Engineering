# Retrieved Source Relevance and Re-intake

Status: AI assessment and positive evidence-candidate conversion implemented and validated; real NV candidate approved through the compatibility evidence-admission gate
Validated: 2026-09-01
Implementation: `../app/src/modules/relevance/question-relevance.ts`, `../app/src/modules/intake/retrieved-source-intake.ts`, `../app/src/commands/prepare-question-relevance.ts`, `../app/src/commands/record-question-relevance.ts`, `../app/src/commands/reintake-source.ts`

## Purpose

Assess one resolved source against the exact approved research question with a bounded AI call, then convert a validated positive assessment into one pending evidence candidate.

Retrieval success does not establish relevance, credibility, factuality, or approval. Re-intake does not approve evidence; it creates input for controller policy admission or the compatibility human gate.

This is question relevance, not Vestas relevance. The AI may propose whether and how the source addresses the approved question. It cannot admit evidence, expand scope, or infer organizational impact.

## Implemented commands

Run from `app/`:

```powershell
npm run prepare:question-relevance -- <source-document.json>
npm run record:question-relevance -- <question-relevance-request.json> <copilot-response.json>
npm run reintake:source -- <source-retrieval-result.json> <question-relevance-assessment.json> [candidate-id]
```

The first command verifies the retrieval, canonical document, and approved-question artifacts before creating a complete model-ready request. The second hashes the exact request and response, rechecks the source-document and question artifacts, validates every anchor, and persists the assessment plus controller-derived routing decision. The third accepts only a validated positive assessment, verifies its sibling decision and complete retrieval, source-document, request, response, and assessment lineage, then creates one non-overwritable pending candidate. Chat narrative and raw model prose cannot substitute for the typed artifacts or invoke evidence approval.

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
8. Exact SHA-256 matches for the source intake, retrieval request, raw response, retrieval result, canonical source document, relevance assessment and decision, model request, and model response.
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

Conversion creates a candidate with `provider: "source_retrieval"` only from a validated positive assessment; it does not mislabel Firecrawl as the publisher or Seerist as the captured-content provider. It records:

1. The approved research question.
2. Publisher host plus requested and final source URLs.
3. Firecrawl endpoint as retrieval lineage, not source identity.
4. Original lead, source-intake, retrieval-result, request, and raw-response references and checksums.
5. Canonical source-document lineage plus model invocation provenance, assessment time, research-question ID, verdict, grounded rationale, and exact source anchors.
6. Retrieval limitations.

Fetched body text is not copied into the candidate or Markdown receipt. The candidate references the quarantined raw retrieval artifact and records `captured_content` only because the resolved retrieval has already passed the bounded content-presence checks.

## State transition

Successful positive re-intake currently preserves the compatibility route values:

```text
evidence_candidate -> human_review -> pending_human_review
```

Re-intake cannot produce `approved`. Controller mode may create an approved snapshot only after the versioned policy checks pass. Existing policies default to `human` mode, where `npm run review:evidence` records the compatibility decision. That command is an interim stand-in, not a fifth target human surface.

The evidence-admission validator reconstructs Seerist-native and retrieved-source candidates through separate branches. For a retrieved source, it validates the exact positive-assessment shape, reopens and hashes the persisted assessment and decision, compares their parsed values with the candidate, recomputes the referenced raw artifact hash, and requires equality with the re-intake lineage before a decision can succeed. Retrieved-source approval preserves the AI assessment, model invocation provenance, and retrieval lineage in the snapshot.

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

Successful conversion adds:

```text
runs/<runId>/source-reintakes/<candidateId>/
  intake-result.json
  intake-summary.md
```

The request includes the complete canonical source and is retained only in the ignored run folder. Console output and events omit source content. Proposal events are model-attributed, validation and persistence events are controller-attributed, and compatibility evidence decisions remain human-attributed.

## Modularity boundary

The model adapter owns one scoped semantic assessment and no workflow permissions. During the interactive PoC, Copilot produces the typed response but cannot write a validated assessment directly. The pure relevance module owns schema, lineage, anchor, and routing validation. Commands own arguments, time, identifiers, filesystem confinement, hashing, persistence, events, console output, and process exit. The admission workflow owns either controller evaluation under approved policy or the compatibility human decision.

A future access provider can produce the canonical source-retrieval contract and add a narrow validated variant when demonstrated. This baseline does not add a provider plugin system or batch orchestrator.

## Proven boundary

Tests cover request-policy tampering, question binding, exact source anchors, altered quotes, prompt-policy and model provenance, all four verdict routes, model-authored authority rejection, source-document drift, positive-only candidate conversion, full checksum lineage, path confinement, content-safe output, non-overwrite behavior, evidence-gate tampering, and assessment preservation in an approved snapshot.

The real NV source completed one Copilot PoC assessment with verdict `partially-relevant`, three exact anchors, and destination `evidence_candidate_proposal`. On 2026-09-01, that assessment was converted into candidate `nv-candidate-question-relevance-001` with compatibility destination `human_review` and status `pending_human_review`. Human reviewer `FDIHR` then approved it through the compatibility evidence-admission gate as decision `nv-evidence-review-001`, creating snapshot `snapshot-nv-evidence-review-001`.