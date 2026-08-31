# Retrieved Source Relevance and Re-intake

Status: Accepted contract revision; implementation migration pending
Validated: Human-input scaffolding validated 2026-08-31; AI-assessment revision not yet implemented
Implementation: `../app/src/modules/intake/retrieved-source-intake.ts`, `../app/src/commands/reintake-source.ts`

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

The replacement command boundary will consume the canonical retrieval result, the provider-neutral `SourceDocument` defined in [Canonical Source Document and Anchors](source-document-and-anchors.md), and a separately persisted `QuestionRelevanceAssessment` artifact. Its final CLI shape will be fixed with the implementation rather than invented in this contract. Chat narrative and raw model prose cannot substitute for that typed artifact or invoke evidence approval.

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
9. A typed model assessment bound to the exact retrieval artifact and approved research-question ID.
10. Model invocation identity, model and prompt-policy version, assessment time, allowed verdict, rationale, exact `SourceAnchor` references, and explicit limitations.
11. A positive verdict of `relevant` or `partially-relevant`. `not-relevant` is retained as an audited exclusion; `uncertain` enters bounded human exception triage.

The command resolves the retrieval result and all referenced artifacts only inside the configured run directory. Candidate IDs are path-safe and output directories are non-overwritable.

## Candidate contract

The output candidate is explicitly `provider: "source_retrieval"`; it does not mislabel Firecrawl as the publisher or Seerist as the captured-content provider. It records:

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

Each successful candidate directory contains:

```text
runs/<runId>/source-reintakes/<candidateId>/
  source-document.json
  question-relevance-assessment.json
  intake-result.json
  intake-summary.md
```

Both JSON artifacts are canonical. The Markdown receipt omits fetched content. Assessment events are model-attributed; validation and persistence events are controller-attributed; evidence decisions remain human-attributed.

## Modularity boundary

The model adapter owns one scoped semantic assessment and no workflow permissions. The pure intake module owns validation and transition data. The command owns arguments, time, identifiers, filesystem confinement, hashing, persistence, events, console output, and process exit. Evidence admission owns the later human approval decision.

A future access provider can produce the canonical source-retrieval contract and add a narrow validated variant when demonstrated. This baseline does not add a provider plugin system or batch orchestrator.

## Proven boundary

Existing synthetic tests cover the transitional human-input scaffolding: unresolved retrieval rejection, lead and checksum mismatches, command-side hash verification, path confinement, body-free receipts, non-overwrite behavior, pending-only routing, and preservation of retrieval lineage through explicit evidence approval.

The AI-assessment revision still requires tests for question binding, exact source anchors, prompt-policy and model provenance, all four verdict routes, no approval authority, and preservation through human evidence admission. No real retrieved publisher source was re-intaked or approved during implementation validation.