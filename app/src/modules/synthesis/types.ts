import type {
  ArtifactBinding,
  ClaimKind,
  Disposition,
  NoteObservation,
  SourceNote
} from "../assurance/types.js";

export const OUTLET_IDENTITY_SCHEMA_VERSION = "outlet-identity-table-v1" as const;
export const SYNTHESIS_POLICY_SCHEMA_VERSION = "synthesis-profile-policy-v1" as const;
export const BUILD_ENVELOPE_SCHEMA_VERSION = "synthesis-build-envelope-v1" as const;
export const LEGACY_BUILD_REQUEST_SCHEMA_VERSION = "synthesis-build-request-v1" as const;
export const LEGACY_BUILD_REQUEST_SCHEMA_VERSION_V2 = "synthesis-build-request-v2" as const;
export const BUILD_REQUEST_SCHEMA_VERSION = "synthesis-build-request-v3" as const;
export const BUILD_RESPONSE_SCHEMA_VERSION = "synthesis-build-copilot-response-v1" as const;
export const BUILD_RECORD_SCHEMA_VERSION = "synthesis-build-record-v1" as const;
export const EXTERNAL_SYNTHESIS_SCHEMA_VERSION = "external-synthesis-v1" as const;
export const BUILD_PROVIDER = "github-copilot-vscode" as const;
export const BUILD_MODEL = "not-exposed-by-host" as const;

export type ReportingRelationship =
  | "independent"
  | "derivative"
  | "shared-origin"
  | "unknown";

export type ExternalClaimKind =
  | "reported-fact"
  | "statement"
  | "analytic-assessment"
  | "analytic-forecast";

export type OutletIdentityTable = {
  schemaVersion: typeof OUTLET_IDENTITY_SCHEMA_VERSION;
  id: string;
  version: number;
  outlets: Array<{
    outletId: string;
    canonicalName: string;
    aliases: string[];
    domains: string[];
  }>;
};

export type ReliabilityBand = "unknown-or-limited" | "established";

export type ClaimKindRule = {
  id: string;
  supportingObservationKind: ClaimKind;
  permittedClaimKinds: ExternalClaimKind[];
};

export type ConfidenceCeilingRule = {
  id: string;
  independentSourceCount: "zero-or-unknown" | "one" | "two-plus";
  minimumSourceReliability: ReliabilityBand | "any";
  claimKind: ExternalClaimKind | "any";
  ceiling: "unknown" | "low" | "moderate" | "high";
  testStatus: "tested" | "untested";
};

export type SynthesisProfilePolicy = {
  schemaVersion: typeof SYNTHESIS_POLICY_SCHEMA_VERSION;
  id: string;
  version: number;
  outletIdentityTableId: string;
  coverageCaveatPrefixes: string[];
  claimKindRules: ClaimKindRule[];
  confidenceCeilingRules: ConfidenceCeilingRule[];
};

export type BuildObservationAlias = {
  alias: string;
  sourceNoteId: string;
  observationId: string;
};

export type ObservationRelationship = {
  id: string;
  leftSourceNoteId: string;
  rightSourceNoteId: string;
  leftObservationId: string;
  rightObservationId: string;
  relationship: ReportingRelationship;
  upstreamOutletIds: string[];
  rationale: string;
};

export type SynthesisQuestionCoverage = {
  irId: string;
  disposition: Disposition;
  sourceNoteIds: string[];
  observationIds: string[];
  provisional: boolean;
};

export type SynthesisLimitation = {
  id: string;
  kind: "source-caveat" | "coverage-gap" | "dependency" | "failed-source";
  sourceNoteIds: string[];
  text: string;
};

export type SynthesisDelta = {
  status: "not-computed";
  reason: "no-prior-synthesis" | "deferred-in-poc";
  claims: [];
};

export type SynthesisBuildEnvelope = {
  schemaVersion: typeof BUILD_ENVELOPE_SCHEMA_VERSION;
  id: string;
  createdAt: string;
  runId: string;
  reviewStatus: "provisional" | "reviewed" | "synthetic";
  sourceNotes: ArtifactBinding[];
  sourceNoteIds: string[];
  supersedesNoteIds: string[];
  policy: ArtifactBinding;
  outletIdentityTable: ArtifactBinding;
  aliases: BuildObservationAlias[];
  observationRelationships: ObservationRelationship[];
  questionCoverage: SynthesisQuestionCoverage[];
  intelligenceGaps: string[];
  limitations: SynthesisLimitation[];
  limitedEvidence: boolean;
  priorSynthesisId?: string;
  delta: SynthesisDelta;
};

export type BuildClaimProposal = {
  statement: string;
  kind: ExternalClaimKind;
  attributedTo?: string;
  analyticRationale?: string;
  supportAliases: string[];
  confidence: {
    level: "unknown" | "low" | "moderate" | "high";
    rationale: string;
  };
};

export type BuiltClaim = {
  id: string;
  statement: string;
  kind: ExternalClaimKind;
  authority: "source-reporting" | "analytic-judgment";
  attributedTo?: string;
  analyticRationale?: string;
  supportingSourceNoteIds: string[];
  supportingObservationIds: string[];
  confidence: {
    level: "unknown" | "low" | "moderate" | "high";
    rationale: string;
  };
  provisional: boolean;
  synthetic: boolean;
  independentSourceCount: number | null;
  singleSourceDependent: boolean;
  confidenceCeiling: "unknown" | "low" | "moderate" | "high";
  confidenceCeilingRuleId: string;
};

export type SourceAppendixEntry = {
  sourceNoteId: string;
  publisherOutletIds: string[];
  relayedOutletIds: string[];
  originForClaimIds: string[];
  claimRelationships: Array<{
    claimId: string;
    otherSourceNoteId: string;
    relationship: ReportingRelationship;
    observationRelationshipIds: string[];
  }>;
};

export type ExternalSynthesis = {
  schemaVersion: typeof EXTERNAL_SYNTHESIS_SCHEMA_VERSION;
  id: string;
  createdAt: string;
  runId: string;
  reviewStatus: "provisional" | "reviewed" | "synthetic";
  sourceNoteIds: string[];
  supersedesNoteIds: string[];
  claims: BuiltClaim[];
  questionCoverage: SynthesisQuestionCoverage[];
  intelligenceGaps: string[];
  limitations: SynthesisLimitation[];
  sourceAppendix: SourceAppendixEntry[];
  limitedEvidence: boolean;
  priorSynthesisId?: string;
  delta: SynthesisDelta;
};

export type BoundSourceNote = {
  note: SourceNote;
  artifact: ArtifactBinding;
};

export type BuildRequestObservation = {
  alias: string;
  sourceNoteAlias: string;
  sourceNoteStatus: SourceNote["reviewStatus"];
  text: string;
  claimKind: ClaimKind;
  attribution: NoteObservation["attribution"];
  date?: NoteObservation["date"];
  irIds: string[];
  permittedClaimKinds: ExternalClaimKind[];
  singleSupportConfidenceCeilings?: Array<{
    kind: ExternalClaimKind;
    ceiling: "unknown" | "low" | "moderate" | "high";
    ruleId: string;
  }>;
};

export type SynthesisBuildRequest = {
  schemaVersion:
    | typeof LEGACY_BUILD_REQUEST_SCHEMA_VERSION
    | typeof LEGACY_BUILD_REQUEST_SCHEMA_VERSION_V2
    | typeof BUILD_REQUEST_SCHEMA_VERSION;
  id: string;
  preparedAt: string;
  runId: string;
  stage: "build";
  provider: typeof BUILD_PROVIDER;
  model: typeof BUILD_MODEL;
  envelope: ArtifactBinding;
  authorisation?: ArtifactBinding | null;
  reviewStatus: SynthesisBuildEnvelope["reviewStatus"];
  limitedEvidence: boolean;
  observations: BuildRequestObservation[];
  confidenceCeilingRules: ConfidenceCeilingRule[];
  prompt: {
    system: string;
    user: string;
  };
};

export type SynthesisBuildResponse = {
  schemaVersion: typeof BUILD_RESPONSE_SCHEMA_VERSION;
  requestId: string;
  invocationId: string;
  provider: typeof BUILD_PROVIDER;
  model: typeof BUILD_MODEL;
  startedAt: string;
  completedAt: string;
  freshSession: true;
  capturedBy: string;
  proposal: {
    claims: BuildClaimProposal[];
  };
};

export type SynthesisBuildRecord = {
  schemaVersion: typeof BUILD_RECORD_SCHEMA_VERSION;
  id: string;
  recordedAt: string;
  runId: string;
  reviewStatus: SynthesisBuildEnvelope["reviewStatus"];
  limitedEvidence: boolean;
  supersedesNoteIds: string[];
  envelope: ArtifactBinding;
  request: ArtifactBinding;
  response: ArtifactBinding;
  invocation: {
    id: string;
    provider: typeof BUILD_PROVIDER;
    model: typeof BUILD_MODEL;
    startedAt: string;
    completedAt: string;
    freshSession: true;
    capturedBy: string;
  };
  synthesis: ExternalSynthesis;
};