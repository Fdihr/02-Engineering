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

export type SeeristEvidenceCandidate = ProviderItemBase & {
  role: "evidence_candidate";
  providerItemId: string;
  contentCompleteness: "captured_content";
};

export type RetrievedSourceEvidenceCandidate = {
  provider: "source_retrieval";
  endpoint: "https://api.firecrawl.dev/v2/scrape";
  providerItemId: string;
  sourceType: "publisher_source";
  providerTimestamp?: string;
  retrievedAt: string;
  rawArtifactRef: string;
  sourceLinks: string[];
  referenceCount: 1;
  hasSourceMetadata: true;
  researchQuestion: ApprovedResearchQuestion;
  role: "evidence_candidate";
  contentCompleteness: "captured_content";
  source: {
    requestedUrl: string;
    finalUrl: string;
    publisherHost: string;
    title?: string;
  };
  retrievalLineage: {
    retrievalId: string;
    sourceLeadProviderItemId: string;
    sourceIntakeArtifactRef: string;
    sourceIntakeArtifactSha256: string;
    retrievalArtifactRef: string;
    retrievalArtifactSha256: string;
    requestArtifactRef: string;
    requestArtifactSha256: string;
    rawArtifactRef: string;
    rawArtifactSha256: string;
  };
  analystAssessment: {
    actorType: "human";
    analystId: string;
    assessedAt: string;
    researchQuestionId: string;
    relevanceToQuestion: string;
  };
  limitations: string[];
};

export type EvidenceCandidate =
  | SeeristEvidenceCandidate
  | RetrievedSourceEvidenceCandidate;

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

export type SourceRetrievalReason =
  | "content_retrieved"
  | "access_provider_error"
  | "target_page_error"
  | "final_url_missing"
  | "cross_origin_redirect"
  | "content_missing"
  | "content_insufficient";

export type SourceRetrievalResult = {
  id: string;
  runId: string;
  providerItemId: string;
  attemptedAt: string;
  receivedAt: string;
  resolutionDepth: 1;
  outcome: "resolved" | "unresolved";
  reason: SourceRetrievalReason;
  approvalStatus: "not_requested";
  researchQuestion: ApprovedResearchQuestion;
  accessProvider: {
    name: "firecrawl";
    endpoint: string;
    httpStatus: number;
    mediaType: string;
    errorCode?: string;
  };
  source: {
    requestedUrl: string;
    reportedSourceUrl?: string;
    finalUrl?: string;
    publisherHost: string;
    statusCode?: number;
    redirectStatus: "not_reported" | "none_observed" | "same_origin" | "cross_origin";
    title?: string;
    description?: string;
    language?: string;
    contentType?: string;
  };
  request: {
    format: "markdown";
    onlyMainContent: true;
    maxAge: 0;
    storeInCache: false;
    skipTlsVerification: false;
    timeoutMs: number;
  };
  lineage: {
    intakeArtifactRef: string;
    intakeArtifactSha256: string;
    requestArtifactRef: string;
    requestArtifactSha256: string;
    rawArtifactRef: string;
    rawArtifactSha256: string;
  };
  content?: {
    format: "markdown";
    trust: "untrusted";
    characterCount: number;
    body: string;
  };
  limitations: string[];
};

export type SourceKind = "provider-captured" | "retrieved-publisher";

export type SourceContentFormat = "markdown" | "plain-text";

export type SourceArtifactLineage = {
  artifactRef: string;
  artifactSha256: string;
};

export type CapturedSourceContent = {
  runId: string;
  sourceItemId: string;
  sourceKind: SourceKind;
  contentFormat: SourceContentFormat;
  body: string;
  sourceArtifactRef: string;
  sourceArtifactSha256: string;
  lineageArtifactRefs: SourceArtifactLineage[];
};

export type SourceSegment = {
  id: string;
  ordinal: number;
  kind: "heading" | "paragraph" | "list-item" | "quote" | "table-row" | "other";
  text: string;
  textSha256: string;
  startUtf8Byte: number;
  endUtf8Byte: number;
};

export type SourceDocument = {
  schemaVersion: "source-document-v1";
  id: string;
  runId: string;
  sourceItemId: string;
  sourceKind: SourceKind;
  sourceArtifactRef: string;
  sourceArtifactSha256: string;
  normalization: {
    version: "source-normalization-v1";
    inputFormat: SourceContentFormat;
    normalizedTextSha256: string;
    characterCount: number;
    utf8ByteCount: number;
  };
  normalizedText: string;
  segments: SourceSegment[];
  lineageArtifactRefs: SourceArtifactLineage[];
};

export type SourceAnchor = {
  sourceDocumentId: string;
  sourceDocumentArtifactRef: string;
  sourceDocumentArtifactSha256: string;
  segmentId: string;
  segmentSha256: string;
  quote: string;
  quoteStartUtf8Byte: number;
  quoteEndUtf8Byte: number;
};
