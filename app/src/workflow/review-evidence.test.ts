import assert from "node:assert/strict";
import test from "node:test";
import type { ProcessOutput } from "./process-source.js";
import { reviewEvidence } from "./review-evidence.js";

const intake: ProcessOutput = {
  item: {
    provider: "seerist",
    endpoint: "/v1/wod",
    providerItemId: "1030013",
    sourceType: "analysis",
    providerTimestamp: "2026-08-28T08:38:47.762Z",
    retrievedAt: "2026-08-28T08:55:45.082Z",
    rawArtifactRef: "runs/probe-001/raw-response.json",
    sourceLinks: [],
    referenceCount: 0,
    hasSourceMetadata: false,
    researchQuestion: {
      id: "rq-001",
      runId: "research-run-001",
      scopeVersion: 1,
      question: "What political developments could affect operational continuity in Pakistan?",
      rationale: "Bound synthetic approval test.",
      geographies: ["Pakistan"],
      timeWindow: {
        from: "2026-08-01T00:00:00.000Z",
        to: "2026-08-28T23:59:59.999Z"
      },
      status: "approved",
      approvedBy: "analyst-001",
      approvedAt: "2026-08-27T10:00:00.000Z",
      artifactRef: "runs/research-run-001/approved-research-question.json",
      artifactSha256: "a".repeat(64)
    },
    role: "evidence_candidate",
    contentCompleteness: "captured_content"
  },
  decision: {
    providerItemId: "1030013",
    role: "evidence_candidate",
    destination: "human_review",
    approvalStatus: "pending_human_review",
    ruleId: "RULE-EVIDENCE-REVIEW-001",
    reason: "Captured analyst material requires explicit human approval"
  },
  ledgerEntry: {
    runId: "intake-run-001",
    occurredAt: "2026-08-28T09:00:00.000Z",
    eventType: "intake.item.routed",
    status: "completed",
    artifactRef: "runs/probe-001/raw-response.json"
  }
};

const request = {
  decisionId: "review-001",
  reviewerId: "analyst-001",
  decidedAt: "2026-08-28T10:00:00.000Z",
  reason: "Source lineage and captured content reviewed.",
  intakeArtifactRef: "runs/intake-run-001/intake-result.json",
  rawArtifactSha256: "a".repeat(64)
};

test("explicit approval creates an immutable evidence snapshot", () => {
  const result = reviewEvidence({
    ...request,
    decision: "approved",
    intake
  });

  assert.equal(result.ok, true);
  if (!result.ok || result.value.outcome !== "approved") {
    return;
  }

  assert.equal(result.value.decision.reviewerId, "analyst-001");
  assert.equal(result.value.snapshot.providerItemId, "1030013");
  assert.equal(result.value.snapshot.rawArtifactRef, intake.item.rawArtifactRef);
  assert.equal(result.value.snapshot.rawArtifactSha256, "a".repeat(64));
  assert.equal(result.value.snapshot.sourceDecisionId, "review-001");
  assert.equal(result.value.event.actorType, "human");
  assert.equal(result.value.event.eventType, "evidence.admission.approved");
});

test("explicit rejection records the decision without creating a snapshot", () => {
  const result = reviewEvidence({
    ...request,
    decision: "rejected",
    reason: "Source is not suitable for claim-bearing analysis.",
    intake
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.value.outcome, "rejected");
  assert.equal("snapshot" in result.value, false);
  assert.equal(result.value.event.eventType, "evidence.admission.rejected");
});

test("collection leads cannot pass the evidence gate", () => {
  const result = reviewEvidence({
    ...request,
    decision: "approved",
    intake: {
      ...intake,
      item: {
        ...intake.item,
        role: "collection_lead",
        contentCompleteness: "summary_only"
      },
      decision: {
        ...intake.decision,
        role: "collection_lead",
        destination: "source_retrieval",
        approvalStatus: "not_applicable"
      }
    }
  });

  assert.deepEqual(result, {
    ok: false,
    error: "INELIGIBLE_PROVIDER_ROLE"
  });
});

test("mismatched provider item IDs cannot pass the gate", () => {
  const result = reviewEvidence({
    ...request,
    decision: "approved",
    intake: {
      ...intake,
      decision: {
        ...intake.decision,
        providerItemId: "different-item"
      }
    }
  });

  assert.deepEqual(result, {
    ok: false,
    error: "PROVIDER_ITEM_ID_MISMATCH"
  });
});

test("reviewer identity and reason are required", () => {
  const missingReviewer = reviewEvidence({
    ...request,
    reviewerId: " ",
    decision: "approved",
    intake
  });
  const missingReason = reviewEvidence({
    ...request,
    reason: " ",
    decision: "approved",
    intake
  });

  assert.deepEqual(missingReviewer, { ok: false, error: "MISSING_REVIEWER_ID" });
  assert.deepEqual(missingReason, { ok: false, error: "MISSING_DECISION_REASON" });
});