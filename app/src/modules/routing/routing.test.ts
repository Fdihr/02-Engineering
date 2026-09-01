import assert from "node:assert/strict";
import test from "node:test";
import type { CollectionLead, EvidenceCandidate } from "../../core/types.js";
import { decideRoute } from "./routing.js";

const base = {
  provider: "seerist" as const,
  endpoint: "/v1/wod",
  retrievedAt: "2026-08-28T09:55:00.000Z",
  rawArtifactRef: "runs/probe-001/raw-response.json",
  rawArtifactSha256: "b".repeat(64),
  collectionLineage: {
    operationId: "operation-001",
    requestManifestRef: "runs/probe-001/collection-request.json",
    requestManifestSha256: "c".repeat(64),
    responseManifestRef: "runs/probe-001/raw-provider-artifact.json",
    responseManifestSha256: "d".repeat(64),
    rawArtifactRef: "runs/probe-001/raw-response.json",
    rawArtifactSha256: "b".repeat(64)
  },
  sourceLinks: [],
  referenceCount: 0,
  hasSourceMetadata: false,
  researchQuestion: {
    id: "rq-001",
    runId: "research-run-001",
    scopeVersion: 1,
    question: "What developments could affect operational continuity?",
    rationale: "Bound synthetic routing test.",
    geographies: ["Global"],
    timeWindow: {
      from: "2026-08-01T00:00:00.000Z",
      to: "2026-08-28T23:59:59.999Z"
    },
    status: "approved" as const,
    approvedBy: "analyst-001",
    approvedAt: "2026-08-27T10:00:00.000Z",
    artifactRef: "runs/research-run-001/approved-research-question.json",
    artifactSha256: "a".repeat(64)
  }
};

test("routes native evidence candidates to source canonicalization", () => {
  const candidate: EvidenceCandidate = {
    ...base,
    providerItemId: "analysis-001",
    sourceType: "analysis",
    role: "evidence_candidate",
    contentCompleteness: "captured_content"
  };
  const decision = decideRoute(candidate);

  assert.equal(decision.destination, "source_canonicalization");
  assert.equal(decision.approvalStatus, "not_applicable");
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