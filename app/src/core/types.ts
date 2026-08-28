export type ProviderRole = "evidence_candidate" | "collection_lead" | "context";

export type ContentCompleteness = "captured_content" | "summary_only" | "metadata_only";

export type SelectedSeeristItem = {
  provider: "seerist";
  endpoint: string;
  retrievedAt: string;
  rawArtifactRef: string;
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
