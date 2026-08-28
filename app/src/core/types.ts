export type ProviderRole = "evidence_candidate" | "collection_lead" | "context";

export type ContentCompleteness = "captured_content" | "summary_only" | "metadata_only";

type ResearchQuestionDefinition = {
  id: string;
  runId: string;
  scopeVersion: number;
  question: string;
  rationale: string;
  geographies: string[];
  timeWindow: {
    from: string;
    to: string;
  };
};

export type ResearchQuestionProposal = ResearchQuestionDefinition & {
  status: "proposed";
};

export type ApprovedResearchQuestionArtifact = ResearchQuestionDefinition & {
  status: "approved";
  approvedBy: string;
  approvedAt: string;
};

export type ApprovedResearchQuestion = ApprovedResearchQuestionArtifact & {
  artifactRef: string;
  artifactSha256: string;
};

export type SelectedSeeristItem = {
  provider: "seerist";
  endpoint: string;
  retrievedAt: string;
  rawArtifactRef: string;
  researchQuestion: ApprovedResearchQuestion;
  item: unknown;
};

type ProviderItemBase = {
  provider: "seerist";
  endpoint: string;
  providerItemId?: string;
  sourceType?: string;
  providerTimestamp?: string;
  retrievedAt: string;
  rawArtifactRef: string;
  sourceLinks: string[];
  referenceCount: number;
  hasSourceMetadata: boolean;
  researchQuestion: ApprovedResearchQuestion;
};

export type EvidenceCandidate = ProviderItemBase & {
  role: "evidence_candidate";
  providerItemId: string;
  contentCompleteness: "captured_content";
};

export type CollectionLead = ProviderItemBase & {
  role: "collection_lead";
  providerItemId: string;
  contentCompleteness: ContentCompleteness;
};

export type ContextItem = ProviderItemBase & {
  role: "context";
  contentCompleteness: ContentCompleteness;
};

export type ProviderItem = EvidenceCandidate | CollectionLead | ContextItem;

export type RouteDecision = {
  providerItemId?: string;
  role: ProviderRole;
  destination: "human_review" | "source_retrieval" | "context_only";
  approvalStatus: "pending_human_review" | "not_applicable";
  ruleId: string;
  reason: string;
};

export type LedgerEntry =
  | {
      runId: string;
      occurredAt: string;
      eventType: "intake.item.routed";
      status: "completed";
      artifactRef: string;
    }
  | {
      runId: string;
      occurredAt: string;
      eventType: "intake.item.failed";
      status: "failed";
      artifactRef?: string;
      error: string;
    };

export type EvidenceAdmissionDecision = {
  id: string;
  sourceRunId: string;
  providerItemId: string;
  reviewerId: string;
  decidedAt: string;
  decision: "approved" | "rejected";
  reason: string;
  intakeArtifactRef: string;
};

export type ApprovedEvidenceSnapshot = {
  snapshotId: string;
  sourceDecisionId: string;
  sourceRunId: string;
  providerItemId: string;
  admittedBy: string;
  admittedAt: string;
  intakeArtifactRef: string;
  rawArtifactRef: string;
  rawArtifactSha256: string;
  item: EvidenceCandidate;
};

export type EvidenceReviewEvent = {
  decisionId: string;
  sourceRunId: string;
  occurredAt: string;
  actorType: "human";
  actorId: string;
  stage: "evidence_admission";
  eventType: "evidence.admission.approved" | "evidence.admission.rejected";
  status: "completed";
  intakeArtifactRef: string;
  snapshotId?: string;
};

export type EvidenceReviewFailureEvent = {
  decisionId: string;
  occurredAt: string;
  actorType: "human";
  actorId?: string;
  stage: "evidence_admission";
  eventType: "evidence.admission.failed";
  status: "failed";
  intakeArtifactRef?: string;
  error: string;
};

export type EvidenceReviewOutput =
  | {
      outcome: "approved";
      decision: EvidenceAdmissionDecision;
      snapshot: ApprovedEvidenceSnapshot;
      event: EvidenceReviewEvent;
    }
  | {
      outcome: "rejected";
      decision: EvidenceAdmissionDecision;
      event: EvidenceReviewEvent;
    };
