import type { ProviderItem, RouteDecision } from "../../core/types.js";

export const decideRoute = (item: ProviderItem): RouteDecision => {
  if (item.role === "evidence_candidate") {
    return {
      providerItemId: item.providerItemId,
      role: item.role,
      destination: "human_review",
      approvalStatus: "pending_human_review",
      ruleId: "RULE-EVIDENCE-REVIEW-001",
      reason: "Captured analyst material requires explicit human approval"
    };
  }

  if (item.role === "collection_lead") {
    return {
      providerItemId: item.providerItemId,
      role: item.role,
      destination: "source_retrieval",
      approvalStatus: "not_applicable",
      ruleId: "RULE-LEAD-RETRIEVAL-002",
      reason: "Lead material requires source resolution or retrieval"
    };
  }

  return {
    providerItemId: item.providerItemId,
    role: item.role,
    destination: "context_only",
    approvalStatus: "not_applicable",
    ruleId: "RULE-CONTEXT-ONLY-003",
    reason: "Provider context cannot independently corroborate an event claim"
  };
};
