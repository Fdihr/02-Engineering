# Threat Intelligence Memo Workflow

Status: Working architecture revised from live Seerist behavior; implementation pending.
Last updated: 2026-08-28
Visual: `../01-Architecture/memo-workflow-board.svg`
Seerist capability visual: `../01-Architecture/seerist-api-capability-board.svg`

The capability visual maps documented and live-tested API possibilities. The live findings determine provider-role boundaries; untested capabilities remain planning inputs rather than workflow contracts.

## Purpose

Turn a user's free-text intelligence need into a human-approved memo using:

1. A chat-first user experience.
2. Seerist as the primary threat-intelligence source, with human-approved Firecrawl fallback.
3. Goal-based agentic reasoning inside deterministic workflow controls.
4. Evidence-backed findings only.
5. Human approval before source analysis and before publication.
6. A complete, append-only analytical audit trail.

## Core principle

The model may propose meaning, plans, questions, summaries, and confidence. Deterministic code owns state, permissions, budgets, tool execution, evidence references, and valid transitions. Humans own the approval gates defined below.

## Observed Seerist role boundary

Normalization must assign each collected provider item one workflow role before evidence review:

| Role | Observed surfaces | Permitted use |
| --- | --- | --- |
| Evidence candidate | Analyst reports with captured bodies; source-linked breaking or verified-event records with status retained | Human evidence review; claim use only when content and lineage support the specific claim |
| Collection lead | News/social summaries, cluster records, hotspot cluster IDs, and Scribe-linked events | Discovery, prioritization, deduplication, or source retrieval; never direct claim support |
| Context | Country background, risk ratings, Pulse scores and forecasts, and future-event assessments | Attributed background or outlook; never independent corroboration of an event claim |

Provider role is determined from endpoint, source type, provenance, content depth, and retrieval limitations. Narrative wording, provider scores, or generated summaries cannot approve evidence or advance workflow state.

## Experience boundary

Phase 1 uses a simple chat interface.

The user can:

- Enter free text.
- Answer focused questions.
- Confirm or revise proposals.
- Approve or reject workflow gates.
- Provide rejection feedback in free text.

The chat is only the interaction surface. A typed workflow state must exist behind it; the conversation transcript must not be the system of record.

## End-to-end flow

1. Human-approved scope and research questions.
2. AI-proposed provider-neutral query intents compiled by deterministic code.
3. Two-pass Seerist collection: discovery, then one bounded gap-fill pass.
4. Role classification, lead resolution, normalization, deduplication, optional human-approved Firecrawl expansion, and human evidence approval.
5. One sequential Find -> Sweep -> Judge -> Write worker per approved evidence item.
6. Claim-centric synthesis by builder, challenger, and senior adjudicator.
7. Fixed-shell, adaptive-body memo generation with claim-level citations.
8. Independent AI verification plus deterministic validation, with at most two automatic revisions.
9. Human publication approval or typed revision routing.
10. Append-only event logging and immutable artifact versioning throughout the run.

# Part 1: How a Memo Starts

## Approved intake sequence

1. User submits a free-text problem statement.
2. Agent proposes a structured scope.
3. Human confirms or revises the scope.
4. Agent proposes research questions.
5. Human approves or revises the research questions.
6. Agent proposes provider-neutral discovery intents; deterministic code validates and compiles them into Seerist operations.
7. Deterministic code runs discovery and one bounded gap-fill pass, classifies provider roles, resolves eligible leads, then normalizes and deduplicates potential evidence.
8. If fewer than four usable evidence candidates remain, the agent may propose a Firecrawl expansion for human approval. Context and unresolved leads do not count toward this target.
9. Agent returns a compact evidence review in chat.
10. Human approves individual evidence items or selects a targeted return point.
11. Deterministic code seals the approved evidence snapshot for source analysis.

## Intake state machine

| State | Owner | Entry condition | Permitted next states |
|---|---|---|---|
| `memo_requested` | Human | Free-text request submitted | `scope_proposed`, `cancelled` |
| `scope_proposed` | Agent | Request parsed into required scope fields | `scope_approved`, `scope_revision` |
| `scope_revision` | Human + agent | Scope rejected or edited | `scope_proposed`, `cancelled` |
| `scope_approved` | Human | Required scope confirmed | `questions_proposed` |
| `questions_proposed` | Agent | Research questions generated | `questions_approved`, `questions_revision` |
| `questions_revision` | Human + agent | Question set rejected or edited | `questions_proposed`, `scope_revision`, `cancelled` |
| `questions_approved` | Human | Question set confirmed | `query_intents_proposed` |
| `query_intents_proposed` | Agent | Provider-neutral discovery intents produced | `collection_planned`, `query_revision` |
| `collection_planned` | Deterministic code | Intents compiled into valid Seerist operations | `collecting_seerist`, `query_revision`, `failed` |
| `collecting_seerist` | Deterministic code | Discovery and one gap-fill pass execute within budget | `evidence_normalized`, `budget_exhausted`, `failed` |
| `query_revision` | Agent + deterministic code | Query intent or compilation requires revision | `query_intents_proposed`, `questions_revision`, `failed` |
| `budget_exhausted` | Deterministic code | API-call or elapsed-time limit reached | `evidence_normalized`, `query_revision`, `cancelled` |
| `evidence_normalized` | Deterministic code | Results validated, deduplicated, and fingerprinted | `osint_expansion_proposed`, `evidence_ready` |
| `osint_expansion_proposed` | Agent | Fewer than four usable items remain | `osint_expansion_approved`, `osint_expansion_rejected` |
| `osint_expansion_approved` | Human | Firecrawl gap-search plan accepted | `collecting_osint` |
| `osint_expansion_rejected` | Human | Firecrawl expansion declined | `evidence_ready` |
| `collecting_osint` | Deterministic code | Approved Firecrawl plan executes and results are normalized | `evidence_ready`, `budget_exhausted`, `failed` |
| `evidence_ready` | Agent + code | Combined evidence review package produced | `evidence_approved`, `evidence_rejected` |
| `evidence_rejected` | Human | Reviewer supplies feedback and return point | `scope_revision`, `questions_revision`, `query_revision`, `cancelled` |
| `evidence_approved` | Human | Reviewer accepts one or more normalized items | `source_analysis_ready` |
| `source_analysis_ready` | Deterministic code | Approved evidence snapshot sealed | Source worker queue |
| `failed` | Deterministic code | Non-recoverable error recorded | Retry from last valid state or `cancelled` |
| `cancelled` | Human or policy | Run intentionally stopped | Terminal state |

State transitions must be explicit. An agent response alone cannot advance workflow state.

## Step 1: Free-text problem statement

### Input

A user starts the workflow by describing an intelligence need in natural language.

Example:

> Prepare a memo for regional leadership on cyber and physical threats affecting offshore wind operations in Northern Europe during the last 90 days.

### Required system behavior

1. Preserve the original request unchanged.
2. Assign a `runId` and timestamp.
3. Record the requesting user identity when available.
4. Detect whether the request is empty, incoherent, or outside the memo workflow.
5. Do not call Seerist at this stage.

### Output artifact

`MemoRequest`

```ts
type MemoRequest = {
  runId: string;
  originalText: string;
  requestedBy?: string;
  createdAt: string;
};
```

## Step 2: Structured scope proposal

The agent converts the problem statement into five required fields.

### Required scope fields

1. `purpose`: What the memo should help the reader understand or decide.
2. `threatTopic`: Threat, actor, event, issue, or exposure to investigate.
3. `audience`: Intended reader or decision-maker.
4. `geography`: Countries, regions, sites, or global scope.
5. `timeWindow`: Historical period and evidence-freshness boundary.

### Assumption rule

When a required field is absent, the agent proposes a reasonable value rather than immediately blocking the conversation.

Every inferred value must:

1. Be marked as an assumption.
2. Include a short explanation.
3. Remain editable by the user.
4. Be approved before question generation.

### Scope contract

```ts
type ScopeValue<T> = {
  value: T;
  origin: "user" | "inferred";
  assumptionReason?: string;
};

type MemoScope = {
  purpose: ScopeValue<string>;
  threatTopic: ScopeValue<string>;
  audience: ScopeValue<string>;
  geography: ScopeValue<string[]>;
  timeWindow: ScopeValue<{
    from: string;
    to: string;
  }>;
};
```

### Deterministic checks

- All five fields exist.
- Strings are not blank.
- Geography contains at least one value.
- `timeWindow.from` is before or equal to `timeWindow.to`.
- Inferred fields contain `assumptionReason`.

## Step 3: Human scope gate

The chat returns a concise scope proposal with visible assumptions.

The user may:

1. Approve it.
2. Edit one or more fields.
3. Reject it and provide free-text correction.
4. Cancel the memo run.

No research questions may be generated until the scope state is `scope_approved`.

## Step 4: Research-question proposal

The agent generates the research questions needed to address the approved scope.

There is no fixed question-count limit. This does not permit unbounded execution: only approved questions may run, and collection remains bounded by runtime budgets.

### Required fields per question

```ts
type ResearchQuestion = {
  id: string;
  question: string;
  rationale: string;
  scope: {
    threatTopic: string;
    geography: string[];
    timeWindow: {
      from: string;
      to: string;
    };
  };
  status: "proposed" | "approved" | "rejected";
};
```

### Question-quality checks

Before showing questions to the user, deterministic validation confirms:

1. Every question has a stable ID.
2. Every question contains question, rationale, and scope.
3. Every question maps to the approved memo scope.
4. Duplicate questions are flagged.
5. Questions do not silently expand geography or time window.
6. Questions are researchable using the currently allowed tools.

Semantic quality remains agent-assessed and human-approved.

## Step 5: Human question gate

The user reviews research intent, not Seerist endpoint syntax.

The user may:

1. Approve all questions.
2. Edit individual questions.
3. Add or remove questions.
4. Return to the memo scope.
5. Cancel the run.

Only questions in `approved` status may be converted into Seerist query operations.

## Step 6: Provider-neutral planning and bounded collection

The agent proposes semantic search intent. It never writes raw provider calls. Deterministic TypeScript validates each intent and compiles it through an allowed provider adapter.

### Query contracts

```ts
type SearchPass = "discovery" | "gap-fill" | "osint-gap";

type SearchIntent = {
  id: string;
  runId: string;
  researchQuestionIds: string[];
  pass: SearchPass;
  objective: string;
  concepts: {
    events: string[];
    actors: string[];
    entities: string[];
    geographies: string[];
    from: string;
    to: string;
  };
  queryVariants: string[];
  expectedEvidence: string;
  rationale: string;
};

type ProviderOperation = {
  id: string;
  searchIntentId: string;
  provider: "seerist" | "firecrawl";
  endpoint: string;
  filters: Record<string, string | number | boolean | string[]>;
};

type CollectionPlan = {
  id: string;
  runId: string;
  pass: SearchPass;
  intents: SearchIntent[];
  operations: ProviderOperation[];
  budgets: {
    maxApiCalls: number;
    maxElapsedMs: number;
    maxResultItems: number;
  };
};
```

### Two-pass Seerist strategy

1. Discovery uses only the approved scope and research questions.
2. Results are normalized before follow-up planning.
3. The agent may propose one gap-fill pass using entities, actors, events, sectors, and terminology found during discovery.
4. Deterministic code rejects scope expansion, unsupported filters, invalid dates, and operations outside the configured budget.
5. There is no open-ended saturation loop in V1.

### Four-source target and Firecrawl fallback

Four usable, distinct evidence items is a collection target, not a hard publication gate. Distinct items may still share a reporting origin; source independence is assessed later.

If fewer than four usable Seerist items remain after normalization:

1. The agent may propose provider-neutral `osint-gap` intents.
2. Deterministic code compiles them only to the configured Firecrawl adapter.
3. A human must approve the expansion before Firecrawl executes.
4. Firecrawl results use the same normalization, provenance, review, and source-worker contracts as Seerist results.
5. If the combined evidence set still contains fewer than four usable items, analysis proceeds with explicit limited-evidence status and lower confidence where warranted.

### Execution guardrails

1. Only approved research questions may execute.
2. One `Act` step equals one scoped provider operation.
3. API-call, elapsed-time, and result-count budgets are mandatory.
4. Provider credentials come from runtime configuration and never enter prompts, artifacts, or events.
5. Every request and response is represented by checksum-addressed artifacts.

### Normalized evidence record

```ts
type SourceContentCompleteness =
  | "full"
  | "substantive-partial"
  | "summary"
  | "snippet-only";

type SourceLineage = {
  publisher?: string;
  author?: string;
  contentType:
    | "seerist-analysis"
    | "third-party-reporting"
    | "official-primary"
    | "automated-event-data"
    | "other"
    | "unknown";
  evidenceOrder: "primary" | "secondary" | "unknown";
  upstreamSourceRefs: string[];
};

type EvidenceRecord = {
  id: string;
  runId: string;
  researchQuestionIds: string[];
  accessProvider: "seerist" | "firecrawl";
  providerRecordId?: string;
  title: string;
  lineage: SourceLineage;
  publishedAt?: string;
  retrievedAt: string;
  canonicalUrl?: string;
  geography: string[];
  originalLanguage: string;
  snippet: string;
  contentCompleteness: SourceContentCompleteness;
  claimEligibility: "eligible" | "qualified" | "collection-lead-only";
  retrievalLimitations: string[];
  contentArtifactRef: string;
  contentSha256: string;
  rawArtifactRef: string;
  rawSha256: string;
  fingerprint: string;
  duplicateOf?: string;
  reviewStatus: "candidate" | "approved" | "rejected";
};
```

One non-duplicate, human-approved `EvidenceRecord` is the execution unit for one source worker. A publisher is not an execution unit, and records are not clustered into events before source analysis.

### Observed source-eligibility rule

1. Full captured content, as observed for Seerist analyst reports, may support claims after lineage checks and human approval.
2. Substantive partial content may support only narrowly bounded claims, with retrieval limitations carried into Judge and synthesis.
3. News/social and tested cluster-article records exposed summaries and links but no body. They are collection leads until source content is retrieved.
4. Hotspots and Scribe-generated narratives are discovery aids. Resolve their source URLs or cluster IDs before evidence review.
5. Country background, risk ratings, and Pulse are attributed provider context. They do not independently corroborate event claims.
6. Breaking-event status and revision history must remain visible; future events describe anticipated events rather than proof that an incident occurred.
7. Access through Seerist does not make Seerist the author. Normalization records the actual publisher, author, content type, evidence order, and cited upstream sources when present.
8. `@timestamp` may represent ingest time, and targeted risk ratings exposed no freshness field. Preserve provider dates and always record retrieval time.
9. If authorship or lineage is unclear, source reliability defaults to `unknown`.

## Step 7: Evidence review package

The agent summarizes the normalized evidence for human review. Deterministic code assembles and validates the package.

### Required review content

1. Coverage by research question: answered, partial, or gap.
2. Source title and provenance: publisher, timestamp, provider ID, source system, and source link when available.
3. Short relevance summary for each source.
4. Known evidence gaps.
5. Agent confidence assessment.

### Confidence rule

Agent confidence is advisory metadata, not proof. It cannot replace provenance, source references, or human approval.

### Evidence review contract

```ts
type EvidenceReview = {
  runId: string;
  questions: Array<{
    researchQuestionId: string;
    coverage: "answered" | "partial" | "gap";
    evidenceIds: string[];
    relevanceSummary: string;
    knownGaps: string[];
    agentConfidence: "low" | "medium" | "high";
    confidenceReason: string;
  }>;
  budgetOutcome: {
    apiCallsUsed: number;
    elapsedMs: number;
    exhausted: boolean;
  };
  collectionOutcome: {
    usableEvidenceCount: number;
    targetEvidenceCount: 4;
    firecrawlUsed: boolean;
    limitedEvidence: boolean;
  };
};
```

### Deterministic package checks

- Every approved question has one coverage entry.
- Every cited evidence ID resolves to a normalized evidence record.
- Every non-gap entry has at least one source.
- Every gap contains an explanation.
- Budget usage is present.
- Every access provider resolves to the adapter that retrieved it.
- Duplicate records cannot be approved as separate worker inputs.
- The four-source target outcome and Firecrawl usage are explicit.
- Collection-lead-only records cannot enter the approved source-worker snapshot.

## Step 8: Human evidence gate

The human has final authority to release individual evidence items into the source-worker queue.

### Approval

Approval causes deterministic code to:

1. Seal an immutable snapshot containing only individually approved evidence items.
2. Record reviewer identity, timestamp, and approval decision.
3. Move workflow state to `evidence_approved` and then `source_analysis_ready`.
4. Prevent later collection from silently modifying the approved snapshot.

### Rejection

The reviewer supplies free-text feedback and selects the exact return point:

1. Structured scope.
2. Research questions.
3. Provider-neutral query planning.

```ts
type EvidenceReviewDecision = {
  runId: string;
  decision: "approved" | "rejected";
  reviewerId?: string;
  decidedAt: string;
  feedback?: string;
  approvedEvidenceIds?: string[];
  rejectedEvidenceIds?: string[];
  returnTo?: "scope" | "questions" | "query_plan";
};
```

A rejection must not restart the entire run unless the reviewer selects scope or cancels it.

## Chat interaction requirements

The chat should expose only the information needed for the current decision.

### Scope response

- Show the five scope fields.
- Clearly label inferred assumptions.
- Offer approve, edit, or cancel actions.

### Research-question response

- Show question, rationale, and scope.
- Do not show low-level Seerist API mechanics by default.
- Offer approve, edit, add, remove, return to scope, or cancel.

### Evidence-review response

- Group evidence by research question.
- Show compact provenance and relevance.
- Show gaps and confidence visibly.
- Offer approve or reject.
- On rejection, collect feedback and return-point choice.

The user may respond with free text at every gate. Buttons are conveniences, not required protocol.

## Intake invariants

1. No Seerist call before scope and questions are approved.
2. No unapproved research question may execute.
3. One `Act` step equals one scoped tool call.
4. Every evidence record retains provenance.
5. Agent confidence never substitutes for a source.
6. No source means no finding.
7. Evidence cannot enter a source worker without human approval.
8. Rejection returns to an explicit state.
9. Every transition is logged.
10. The approved evidence snapshot is immutable.

## Intake run artifacts

The logical run package contains:

- `memo-request.json`
- `scope.json`
- `research-questions.json`
- `search-intents.json`
- `collection-plans.json`
- `evidence-records.json`
- `evidence-review.json`
- `review-decisions.json`
- `run-events.jsonl`
- `run-manifest.json`

Proposed workspace location during development:

`01-Intelligence/01-Analysis/runs/<runId>/`

Storage implementation and retention remain configurable. The workflow contracts do not depend on a database or filesystem.

# Part 2: Per-Source Analysis and Cross-Source Synthesis

## Approved topology

Analysis fans out logically by source, but V1 executes workers sequentially:

1. Take the next approved normalized evidence item.
2. Run Find without access to Sweep output.
3. Run Sweep as a blind second extraction without access to Find output.
4. Give the original source and both extractions to Judge.
5. Give the adjudicated Judge brief to Write.
6. Persist one typed source intelligence note.
7. Continue to the next evidence item.
8. After all workers finish, synthesize across the completed notes.

V1 uses the strongest approved model for every semantic stage. Deterministic code records the model identifier, model configuration, prompt-template version, attempt, timing, and artifact references for every invocation.

Find and Sweep use separate, fresh model contexts with the same versioned extraction instructions and output schema. V1 may use the same strongest approved model for both passes; the model identity remains configurable so comparative testing can later evaluate separate model families.

## Deterministic stage envelope

Every semantic stage runs inside the same code-owned envelope:

1. `Reason`: create visible task metadata containing the stage goal, inputs, and allowed action. This is not hidden model chain-of-thought.
2. `Act`: perform one approved model or tool call.
3. `Observe`: validate and persist the returned artifact.
4. `Evidence Check`: accept the artifact, retry within budget, or record stage failure.

Agents cannot advance state, alter budgets, admit evidence, or overwrite artifacts.

All retrieved source content is untrusted data. Source workers have no provider tools and cannot follow source-embedded instructions, alter scope, change contracts, or advance workflow state. Suspicious instruction-like content is flagged as source text rather than executed.

## Find and Sweep

Find and Sweep use the same typed extraction contract. Each receives the approved source content, approved scope, and research questions. Sweep does not receive Find output, reducing anchoring and making agreement or disagreement meaningful.

V1 expects the complete captured source to fit within the configured model-input budget. It does not silently truncate, chunk, or select excerpts. An exceptional oversized source is recorded and routed for analyst handling.

Non-English sources are analyzed in their original language. Source support preserves the original excerpt and an English translation; the final memo is written in English. Translation ambiguity becomes an explicit caveat.

Find and Sweep each produce:

1. A concise descriptive source synopsis.
2. Atomic observations linked to one or more research questions.
3. Minimal direct support and a resolvable source location.
4. Dates and named entities when present.

```ts
type ExtractionPass = "find" | "sweep";

type ExtractedObservation = {
  id: string;
  researchQuestionIds: string[];
  scopeRelation: "approved-question" | "bounded-emergent";
  emergenceRationale?: string;
  statement: string;
  kind: "reported-fact" | "source-allegation" | "context" | "forecast";
  eventDate?: string;
  publishedAt?: string;
  temporalCaveat?: string;
  entities: string[];
  sourceLocator: {
    kind: "page" | "paragraph" | "section" | "timestamp" | "text-offset";
    value: string;
  };
  originalLanguage: string;
  originalSupportExcerpt: string;
  supportTranslationEnglish: string;
  upstreamSourceRefs: string[];
};

type SourceExtraction = {
  id: string;
  runId: string;
  evidenceId: string;
  pass: ExtractionPass;
  synopsis: string;
  observations: ExtractedObservation[];
  createdAt: string;
};
```

The synopsis is descriptive. Atomic observations remain the authoritative evidence units.

Material emergent observations may be retained when they remain inside the approved threat topic, geography, and time window. They must be labeled `bounded-emergent` and explain their relevance; they cannot silently expand collection scope.

## Judge

Judge acts as the senior threat-intelligence analyst for one source. It receives the original source plus both independent extractions and must:

1. Compare both passes against the source.
2. Merge duplicate observations.
3. Accept, qualify, or reject candidate observations.
4. Separate reported facts, source allegations, forecasts, and analytical judgments.
5. Preserve material disagreement, caveats, and missing information.
6. Assess source reliability from actual lineage and observable sourcing signals, not provider access or unsupported model memory.
7. Assess source reliability, information credibility, and analytic confidence separately.
8. Produce a typed brief plus a bounded analyst rationale for Write.

```ts
type QualitativeAssessment = {
  level: "unknown" | "low" | "moderate" | "high";
  rationale: string;
};

type AnalyticConfidence = QualitativeAssessment & {
  factors: {
    evidenceDirectness: string;
    informationCredibility: string;
    sourceIndependence: string;
    consistency: string;
    alternativeExplanations: string;
    materialGaps: string;
  };
  changeIndicators: string[];
};

type AdjudicatedSourceBrief = {
  id: string;
  runId: string;
  evidenceId: string;
  findExtractionId: string;
  sweepExtractionId: string;
  acceptedObservations: Array<{
    id: string;
    statement: string;
    derivedFromObservationIds: string[];
    researchQuestionIds: string[];
    kind: ExtractedObservation["kind"];
    sourceLocator: ExtractedObservation["sourceLocator"];
    originalSupportExcerpt: string;
    supportTranslationEnglish: string;
    qualification?: string;
  }>;
  rejectedObservations: Array<{
    observationIds: string[];
    reason: string;
  }>;
  analyticJudgments: Array<{
    id: string;
    statement: string;
    supportingObservationIds: string[];
    confidence: AnalyticConfidence;
  }>;
  sourceReliability: QualitativeAssessment;
  informationCredibility: QualitativeAssessment;
  contradictions: string[];
  caveats: string[];
  intelligenceGaps: string[];
  analystRationale: string;
};
```

No composite trust score is permitted. A high source-reliability rating does not automatically make every statement credible, and analytic confidence must state its own rationale.

The AI assigns analytic confidence using the governed factors in `AnalyticConfidence`. TypeScript verifies that all factors, evidence links, rationale, and change indicators are present; it does not calculate a numeric confidence score.

## Write

Write turns the adjudicated brief into one concise, typed source intelligence note. It may improve ordering and language, but it may not introduce a new factual claim, raise confidence, remove a caveat, or resolve a contradiction.

```ts
type SourceIntelligenceNote = {
  id: string;
  runId: string;
  evidenceId: string;
  adjudicatedBriefId: string;
  questionCoverage: Array<{
    researchQuestionId: string;
    coverage: "answered" | "partial" | "gap";
    acceptedObservationIds: string[];
  }>;
  synopsis: string;
  keyFindings: Array<{
    id: string;
    statement: string;
    acceptedObservationIds: string[];
    analyticJudgmentIds: string[];
  }>;
  narrative: string;
  sourceReliability: QualitativeAssessment;
  informationCredibility: QualitativeAssessment;
  contradictions: string[];
  caveats: string[];
  intelligenceGaps: string[];
};
```

Deterministic validation rejects any finding without a resolvable accepted observation or analytic judgment.

## Worker scheduling and failure

1. V1 processes source workers sequentially in stable evidence-ID order.
2. Stage retries are bounded by configuration.
3. A source that still fails is recorded as failed and excluded from synthesis.
4. The run continues automatically with successful notes.
5. Every failed approved source appears as an intelligence gap in synthesis and the memo.
6. Failed work never counts toward the four-source target.

## Supplemental upstream-source cycle

Workers record every cited upstream source, but unseen upstream material is never independent corroboration. Judge may nominate an upstream source for one post-worker retrieval cycle only when it could:

1. Establish or refute a key fact.
2. Resolve a material contradiction.
3. Change a key judgment or its confidence.
4. Close an approved research-question gap.
5. Determine whether several reports share one original source.

```ts
type SupplementalSourceLead = {
  id: string;
  runId: string;
  discoveredInEvidenceId: string;
  sourceReference: string;
  materialityCategory:
    | "key-fact"
    | "contradiction"
    | "judgment-or-confidence"
    | "question-gap"
    | "reporting-dependency";
  rationale: string;
  proposedQueryIntentId?: string;
  status: "recorded" | "proposed" | "approved" | "rejected" | "unretrievable";
};
```

After the initial worker queue completes, deterministic code consolidates nominated leads and permits one bounded supplemental retrieval cycle. A human approves candidate evidence before it enters new source workers. Approved additions are analyzed before synthesis; no newly discovered lead can trigger another supplemental cycle.

## Claim-centric synthesis

Cross-source synthesis does not merge prose. It builds and adjudicates a claim ledger:

1. `Builder` clusters equivalent claims, proposes support and conflict links, identifies reporting dependencies, and drafts question coverage.
2. `Challenger` independently tests bad merges, missed merges, circular reporting, false corroboration, unsupported judgments, hidden contradictions, and missing caveats.
3. `Adjudicator` acts as the senior analyst, resolves each challenge against the source notes and original evidence, and seals the final ledger.

The challenger cannot mutate the builder artifact. The adjudicator must explicitly dispose of every challenge.

```ts
type ReportingRelationship =
  | "independent"
  | "derivative"
  | "shared-origin"
  | "unknown";

type ClaimLedgerEntry = {
  id: string;
  linkedFindingId: string;
  statement: string;
  kind: "reported-fact" | "assessment" | "forecast";
  researchQuestionIds: string[];
  supportingObservationIds: string[];
  supportingSourceNoteIds: string[];
  contradictingObservationIds: string[];
  sourceRelationships: Array<{
    leftEvidenceId: string;
    rightEvidenceId: string;
    relationship: ReportingRelationship;
    rationale: string;
  }>;
  informationCredibility: QualitativeAssessment;
  analyticConfidence: AnalyticConfidence;
  singleSourceDependent: boolean;
  caveats: string[];
  status: "accepted" | "contested" | "rejected";
};

type LinkedFinding = {
  id: string;
  title: string;
  significance: string;
  claimLedgerIds: string[];
};

type EvidenceToJudgmentRecord = {
  id: string;
  judgmentClaimId: string;
  supportingFactClaimIds: string[];
  conflictingClaimIds: string[];
  inference: string;
  assumptions: string[];
  alternativeExplanations: string[];
  analyticConfidence: AnalyticConfidence;
};

type SynthesisChallenge = {
  id: string;
  claimLedgerEntryId?: string;
  category:
    | "bad-merge"
    | "missed-merge"
    | "source-dependency"
    | "unsupported-claim"
    | "missed-contradiction"
    | "missing-caveat";
  issue: string;
  evidenceRefs: string[];
  proposedResolution: string;
};

type AdjudicatedSynthesis = {
  id: string;
  runId: string;
  sourceNoteIds: string[];
  failedEvidenceIds: string[];
  claimLedger: ClaimLedgerEntry[];
  linkedFindings: LinkedFinding[];
  evidenceToJudgmentRecords: EvidenceToJudgmentRecord[];
  challengeDispositions: Array<{
    challengeId: string;
    decision: "accepted" | "partially-accepted" | "rejected";
    rationale: string;
  }>;
  keyJudgmentClaimIds: string[];
  questionCoverage: Array<{
    researchQuestionId: string;
    coverage: "answered" | "partial" | "gap";
    claimIds: string[];
  }>;
  unresolvedContradictions: string[];
  intelligenceGaps: string[];
  limitedEvidence: boolean;
};
```

Each ledger entry contains one independently testable proposition. Actor, action, target, timing, attribution, and consequence are split when they rely on different evidence or confidence. `LinkedFinding` recombines related atomic claims for readable analysis.

Single-source claims may become key judgments when directness and credibility warrant it. `singleSourceDependent` must remain visible, confidence must account for the dependence, and the collection gap must be stated.

## Analysis invariants

1. Find and Sweep are independent extractions.
2. Judge checks both extractions against the original source.
3. Write cannot add claims or remove qualifications.
4. Every source note resolves to one approved evidence item.
5. Source count never substitutes for source independence.
6. Builder, challenger, and adjudicator outputs are separate immutable artifacts.
7. Every accepted ledger claim resolves to admitted source evidence.
8. Contradictions and failed sources remain visible.
9. No source means no finding.
10. Every analytical judgment has one evidence-to-judgment record.
11. Unseen upstream citations never count as independent support.
12. Source-embedded instructions are never executable workflow input.

# Part 3: Memo Output, Verification, and Publication

## Memo structure

V1 produces canonical structured JSON and a deterministic Markdown rendering. The memo uses a fixed assurance shell with an adaptive analytical body.

Required shell:

1. Scope and time window.
2. BLUF.
3. Key judgments with analytic confidence.
4. Adaptive analysis sections driven by the approved research questions and evidence.
5. Uncertainties and competing explanations.
6. Intelligence gaps, including failed approved sources.
7. Outlook and watch indicators.
8. Traceable source appendix.

```ts
type MemoStatement = {
  id: string;
  text: string;
  claimLedgerIds: string[];
};

type MemoSection = {
  id: string;
  heading: string;
  statements: MemoStatement[];
};

type MemoDocument = {
  id: string;
  runId: string;
  version: number;
  status: "draft" | "approved" | "rejected";
  scope: MemoScope;
  bluf: MemoStatement[];
  keyJudgments: Array<{
    statement: MemoStatement;
    analyticConfidence: QualitativeAssessment;
  }>;
  adaptiveAnalysis: MemoSection[];
  uncertainties: MemoStatement[];
  competingExplanations: MemoStatement[];
  intelligenceGaps: string[];
  outlook: MemoStatement[];
  watchIndicators: MemoStatement[];
  sourceEvidenceIds: string[];
  createdAt: string;
};
```

Every factual assertion and analytical judgment must carry one or more claim-ledger IDs. The Markdown renderer converts these links into concise claim-level citations and a provenance appendix.

## Independent AI verification

The memo writer cannot approve its own work. An independent AI verifier compares the draft against the adjudicated synthesis and reports:

1. Unsupported or invented claims.
2. Misstated source content.
3. Confidence inflation.
4. Omitted caveats or contradictions.
5. Citation mismatch.
6. Missing research-question coverage.
7. Internal inconsistency.
8. Omitted key judgments or bounded emergent findings.
9. Buried significance or distorted emphasis.
10. Missing competing explanations.

```ts
type MemoVerification = {
  id: string;
  runId: string;
  memoId: string;
  memoVersion: number;
  verdict: "pass" | "revise" | "escalate";
  findings: Array<{
    id: string;
    severity: "low" | "medium" | "high";
    category:
      | "unsupported-claim"
      | "source-misstatement"
      | "confidence-inflation"
      | "missing-caveat"
      | "citation-mismatch"
      | "coverage-gap"
      | "internal-inconsistency"
      | "omitted-key-judgment"
      | "buried-significance"
      | "missing-alternative"
      | "distorted-emphasis";
    memoStatementId?: string;
    claimLedgerIds: string[];
    issue: string;
    requiredAction: string;
  }>;
};
```

Deterministic code separately validates schemas, mandatory sections, claim and citation resolution, artifact versions, evidence-chain completeness, and checksums.

The writer and verifier may complete at most two automatic correction cycles. Unresolved findings then require human action.

## Human publication gate

All generated memos remain `draft` until a human approves publication. A reviewer may approve, reject, or request revision.

```ts
type MemoReviewDecision = {
  id: string;
  runId: string;
  memoId: string;
  memoVersion: number;
  decision: "approved" | "rejected" | "revision-requested";
  reviewerId?: string;
  decidedAt: string;
  feedback?: string;
  issueType?: "editorial" | "judgment" | "source" | "evidence-gap";
};
```

Revision routing is owned by deterministic code:

| Issue type | Return stage |
|---|---|
| `editorial` | Memo writer |
| `judgment` | Synthesis builder, challenger, and adjudicator |
| `source` | A new version of the affected source worker |
| `evidence-gap` | Bounded query planning and renewed human evidence approval |

Reopened stages create new artifact versions. Prior versions remain immutable and linked in the event history.

## Output invariants

1. Canonical JSON is the system of record; Markdown is a rendering.
2. A memo cannot enter human review until AI and deterministic verification pass or explicitly escalate.
3. Every factual assertion and judgment has a claim-level citation.
4. Limited evidence, conflicts, failed sources, and unanswered questions remain visible.
5. Only a human can change memo status to `approved`.
6. Revision returns to the stage that owns the issue.

# Part 4: Built-In Event Log and Artifact Integrity

## Purpose

Every run writes a complete analytical audit trail from request creation through completion, failure, cancellation, or restart. V1 saves this log in the background; a timeline UI and audit export are deferred to V2.

The event log is canonical, append-only, and compact. Full sources, prompts, model responses, analyses, and memo versions live in the controlled artifact store. Events reference those artifacts by stable ID and SHA-256 checksum.

## Event envelope

```ts
type ArtifactReference = {
  id: string;
  path: string;
  mediaType: string;
  version: number;
  sha256: string;
};

type RunEvent = {
  schemaVersion: 1;
  eventId: string;
  runId: string;
  sequence: number;
  occurredAt: string;
  actor: {
    type: "human" | "agent" | "system" | "tool";
    id?: string;
  };
  stage: string;
  eventType: string;
  status: "started" | "completed" | "failed" | "cancelled";
  correlationId?: string;
  causationEventId?: string;
  inputArtifacts: ArtifactReference[];
  outputArtifacts: ArtifactReference[];
  decision?: {
    outcome: string;
    rationale?: string;
  };
  modelInvocation?: {
    provider: string;
    model: string;
    configurationRef: string;
    promptTemplateVersion: string;
    attempt: number;
    durationMs?: number;
    inputTokens?: number;
    outputTokens?: number;
  };
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  previousEventHash: string;
  eventHash: string;
};
```

The event payload must never contain credentials, API keys, access tokens, or hidden model chain-of-thought.

## Required event families

At minimum, the event writer records:

1. Run creation, recovery, restart, cancellation, failure, and completion.
2. Scope, question, OSINT-expansion, evidence, and publication decisions.
3. Query intent proposal, plan validation, provider calls, normalization, deduplication, and budgets.
4. Every Find, Sweep, Judge, Write, builder, challenger, adjudicator, writer, and verifier invocation.
5. Artifact creation, validation, rejection, replacement, and version linkage.
6. Worker retries and permanent source failures.
7. Deterministic validation results and revision routing.

## Single writer and hash chain

One deterministic event writer owns sequence assignment and append operations. This remains true even if worker execution becomes parallel in a later version.

For each event:

1. Assign the next monotonic sequence number.
2. Set `previousEventHash` to the preceding event hash, or the configured genesis value for sequence 1.
3. Canonicalize the event without `eventHash`.
4. Calculate and store its SHA-256 `eventHash`.
5. Append exactly one JSON object to `run-events.jsonl`.

The chain is tamper-evident, not digitally signed.

## Sealed run manifest

Completion, failure, or cancellation creates a manifest:

```ts
type RunManifest = {
  schemaVersion: 1;
  runId: string;
  status: "completed" | "failed" | "cancelled" | "restarted";
  createdAt: string;
  sealedAt: string;
  eventCount: number;
  firstEventHash: string;
  finalEventHash: string;
  eventLog: ArtifactReference;
  artifacts: ArtifactReference[];
  previousRunId?: string;
  manifestSha256: string;
};
```

The manifest inventories every retained artifact and seals the final event-chain hash. Managed digital signing may be added later if independent non-repudiation becomes a requirement.

## Recovery

When an interrupted run is opened:

1. Deterministic code verifies the event chain and all referenced artifact checksums.
2. The system identifies the first incomplete stage after the last valid checkpoint.
3. The analyst chooses either `resume` or `restart`.
4. Resume continues without rerunning valid completed stages.
5. Restart creates a new run ID and links the new manifest to the prior run.
6. The choice is itself an event.

## Logical run package

```text
runs/<runId>/
  memo-request.json
  scope.json
  research-questions.json
  collection/
  evidence/
  source-workers/<evidenceId>/
    find.json
    sweep.json
    judge.json
    source-note.json
  synthesis/
    builder.json
    challenger.json
    adjudicated.json
  memo/
    memo.v<version>.json
    memo.v<version>.md
    verification.v<version>.json
    review-decisions.json
  run-events.jsonl
  run-manifest.json
```

## V1 and V2 boundary

V1 ends with a trusted external threat-intelligence memo. It does not use Vestas internal context to influence extraction, source judgment, or factual synthesis.

When an approved V1 question asks what an event means for Vestas, V1 answers the external facts and generic wind-sector implications, then explicitly defers Vestas-specific conclusions to the governed V2 context stage.

V2 may add, after factual synthesis:

1. A separate Vestas relevance and impact-mapping stage using explicitly approved internal context.
2. Event-log timeline, search, filtering, and audit-package export.
3. Parallel source-worker scheduling without changing worker contracts.
4. Managed signing of sealed manifests if required.

### Designed V2 Vestas-context tool

The future stage uses a deterministic, read-only adapter to a governed Vestas information database after external synthesis. The agent queries only for context relevant to adjudicated external claims. External facts and Vestas impact judgments remain separate artifacts and use separate citations.

The database should eventually provide authoritative, time-bounded context for Vestas footprint, including relevant locations, sites, projects, service operations, business activities, assets, technologies, suppliers, dependencies, and ownership. Exact context taxonomy and source governance require a dedicated V2 design exercise.

```ts
type VestasContextAssessment = {
  id: string;
  runId: string;
  externalClaimIds: string[];
  footprintMatches: Array<{
    contextRecordId: string;
    relationship: string;
    validityFrom?: string;
    validityTo?: string;
    sourceArtifactRef: string;
  }>;
  riskNarrative: string;
  contextRecordIds: string[];
  caveats: string[];
  unknowns: string[];
};
```

The V2 output is a footprint match plus an evidence-linked Vestas risk narrative. Detailed consequence pathways, recommendation logic, access classification, freshness policy, and database schema remain deliberately open until the V2 grill.

## Implementation parameters still to set

1. Exact Seerist endpoint and filter mappings.
2. Numeric provider budgets and source-stage retry limits.
3. Approved model identifier and runtime configuration.
4. Artifact retention period and access-control implementation.
5. Source-content eligibility thresholds calibrated from real Seerist outputs.
