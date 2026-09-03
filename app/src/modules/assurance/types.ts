import type {
  ApprovedResearchQuestion,
  SourceAnchor,
  SourceDocument
} from "../../core/types.js";

export const APPROVED_REQUIREMENTS_SCHEMA_VERSION =
  "approved-requirements-v1" as const;
export const EXTRACT_REQUEST_SCHEMA_VERSION =
  "source-assurance-extract-request-v2" as const;
export const EXTRACT_RESPONSE_SCHEMA_VERSION =
  "source-assurance-copilot-poc-response-v2" as const;
export const EXTRACT_COMMIT_SCHEMA_VERSION =
  "source-assurance-extract-commit-v2" as const;
export const REVIEW_PACKAGE_SCHEMA_VERSION =
  "source-assurance-review-package-v1" as const;
export const REVIEW_RESPONSE_SCHEMA_VERSION =
  "source-assurance-review-response-v1" as const;
export const REVIEW_RECORD_SCHEMA_VERSION =
  "source-assurance-review-record-v1" as const;
export const SOURCE_NOTE_SCHEMA_VERSION = "source-intelligence-note-v1" as const;
export const ASSURANCE_METRICS_SCHEMA_VERSION =
  "source-assurance-metrics-v1" as const;
export const ATTEMPT_AUTHORISATION_SCHEMA_VERSION =
  "source-assurance-attempt-authorisation-v1" as const;

export const EXTRACT_PROVIDER = "github-copilot-vscode" as const;
export const EXTRACT_MODEL = "not-exposed-by-host" as const;

export type ClaimKind = "event" | "statement" | "assessment" | "forecast";
export type AttributionKind = "direct" | "attributed" | "relayed";
export type DateRole =
  | "event"
  | "reporting"
  | "publication"
  | "reference"
  | "unknown";
export type Disposition = "covered" | "partial" | "silent" | "contradicted";
export type ReviewVerdict = "supported" | "unsupported" | "duplicate" | "chrome";

/** Closed set of transformations permitted when locating a proposed quote. */
export type QuoteMatchRule =
  | "markdown-escape"
  | "whitespace-collapse"
  | "quote-variants"
  | "nfc";

/** Empty rule usage means the quote was already byte-exact. */
export type QuoteMatchProvenance = "exact" | QuoteMatchRule[];

export type ProfilePolicyLimits = {
  quoteMinUtf8Bytes: number;
  quoteMaxUtf8Bytes: number;
  textMaxChars: number;
  maxObservations: number;
  maxAttempts: number;
};

export type ProfilePolicy = {
  policyId: string;
  claimKinds: ClaimKind[];
  attributionKinds: AttributionKind[];
  dateRoles: DateRole[];
  dispositions: Disposition[];
  reviewVerdicts: ReviewVerdict[];
  quoteMatchRules: QuoteMatchRule[];
  limits: ProfilePolicyLimits;
};

export type RequirementDefinition = {
  irId: string;
  text: string;
};

export type RequirementsProposal = {
  proposalId: string;
  questionId: string;
  runId: string;
  requirements: RequirementDefinition[];
};

export type ApprovedRequirements = {
  schemaVersion: typeof APPROVED_REQUIREMENTS_SCHEMA_VERSION;
  approvalId: string;
  proposalId: string;
  questionId: string;
  runId: string;
  questionArtifactRef: string;
  questionArtifactSha256: string;
  proposalArtifactRef: string;
  proposalArtifactSha256: string;
  requirements: RequirementDefinition[];
  approvedBy: string;
  approvedAt: string;
};

export type ArtifactBinding = {
  artifactRef: string;
  artifactSha256: string;
};

/** The exact human-admitted evidence input, with every referenced artifact checksum-bound. */
export type AdmittedSource = {
  snapshotId: string;
  sourceDecisionId: string;
  runId: string;
  candidateId: string;
  reviewerId: string;
  admittedAt: string;
  snapshot: ArtifactBinding;
  evidenceDecision: ArtifactBinding;
  sourceDocumentArtifact: ArtifactBinding;
  researchQuestion: ApprovedResearchQuestion;
  sourceDocument: SourceDocument;
  sourceLimitations: string[];
};

export type ExtractObservation = {
  /** Short ordinal alias shown in the prompt; code maps it to the canonical segment. */
  segment: string;
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
  note?: string;
};

export type ExtractOutput = {
  observations: ExtractObservation[];
  dispositions: ExtractDisposition[];
};

export type Observation = ExtractObservation & {
  observationId: string;
  segmentId: string;
  anchor: SourceAnchor;
  origin: "model" | "human";
  proposedQuote: string;
  matchedVia: QuoteMatchProvenance;
  /** Set at assembly when review removed a requirement tag; `irIds` keeps the proposal. */
  correctedIrIds?: string[];
};

export type CheckDefinition = {
  id: string;
  rule: string;
};

/** The exact contract an attempt was judged under. */
export type ExtractContract = {
  requestSchemaVersion: typeof EXTRACT_REQUEST_SCHEMA_VERSION;
  responseSchemaVersion: typeof EXTRACT_RESPONSE_SCHEMA_VERSION;
  checks: CheckDefinition[];
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

export type AssuranceLineage = {
  snapshot: ArtifactBinding;
  evidenceDecision: ArtifactBinding;
  researchQuestion: ArtifactBinding;
  sourceDocument: ArtifactBinding;
  requirements: ArtifactBinding;
  policy: ArtifactBinding;
};

export type ExtractRequest = {
  schemaVersion: typeof EXTRACT_REQUEST_SCHEMA_VERSION;
  id: string;
  stage: "extract";
  attempt: number;
  preparedAt: string;
  runId: string;
  snapshotId: string;
  sourceDecisionId: string;
  candidateId: string;
  sourceDocumentId: string;
  researchQuestionId: string;
  requirementsApprovalId: string;
  policyId: string;
  contract: ExtractContract;
  lineage: AssuranceLineage;
  feedback: CheckFailure[] | null;
  prompt: {
    system: string;
    user: string;
  };
};

export type ExtractResponse = {
  schemaVersion: typeof EXTRACT_RESPONSE_SCHEMA_VERSION;
  requestId: string;
  invocationId: string;
  provider: typeof EXTRACT_PROVIDER;
  model: typeof EXTRACT_MODEL;
  startedAt: string;
  completedAt: string;
  freshSession: true;
  capturedBy: string;
  proposal: ExtractOutput;
};

export type ExtractInvocation = {
  id: string;
  provider: typeof EXTRACT_PROVIDER;
  model: typeof EXTRACT_MODEL;
  startedAt: string;
  completedAt: string;
  freshSession: true;
  capturedBy: string;
  request: ArtifactBinding;
  response: ArtifactBinding;
};

export type ExtractCommit = {
  schemaVersion: typeof EXTRACT_COMMIT_SCHEMA_VERSION;
  id: string;
  requestId: string;
  attempt: number;
  committedAt: string;
  runId: string;
  snapshotId: string;
  sourceDecisionId: string;
  sourceDocumentId: string;
  researchQuestionId: string;
  requirementsApprovalId: string;
  policyId: string;
  contract: ExtractContract;
  lineage: AssuranceLineage;
  invocation: ExtractInvocation;
  observations: Observation[];
  dispositions: IRDisposition[];
};

export type ReviewPackageObservation = Observation & {
  extractIndexes: number[];
  occurrences: number;
};

export type ReviewPackage = {
  schemaVersion: typeof REVIEW_PACKAGE_SCHEMA_VERSION;
  id: string;
  createdAt: string;
  runId: string;
  snapshotId: string;
  sourceDocumentId: string;
  extractCommit: ArtifactBinding;
  requirements: RequirementDefinition[];
  observations: ReviewPackageObservation[];
  modelDispositions: IRDisposition[];
};

export type ReviewVerdictEntry = {
  observationId: string;
  verdict: ReviewVerdict;
  note?: string;
  duplicateOf?: string;
  /** Supported observations only: the proposed tags minus those the observation does not answer. */
  correctedIrIds?: string[];
};

export type IRReviewEntry = {
  irId: string;
  disposition: Disposition;
  note?: string;
};

/** `not-performed` keeps an unmeasured omission count out of the metrics as null, never zero. */
export type OmissionPass = "performed" | "not-performed";

/** Rows-only dispositions cannot detect an under-claim, because nobody read the source. */
export type IRReviewBasis = "rows-only" | "full-source";

export type ReviewResponse = {
  packageSha256: string;
  reviewerId: string;
  reviewedAt: string;
  omissionPass: OmissionPass;
  verdicts: ReviewVerdictEntry[];
  humanObservations: ExtractObservation[];
  irReview: IRReviewEntry[];
  assessment: Assessment;
};

export type ReviewRecord = {
  schemaVersion: typeof REVIEW_RECORD_SCHEMA_VERSION;
  id: string;
  recordedAt: string;
  runId: string;
  snapshotId: string;
  policyId: string;
  reviewerId: string;
  reviewedAt: string;
  omissionPass: OmissionPass;
  irReviewBasis: IRReviewBasis;
  reviewPackage: ArtifactBinding;
  reviewResponse: ArtifactBinding;
  verdicts: ReviewVerdictEntry[];
  humanObservations: Observation[];
  irReview: IRReviewEntry[];
  assessment: Assessment;
};

export type NoteIRDisposition = {
  irId: string;
  modelDisposition: Disposition;
  humanDisposition: Disposition;
  finalDisposition: Disposition;
  observationIds: string[];
  note?: string;
};

export type RejectedObservation = {
  observationId: string;
  verdict: Exclude<ReviewVerdict, "supported">;
  note?: string;
  duplicateOf?: string;
};

export type AttributionSummaryEntry = {
  kind: AttributionKind;
  attributedTo?: string;
  count: number;
};

export type NoteGap = {
  irId: string;
  disposition: Extract<Disposition, "partial" | "silent">;
  note?: string;
};

export type SourceNote = {
  schemaVersion: typeof SOURCE_NOTE_SCHEMA_VERSION;
  id: string;
  assembledAt: string;
  runId: string;
  snapshotId: string;
  sourceDecisionId: string;
  candidateId: string;
  researchQuestionId: string;
  sourceDocumentId: string;
  lineage: AssuranceLineage & {
    contract: ExtractContract;
    extractCommit: ArtifactBinding;
    reviewPackage: ArtifactBinding;
    reviewResponse: ArtifactBinding;
    reviewRecord: ArtifactBinding;
    invocation: ExtractInvocation;
  };
  inScopeObservations: Observation[];
  outOfIrObservations: Observation[];
  rejectedObservations: RejectedObservation[];
  irDispositions: NoteIRDisposition[];
  assessment: Assessment;
  attributionSummary: AttributionSummaryEntry[];
  caveats: string[];
  gaps: NoteGap[];
};

/** Explicit human authorisation for a new extract stage after a failed one. */
export type AttemptAuthorisation = {
  schemaVersion: typeof ATTEMPT_AUTHORISATION_SCHEMA_VERSION;
  id: string;
  runId: string;
  snapshotId: string;
  sequence: number;
  stageDirectory: string;
  supersededStageDirectory: string;
  supersededFailure: ArtifactBinding;
  policyId: string;
  policy: ArtifactBinding;
  reason: string;
  /** Present only when a stored proposal is re-validated under a relaxed bookkeeping contract. */
  revalidation?: {
    rule: string;
    originatingInvocationId: string;
    originatingResponse: ArtifactBinding;
  };
  authorisedBy: string;
  authorisedAt: string;
};

export type AssuranceMetrics = {
  schemaVersion: typeof ASSURANCE_METRICS_SCHEMA_VERSION;
  measuredAt: string;
  runId: string;
  snapshotId: string;
  reviewedModelObservations: number;
  supportFailureRate: number | null;
  chromeRate: number | null;
  omissionCount: number | null;
  irReviewBasis: IRReviewBasis;
  dispositionMismatches: {
    total: number;
    overclaims: number;
    underclaims: number | null;
  };
  quoteFidelityFailures: number;
  transcriptionFidelity: {
    exact: number;
    normalised: number;
    ruleCounts: Record<string, number>;
  };
  tagPrecision: {
    tagsProposed: number;
    tagsRemoved: number;
    precision: number | null;
  };
  recommendations: string[];
};
