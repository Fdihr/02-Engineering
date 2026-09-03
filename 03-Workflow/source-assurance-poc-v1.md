# Source Assurance PoC V1

Status: Handover draft v3, aligned with the implemented Panel 1 baseline. No implementation yet.

Scope: One admitted source, the approved NV snapshot, against one approved research question.

Board reference: [memo workflow board v2.4](../01-Architecture/memo-workflow-board.svg), Panel 2.

Implementation authorities:

- [Current handoff](../HANDOFF.md)
- [Implemented workflow baseline](first-slice.md)
- [Canonical source document and anchors](../02-Contracts/source-document-and-anchors.md)
- [Evidence admission](../02-Contracts/evidence-admission.md)
- [Memo scope and research question approval](../02-Contracts/memo-scope-and-question-approval.md)
- `app/src/core/types.ts`
- `app/src/modules/source/source-document.ts`
- `app/runs/nv-evidence-review-001/approved-evidence-snapshot.json`

## 1. Purpose and Boundary

`source-assurance-poc-v1` is an Extract-first experiment aligned with the target Panel 2. It is not the complete source-assurance chain.

The PoC produces a lineage-complete JSON source note and measures whether later assurance stages are justified. It must demonstrate:

1. Atomic observations anchored through the existing byte-exact `SourceAnchor` contract.
2. A controller-owned stage with frozen inputs, deterministic exit checks, bounded attempts, immutable artifacts, and no model transition authority.
3. Exit conditions that accept an honest negative, including an information requirement on which the source is silent.
4. Claim-level lineage from every accepted note observation to the admitted canonical source.
5. Pre-registered measurements that determine the next engineering experiment.

The PoC has one model stage: Extract. Code prepares and validates extraction, constructs the review package, assembles the source note, and calculates metrics. A human performs the semantic support review, omission pass, information-requirement review, and source assessment. The output is canonical JSON; prose generation remains deferred.

## 2. Implemented Panel 1 Input

The implemented chain is:

```text
approved research question
  -> retrieved publisher source
  -> canonical SourceDocument
  -> question-relevance assessment
  -> pending evidence candidate
  -> human evidence admission
  -> ApprovedEvidenceSnapshot
```

The real PoC input is:

| Item | Value |
| --- | --- |
| Snapshot | `snapshot-nv-evidence-review-001` |
| Decision | `nv-evidence-review-001` |
| Candidate | `nv-candidate-question-relevance-001` |
| Run | `research-cia-russia-20260828` |
| Reviewer | `FDIHR` |
| Question | `rq-cia-russia-20260827` |
| Source document | `source-document-08a1c343...` |
| Segments | 76 |
| Characters | 8,875 |
| UTF-8 bytes | 12,545 |
| Normalized-text SHA-256 | `c785372b...` |
| Canonical artifact SHA-256 | `e827717a...` |

Panel 2 does not alter or recreate the admission decision.

`ApprovedEvidenceSnapshot` does not embed source text. The canonical document reference and checksum are nested under:

```text
snapshot.item.questionRelevance.assessment.sourceDocumentArtifactRef
snapshot.item.questionRelevance.assessment.sourceDocumentArtifactSha256
```

Panel 2 must reopen the referenced file inside the configured run root, hash its exact bytes, compare that hash with the snapshot, and call `validateSourceDocument` before preparing a model request.

Panel 1 normalization converts CRLF and CR to LF and makes no other textual changes. Panel 2 must not normalize, trim, collapse whitespace, replace punctuation, strip publisher chrome, or create another document hash.

`SourceAnchor` offsets are half-open UTF-8 byte offsets relative to one canonical segment. Quotes must equal the exact referenced segment bytes. The three question-relevance anchors explain admission and do not limit what Extract may find.

The approved research question is compound. Panel 1 has no atomic information-requirement artifact and no `permittedClaimKinds` field. Panel 2 introduces both through separate governed artifacts.

## 3. Fixed PoC Decisions

### 3.1 Geopolitical Profile Policy

Commit the profile policy at:

`app/src/modules/assurance/policies/geopolitical-source-assurance-v1.json`

```json
{
  "policyId": "geopolitical-source-assurance-v1",
  "claimKinds": ["event", "statement", "assessment", "forecast"],
  "attributionKinds": ["direct", "attributed", "relayed"],
  "dateRoles": ["event", "reporting", "publication", "reference", "unknown"],
  "dispositions": ["covered", "partial", "silent", "contradicted"],
  "reviewVerdicts": ["supported", "unsupported", "duplicate", "chrome"],
  "limits": {
    "quoteMinUtf8Bytes": 20,
    "quoteMaxUtf8Bytes": 600,
    "textMaxChars": 240,
    "maxObservations": 60,
    "maxAttempts": 2
  }
}
```

The policy is committed configuration, not provider content. A command reads its exact bytes and passes the parsed value, artifact reference, and SHA-256 into a pure validator. Changing a semantic value requires a new `policyId`.

Definitions rendered into the Extract prompt:

- `event`: The source presents something as having happened or existing.
- `statement`: The source reports that a party said something. It is evidence that the statement was made, not that its content is true.
- `assessment`: A judgment about meaning, cause, or likelihood, whether made by the publisher or an attributed party.
- `forecast`: A proposition about the future.
- `direct`: Asserted in the publisher's own voice.
- `attributed`: Ascribed to a named or described party.
- `relayed`: Repeats another outlet's reporting.
- Date role `event`: The date on which the described event occurred.
- Date role `reporting`: The date on which information was reported.
- Date role `publication`: The source's publication date.
- Date role `reference`: Another date mentioned by the source.
- Date role `unknown`: The temporal role cannot be established from the text.

### 3.2 Approved Information Requirements

The analyst writes a proposal under the ignored run root:

`runs/research-cia-russia-20260828/requirements/nv-requirements-proposal-001/requirements-proposal.json`

```json
{
  "proposalId": "nv-requirements-proposal-001",
  "questionId": "rq-cia-russia-20260827",
  "runId": "research-cia-russia-20260828",
  "requirements": [
    {
      "irId": "ir-01",
      "text": "Does the source report that the CIA Director visited Russia?"
    },
    {
      "irId": "ir-02",
      "text": "Does the source confirm the visit date as 27 August 2026, or give another date?"
    },
    {
      "irId": "ir-03",
      "text": "What purpose does the source give for the visit?"
    },
    {
      "irId": "ir-04",
      "text": "Who does the source report as participating?"
    },
    {
      "irId": "ir-05",
      "text": "What security implications does the source report?"
    },
    {
      "irId": "ir-06",
      "text": "What cyber implications does the source report?"
    }
  ]
}
```

The approval command is:

```powershell
npm run approve:requirements -- <requirements-proposal.json> <approved-research-question.json> <reviewer-id>
```

It writes:

```text
runs/<runId>/requirements/<proposalId>/approved-requirements.json
```

The approved artifact contains:

- `approvalId`, derived as `approved-<proposalId>`.
- Question ID, run ID, exact question artifact reference, and exact question artifact SHA-256.
- Proposal artifact reference and SHA-256.
- Requirements copied without modification.
- Reviewer ID and controller-supplied approval time.

The approved research-question JSON does not contain its own artifact reference or checksum. The command computes both over the exact file bytes, adds them in memory, and calls `validateApprovedResearchQuestion`. Artifact references remain relative to the `app/` working directory.

Approval fails when IDs are unsafe or duplicated, the question or run does not match, the approved question is invalid, a requirement is empty or duplicated, or the output directory already exists. Panel 2 reads only the approved requirements artifact and cannot add, remove, or rewrite requirements.

### 3.3 Model Boundary

No live model API is approved. Do not add a provider SDK.

The PoC uses the existing manual bridge pattern:

```text
prepare immutable request
  -> interactive GitHub Copilot execution in a fresh chat
  -> save one typed response artifact
  -> deterministic record and validation command
```

The response records provider `github-copilot-vscode` and model `not-exposed-by-host`. A fresh session is a human attestation and cannot be proven by code. Azure AI Foundry remains deferred until its endpoint, deployment, authentication, region, and retention policy are approved.

## 4. Architecture and Side-Effect Boundary

Implementation remains inside the existing application:

```text
app/src/modules/assurance/
  types.ts
  validators.ts
  policy.ts
  snapshot-source.ts
  anchoring.ts
  ids.ts
  render-document.ts
  extract/
    request.ts
    checks.ts
    record.ts
  review/
    package.ts
    record.ts
  assemble.ts
  measure.ts
  events.ts
  policies/
    geopolitical-source-assurance-v1.json

app/src/commands/
  approve-requirements.ts
  prepare-assurance-extract.ts
  record-assurance-extract.ts
  prepare-assurance-review.ts
  record-assurance-review.ts
  assemble-assurance.ts
  measure-assurance.ts
```

The command layer owns:

- Argument and environment reads.
- Filesystem reads and writes.
- Path confinement.
- File checksums.
- Current time.
- Event appends.
- Console output and process exit.

Assurance modules receive parsed values, artifact references, checksums, and explicit timestamps. They return `Result<T, E>` values and data for the command to persist. `policy.ts` validates supplied policy data; it does not open a path. `snapshot-source.ts` validates supplied snapshot, decision, question, and source-document values; it does not read files. `events.ts` creates typed event data; it does not append files.

Use strict TypeScript, `NodeNext`, `.js` suffixes for relative imports, existing `Result<T, E>`, manual validators, `node:test`, and plain functions. Do not add Zod, Vitest, an SDK, a separate project, or a generic orchestration framework.

## 5. Commands and Artifact Addressing

Commands use explicit input paths, matching the current application convention:

```powershell
npm run approve:requirements -- <requirements-proposal.json> <approved-research-question.json> <reviewer-id>
npm run prepare:assurance-extract -- <approved-evidence-snapshot.json> <approved-requirements.json> <profile-policy.json>
npm run record:assurance-extract -- <extract-request.json> <copilot-response.json>
npm run prepare:assurance-review -- <extract-commit.json>
npm run record:assurance-review -- <review-package.json> <review-response.json>
npm run assemble:assurance -- <approved-evidence-snapshot.json> <extract-commit.json> <review-record.json>
npm run measure:assurance -- <source-note.json> <extract-stage-directory> <review-record.json>
```

All Panel 2 commands use:

```text
SOURCE_ASSURANCE_RUN_DIR ?? "runs"
```

Input paths are resolved from the current working directory and must remain inside that configured root, except the committed profile-policy path. Commands print the exact output path. They do not scan for artifacts by ID.

The evidence snapshot is stored under `runs/<decisionId>/`, while assurance output is stored under the source run:

```text
runs/<sourceRunId>/assurance/<snapshotId>/
```

Every canonical artifact write is non-overwriting. Directory creation must fail when a completed logical output already exists. Event logs are the append-only exception.

## 6. Admission and Source Validation

Before preparing Extract, the command reads and hashes:

1. The explicit approved snapshot path.
2. Its sibling `evidence-decision.json`.
3. The snapshot's approved research-question artifact.
4. The snapshot's referenced canonical source document.
5. The approved requirements artifact.
6. The profile policy.

The pure assurance validator requires:

- Snapshot ID equals `snapshot-<sourceDecisionId>`.
- The sibling decision is `approved` and has matching decision, run, candidate, reviewer, and intake identifiers.
- Snapshot run, candidate, and question identifiers agree throughout the nested item.
- The question artifact checksum equals the embedded approved-question checksum and validates after its reference and checksum are supplied in memory.
- The source-document artifact checksum equals the nested relevance-assessment checksum.
- `validateSourceDocument` succeeds.
- Source document, approved question, requirements approval, and snapshot use the same run ID.
- Requirements approval binds the exact approved-question artifact.

The Extract request and source note carry both:

- `snapshotArtifactRef` and `snapshotArtifactSha256`.
- `evidenceDecisionArtifactRef` and `evidenceDecisionArtifactSha256`.

This binds Panel 2 to the exact human-admitted input rather than to an ID alone.

## 7. Source Rendering and Anchoring

`renderDocumentForPrompt` emits every canonical segment in ordinal order:

```text
[segment: <segmentId>]
<segment text unchanged>

```

Marker lines are prompt framing and are not part of segment text. Publisher chrome is rendered like every other admitted segment. The prompt instructs the model not to create observations from chrome, while human review measures failures to follow that instruction.

`anchorQuote` receives a validated `SourceDocument`, its exact artifact reference and checksum, a segment ID, an exact quote, and the validated profile policy. It:

1. Resolves the named segment.
2. Enforces configured UTF-8 byte-length limits.
3. Finds the byte-exact quote exactly once inside that segment.
4. Constructs the existing `SourceAnchor` shape.
5. Calls Panel 1's `validateSourceAnchor` as the final authority.

Expected errors distinguish missing segments, invalid quote lengths, absent quotes, quotes repeated inside the named segment, and rejection by the source module. There is no tolerant locating in this PoC.

One observation has one anchor inside one segment. Support that cannot be represented without crossing a segment is split into atomic observations. Multi-anchor observations remain deferred until a real run demonstrates that this loses material meaning.

## 8. Core Types

```ts
import type { SourceAnchor } from "../../core/types.js";

export type ClaimKind = "event" | "statement" | "assessment" | "forecast";
export type AttributionKind = "direct" | "attributed" | "relayed";
export type DateRole =
  | "event"
  | "reporting"
  | "publication"
  | "reference"
  | "unknown";
export type Disposition = "covered" | "partial" | "silent" | "contradicted";
export type ReviewVerdict =
  | "supported"
  | "unsupported"
  | "duplicate"
  | "chrome";

export type ExtractObservation = {
  segmentId: string;
  quote: string;
  text: string;
  claimKind: ClaimKind;
  attribution: {
    kind: AttributionKind;
    attributedTo?: string;
  };
  date?: {
    text: string;
    role: DateRole;
  };
  actor?: string;
  action?: string;
  location?: string;
  affectedEntity?: string;
  irIds: string[];
};

export type ExtractDisposition = {
  irId: string;
  disposition: Disposition;
  observationIndexes: number[];
  note?: string;
};

export type ExtractOutput = {
  observations: ExtractObservation[];
  dispositions: ExtractDisposition[];
};

export type Observation = ExtractObservation & {
  observationId: string;
  anchor: SourceAnchor;
  origin: "model" | "human";
};

export type IRDisposition = {
  irId: string;
  disposition: Disposition;
  observationIds: string[];
  note?: string;
};

export type CheckFailure = {
  check: string;
  count: number;
  rule: string;
};

export type Assessment = {
  reliability: {
    access: "direct" | "indirect" | "unknown";
    accessRationale: string;
    trackRecord: "established" | "limited" | "unknown";
    trackRecordRationale: string;
    alignment: string;
  };
  dependency: {
    kind: "original" | "relayed" | "mixed" | "unknown";
    upstreamSources: string[];
    rationale: string;
  };
  limitations: string[];
};
```

Manual validators enforce exact allowed keys where artifacts cross the model or human boundary, bounded strings and arrays, path-safe IDs, valid times, policy enumerations, and all cross-reference rules.

A `statement` requires non-direct attribution and a non-empty `attributedTo`. A `relayed` observation requires an `attributedTo` naming the immediate upstream outlet or source.

Observation identity is:

```text
obs- + first 12 hex characters of SHA-256(
  sourceDocumentId
  + unit separator + segmentId
  + unit separator + quoteStartUtf8Byte
  + unit separator + quoteEndUtf8Byte
  + unit separator + claimKind
  + unit separator + text
)
```

The ID is deterministic for identical accepted content. It does not imply that repeated model runs reproduce the same observation set.

## 9. Extract Manual Goal Loop

### 9.1 Prepare Command

`prepare:assurance-extract`:

1. Validates and checksum-binds all inputs described in Section 6.
2. Refuses when the stage already has `extract-commit.json` or `extract-failed.json`.
3. Determines the next attempt from recorded attempt directories.
4. Requires a recorded failed prior attempt before preparing a retry.
5. Builds an immutable request with the same frozen source, requirements, and policy on every attempt.
6. Adds only typed prior check failures to a retry prompt.
7. Writes `attempt-<n>/extract-request.json` and its SHA-256 without overwriting.
8. Appends a content-free controller event.

The request contains stable lineage, attempt number, policy and requirements checksums, feedback, and the complete prompt. Because the prompt contains admitted source content, it remains under ignored `runs/`.

The request ID is content-addressed over its schema version, stage, attempt, snapshot checksum, source-document checksum, requirements checksum, policy checksum, prepared time, and feedback.

### 9.2 Copilot Response

The analyst opens a fresh Copilot chat, executes the prompt, and saves one typed response artifact beside the request:

```json
{
  "schemaVersion": "source-assurance-copilot-poc-response-v1",
  "requestId": "<exact request id>",
  "invocationId": "<human-assigned stable id>",
  "provider": "github-copilot-vscode",
  "model": "not-exposed-by-host",
  "startedAt": "<ISO timestamp>",
  "completedAt": "<ISO timestamp>",
  "freshSession": true,
  "capturedBy": "<reviewer id>",
  "proposal": {
    "observations": [],
    "dispositions": []
  }
}
```

The model supplies only `proposal`. The analyst supplies invocation metadata without changing the proposal. The response must bind the exact request, use the fixed provider and model values, have ordered timestamps no earlier than request preparation, attest a fresh session, and identify its capturer.

### 9.3 Record Command

`record:assurance-extract`:

1. Reads the explicit request and response paths and confines both to the run root.
2. Verifies request, response, source, snapshot, requirements, question, decision, and policy lineage.
3. Parses exactly one JSON response artifact and validates its wrapper.
4. Evaluates all applicable checks. E1 gates E2 through E9 because no typed proposal exists after an E1 parse or schema failure. Checks do not short-circuit once a typed proposal exists.
5. Writes `checks.json` for the attempt.
6. On success, derives anchors and IDs, replaces indexes with observation IDs, and writes `extract-commit.json`.
7. On retryable failure with budget remaining, leaves the stage open for the next prepare command.
8. On final failure, writes `extract-failed.json` and closes the stage.

No command automatically invokes the next stage.

Retry feedback includes only check IDs, counts, and fixed rules. It never includes source content, offending output, prior output, or a request to find more observations.

### 9.4 Prompt Policy

The system prompt specifies, in order:

1. Extract only what this admitted source asserts.
2. Produce one atomic claim per observation.
3. Copy byte-exact support from the named segment within policy limits.
4. Apply the fixed claim-kind, attribution, and date-role definitions.
5. Produce exactly one disposition for each approved IR.
6. Treat `silent` as a valid and expected result when the source does not address an IR.
7. Preserve out-of-IR observations with an empty `irIds` array.
8. Do not create observations from navigation, related links, footers, or other publisher chrome.
9. Return one JSON object matching the stated shape and no prose.

The user prompt contains only the approved question, approved requirements, hand-maintained output-shape description, full rendered canonical document, and typed retry feedback when applicable. It contains no provider summary, prior attempt, historical memo, organizational context, or example answer.

### 9.5 Extract Checks

| ID | Rule |
| --- | --- |
| E1 | The response contains exactly one JSON value and passes the strict manual response and `ExtractOutput` validators. |
| E2 | Every observation references an existing canonical segment. |
| E3 | Every quote satisfies policy length and occurs byte-exactly once inside its named segment. |
| E4 | Every observation IR ID is approved, unique within that observation, and path-safe. |
| E5 | Dispositions contain exactly one entry for every approved IR, no unknown IR, and no duplicate IR. |
| E6 | Every observation index is an in-range unique integer, and each disposition's index set exactly equals the indexes of observations tagged with that IR. `silent` therefore has an empty set; every other disposition has a non-empty set. |
| E7 | Statements use non-direct attribution with `attributedTo`; relayed observations always name the immediate upstream source. |
| E8 | Observation count is between zero and the policy maximum. Zero is valid when every IR is `silent`. |
| E9 | Every constructed anchor passes Panel 1's `validateSourceAnchor`. |

The PoC permits two attempts. The fixed NV document fits the current manual bridge, so chunking is not part of this experiment.

## 10. Reconciliation and Human Review

### 10.1 Review Package

`prepare:assurance-review` consumes only `extract-commit.json`. It writes once:

```text
review/review-package.json
review/review-package.sha256
```

The checksum is over the exact package file bytes and is stored externally to avoid a self-referential hash.

The package:

- Orders observations by segment ordinal and then anchor byte offset.
- Collapses exact duplicate observation IDs.
- Records extraction indexes and occurrence count for collapsed duplicates rather than repeating identical IDs as lineage.
- Retains model dispositions without modification.
- Contains no blank review fields.

### 10.2 Human Response

The analyst creates a new numbered response file for each attempt. Earlier response files are not edited after a record is attempted.

```json
{
  "packageSha256": "<exact review-package SHA-256>",
  "reviewerId": "FDIHR",
  "reviewedAt": "<ISO timestamp>",
  "verdicts": [
    {
      "observationId": "obs-...",
      "verdict": "supported"
    }
  ],
  "humanObservations": [],
  "irReview": [
    {
      "irId": "ir-01",
      "disposition": "covered"
    },
    {
      "irId": "ir-06",
      "disposition": "silent",
      "note": "The source reports no explicit cyber implication."
    }
  ],
  "assessment": {
    "reliability": {
      "access": "indirect",
      "accessRationale": "The publisher relays reporting and public statements.",
      "trackRecord": "unknown",
      "trackRecordRationale": "Track record was not established in this PoC.",
      "alignment": "Record the publisher's relevant interests, funders, state relationship, and audience when known."
    },
    "dependency": {
      "kind": "mixed",
      "upstreamSources": ["New York Times", "Wall Street Journal"],
      "rationale": "The article combines publisher narration with relayed reporting."
    },
    "limitations": []
  }
}
```

Each package observation receives exactly one verdict:

- `supported`: Its exact quote supports the observation text at the stated claim kind and attribution.
- `unsupported`: The quote does not support the text, kind, or attribution.
- `duplicate`: It duplicates an earlier package observation in meaning and names that earlier observation.
- `chrome`: It is derived from publisher-page chrome rather than article content.

The analyst then reads the complete canonical document once, adds every IR-relevant missed passage as a fully typed human observation, records one disposition per IR, and completes the source assessment. Human observations use the same quote, segment, policy, attribution, date-role, and IR rules as model observations.

`partial`, `silent`, and `contradicted` human dispositions require a non-empty note explaining the unresolved coverage or contradiction.

### 10.3 Record Review

`record:assurance-review`:

1. Verifies the response's package checksum against the exact package bytes.
2. Requires exactly one verdict per package observation and no unknown IDs.
3. Requires semantic duplicates to reference an earlier package observation.
4. Anchors every human observation through the same assurance and Panel 1 anchor validators.
5. Rejects duplicate human observation IDs and collisions that are not explicitly resolved.
6. Requires exactly one human disposition per approved IR and explanatory notes where required.
7. Validates reliability, dependency, and limitations.
8. Writes one immutable `review-record.json` binding the exact package and response checksums.

On failure, no review record is written. The analyst creates another numbered response artifact.

## 11. Source Note Assembly

`assemble:assurance` reads the explicit snapshot, Extract commit, and review record paths and reconstructs their full lineage. It fails rather than repairing inconsistencies.

Expected inconsistency errors include:

- Human `covered`, `partial`, or `contradicted` disposition without an accepted observation tagged to that IR.
- Human `silent` disposition while an accepted observation is tagged to that IR.
- Invalid assessment.
- Policy, requirements, snapshot, source-document, package, response, or commit checksum mismatch.

The source note uses disjoint observation collections:

```text
inScopeObservations
outOfIrObservations
```

It contains:

- Note schema version.
- Snapshot, decision, source run, question, and source-document IDs.
- Exact snapshot, decision, source-document, requirements, policy, Extract-attempt, review-package, review-response, and review-record artifact references and checksums.
- Provider, model, invocation, capturer, and fresh-session attestation.
- Accepted model and human observations with origin and exact anchor.
- Rejected model observations with review verdict, note, and duplicate target where applicable.
- Model, human, and final IR dispositions. Human disposition is final for the PoC.
- Source reliability and reporting-dependency assessment.
- Attribution summary derived from accepted observations.
- Caveats from contradictions, limitations, relayed reporting, and fresh-session attestation.
- Explicit gaps for `partial` and `silent` requirements, including the human note.

Claim kind and attribution cannot be upgraded or dropped during assembly.

## 12. Measurements and Pre-Registered Routing

`measure:assurance` writes `metrics.json` containing numbers and a controller-derived recommended next experiment. It contains no source text.

The five metric families are:

| Metric | Definition |
| --- | --- |
| `supportFailureRate` | Unsupported divided by supported plus unsupported model observations. Duplicate and chrome verdicts are excluded. |
| `chromeRate` | Chrome verdicts divided by all reviewed model observations after exact duplicate collapse. |
| `omissionCount` | Number of accepted human observations added during the complete-document omission pass. |
| `dispositionMismatches` | Total, overclaim, and underclaim counts comparing model and human IR dispositions. |
| `quoteFidelityFailures` | Sum of E3 failures across Extract attempts. |

Provisional routing rules for this experiment:

1. `supportFailureRate > 0.10` recommends a bounded semantic support checker.
2. Any IR overclaim or underclaim recommends improving or independently checking IR tagging and coverage. A disposition mismatch does not by itself recommend a support checker.
3. `omissionCount >= 2` recommends implementing blind IR-driven Sweep.
4. `chromeRate > 0.10` recommends evaluating an article-only canonicalization path in Panel 1, requiring a new canonical document and admission decision.
5. Quote-fidelity failure that exhausts the attempt budget recommends evaluating a locator that proposes an exact source span without weakening final byte-exact anchors.
6. When none applies, the PoC source note may proceed to the Panel 3 experiment with its declared limitations.

These thresholds are pre-registered for the first experiment and remain provisional until several sources have been measured.

## 13. Run Layout, Immutability, and Retention

```text
runs/research-cia-russia-20260828/
  requirements/
    nv-requirements-proposal-001/
      requirements-proposal.json
      approved-requirements.json
  assurance/
    snapshot-nv-evidence-review-001/
      extract/
        attempt-1/
          extract-request.json
          extract-request.sha256
          copilot-response.json
          checks.json
        attempt-2/
          ...
        extract-commit.json | extract-failed.json
      review/
        review-package.json
        review-package.sha256
        review-response-1.json
        review-response-2.json
        review-record.json
      source-note.json
      metrics.json
      events.jsonl
```

Canonical application outputs are write-once. Human response files are versioned inputs; after a record attempt, their exact bytes are preserved and checksum-bound by the resulting record or failure event. Event entries never contain prompts, source text, quotes, observation text, or sensitive context.

Everything under `runs/` remains ignored. The contract owner has confirmed that internal storage of retrieved provider content is permitted, so run artifacts may be retained in the tenant's controlled library. Committing provider content to git remains a separate deliberate decision: committed test data stays synthetic unless a specific fixture is explicitly approved. Content-free values such as counts, rates, and checksums may be recorded in committed documentation.

## 14. Tests

Use `node:test` and isolated temporary run roots. Construct invented canonical documents through `createSourceDocument`; do not manually forge provider artifacts or copy provider content.

Required coverage:

| Area | Cases |
| --- | --- |
| Snapshot and source | Valid admitted input, malformed snapshot, decision mismatch, checksum mismatch, question mismatch, and path escape. |
| Policy | Valid committed policy, unknown keys, invalid values, limits, and policy ID mismatch. |
| Requirements approval | Question checksum binding, question and run mismatch, duplicate IR ID, invalid text, path confinement, and non-overwrite. |
| Anchoring | Exact hit, Unicode byte offsets, repeated quote inside a segment, same quote in different segments, absent quote, length limits, and Panel 1 validator rejection. |
| IDs | Stability for identical input and change on text, kind, segment, or offset change. |
| Extract validation | Passing and failing fixtures for E1 through E9, including every disposition and exact E6 index-set equality. |
| Manual controller | Commit, retry feedback without prior content, exhausted attempts, response/request mismatch, invalid chronology, false fresh-session attestation, and non-overwrite. |
| Review package | Stable ordering, exact duplicate collapse, occurrence lineage, and external package checksum. |
| Review record | Verdict coverage, unknown ID, duplicate-reference order, human anchoring, collision handling, IR notes, assessment, and all-or-nothing rejection. |
| Assembly | Every typed inconsistency, disjoint observation collections, lineage, gaps, caveats, and attribution summary. |
| Measurement | All five metrics and every routing recommendation. |

Before completion, run from `app/`:

```powershell
npm test
npm run typecheck
npm run build
```

The real NV run is an ignored external check after deterministic tests pass. It is not a committed integration fixture.

## 15. PoC Versus Target Panel 2

| Target capability | PoC treatment | Trigger for later implementation |
| --- | --- | --- |
| Source-driven Extract | Present, whole canonical document | First admitted source that exceeds the practical input budget triggers bounded chunking. |
| Blind IR-driven Sweep | Human omission pass | `omissionCount >= 2`. |
| Code reconciliation plus bounded support check | Code validation and human support verdict | `supportFailureRate > 0.10`. |
| Single-source Assess model stage | Human source assessment | Source volume makes human assessment impractical. |
| Typed Write and semantic inflation check | Deterministic JSON assembly, no prose | Panel 3 or a reader requires prose. |
| Out-of-IR return to question gate | Preserved in note, not routed | Panel 1 gains a governed proposed-IR intake. |
| Generic goal-loop controller | Specialized Extract prepare/record pair | A second model stage demonstrates repeated behavior. |
| Tolerant quote locator | Absent | Exact quote failures exhaust the attempt budget. |
| Multi-anchor observation | Absent | Real extraction shows that atomic splitting loses material meaning. |
| Azure AI Foundry adapter | Manual Copilot bridge | Approved endpoint, deployment, authentication, region, and retention. |
| Structured alignment scoring | Bounded free text | A downstream memo standard consumes it. |

## 16. Remaining Decisions

These decisions do not block deterministic module construction unless stated:

1. Decide whether any specific provider-derived fixture should be committed to git now that internal storage is permitted; the default remains synthetic test data.
2. Decide how many measured sources are required before provisional metric thresholds become policy.
3. Confirm whether the 600 UTF-8 byte quote maximum is sufficient during the required preflight against the admitted NV document. Changing it before a run requires updating the versioned policy, not special-case code.
4. Fresh Copilot sessions remain human-attested rather than technically enforced for this PoC and must appear as a source-note limitation.
5. One analyst performs the PoC semantic review. A second-reviewer policy remains outside this experiment.

## 17. Implementation Sequence

1. Define assurance types, pure validators, profile-policy validation, snapshot/source validation, anchoring, observation IDs, and document rendering with synthetic tests.
2. Open the real NV source through the approved snapshot and resolve one hand-selected exact quote before creating a prompt.
3. Implement and test approved information-requirement creation.
4. Implement Extract request preparation, checks, response recording, immutable attempts, and content-free events.
5. Run deterministic tests, typecheck, and build before the first manual Copilot execution.
6. Execute the ignored NV Extract attempt through the manual bridge.
7. Implement review-package preparation, review recording, source-note assembly, and measurement with synthetic tests.
8. Complete the human review, assemble the ignored source note, calculate metrics, and record only permitted content-free outcomes.

## 18. Definition of Done

The PoC is complete when:

1. The ignored NV run contains a validated `source-note.json` and `metrics.json`.
2. Every accepted model or human observation resolves through Panel 1's exact `SourceAnchor` validator.
3. Every IR has a human-final disposition and every non-covered disposition has an explanation.
4. Every typed inconsistency and Extract check has focused synthetic coverage.
5. The controller cannot overwrite attempts, exceed its attempt budget, leak prior output into feedback, or advance without explicit commands.
6. `npm test`, `npm run typecheck`, and `npm run build` pass.
7. The five metric families produce a deterministic recommendation for the next experiment.
8. The implementation remains small enough to understand locally and introduces no orchestration framework or live model dependency.