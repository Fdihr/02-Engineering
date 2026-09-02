import type {
  ApprovedResearchQuestion,
  SourceAnchor,
  SourceDocument
} from "../../core/types.js";

export const APPROVED_REQUIREMENTS_SCHEMA_VERSION =
  "approved-requirements-v1" as const;
export const EXTRACT_REQUEST_SCHEMA_VERSION =
  "source-assurance-extract-request-v1" as const;
export const EXTRACT_RESPONSE_SCHEMA_VERSION =
  "source-assurance-copilot-poc-response-v1" as const;
export const EXTRACT_COMMIT_SCHEMA_VERSION =
  "source-assurance-extract-commit-v1" as const;
export const REVIEW_PACKAGE_SCHEMA_VERSION =
  "source-assurance-review-package-v1" as const;
export const REVIEW_RESPONSE_SCHEMA_VERSION =
  "source-assurance-review-response-v1" as const;
export const REVIEW_RECORD_SCHEMA_VERSION =
  "source-assurance-review-record-v1" as const;
export const SOURCE_NOTE_SCHEMA_VERSION = "source-intelligence-note-v1" as const;
export const ASSURANCE_METRICS_SCHEMA_VERSION =
  "source-assurance-metrics-v1" as const;

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
};

export type IRReviewEntry = {
  irId: string;
  disposition: Disposition;
  note?: string;
};

export type ReviewResponse = {
  packageSha256: string;
  reviewerId: string;
  reviewedAt: string;
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

export type AssuranceMetrics = {
  schemaVersion: typeof ASSURANCE_METRICS_SCHEMA_VERSION;
  measuredAt: string;
  runId: string;
  snapshotId: string;
  reviewedModelObservations: number;
  supportFailureRate: number | null;
  chromeRate: number | null;
  omissionCount: number;
  dispositionMismatches: {
    total: number;
    overclaims: number;
    underclaims: number;
  };
  quoteFidelityFailures: number;
  recommendations: string[];
};
