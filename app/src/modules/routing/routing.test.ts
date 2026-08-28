import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionLead, EvidenceCandidate } from "../../core/types.js";
import { decideRoute } from "./routing.js";

const base = {
  provider: "seerist" as const,
  endpoint: "/v1/wod",
  retrievedAt: "2026-08-28T09:55:00.000Z",
  rawArtifactRef: "runs/probe-001/raw-response.json",
  sourceLinks: [],
  referenceCount: 0,
  hasSourceMetadata: false
};

test("routes evidence candidates to human review", () => {
  const candidate: EvidenceCandidate = {
    ...base,
    providerItemId: "analysis-001",
    sourceType: "analysis",
    role: "evidence_candidate",
    contentCompleteness: "captured_content"
  };
  const decision = decideRoute(candidate);

  assert.equal(decision.destination, "human_review");
  assert.equal(decision.approvalStatus, "pending_human_review");
});

test("routes collection leads to source retrieval", () => {
  const lead: CollectionLead = {
    ...base,
    providerItemId: "news-001",
    sourceType: "news",
    role: "collection_lead",
    contentCompleteness: "summary_only"
  };
  const decision = decideRoute(lead);

  assert.equal(decision.destination, "source_retrieval");
  assert.equal(decision.approvalStatus, "not_applicable");
});