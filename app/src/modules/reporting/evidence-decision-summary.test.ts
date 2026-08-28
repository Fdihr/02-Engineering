import assert from "node:assert/strict";
import test from "node:test";
import type { EvidenceReviewOutput } from "../../core/types.js";
import { renderEvidenceDecisionSummary } from "./evidence-decision-summary.js";

const approved: EvidenceReviewOutput = {
  outcome: "approved",
  decision: {
    id: "review-001",
    sourceRunId: "intake-run-001",
    providerItemId: "1030013",
    reviewerId: "analyst-001",
    decidedAt: "2026-08-28T10:00:00.000Z",
    decision: "approved",
    reason: "Source lineage reviewed.",
    intakeArtifactRef: "runs/intake-run-001/intake-result.json"
  },
  snapshot: {
    snapshotId: "snapshot-review-001",
    sourceDecisionId: "review-001",
    sourceRunId: "intake-run-001",
    providerItemId: "1030013",
    admittedBy: "analyst-001",
    admittedAt: "2026-08-28T10:00:00.000Z",
    intakeArtifactRef: "runs/intake-run-001/intake-result.json",
    rawArtifactRef: "runs/probe-001/raw-response.json",
    rawArtifactSha256: "a".repeat(64),
    item: {
      provider: "seerist",
      endpoint: "/v1/wod",
      providerItemId: "1030013",
      sourceType: "analysis",
      retrievedAt: "2026-08-28T08:55:45.000Z",
      rawArtifactRef: "runs/probe-001/raw-response.json",
      sourceLinks: [],
      referenceCount: 0,
      hasSourceMetadata: false,
      researchQuestion: {
        id: "rq-001",
        runId: "research-run-001",
        scopeVersion: 1,
        question: "What developments could affect operational continuity?",
        rationale: "Bound synthetic decision report test.",
        geographies: ["Global"],
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
    }
  },
  event: {
    decisionId: "review-001",
    sourceRunId: "intake-run-001",
    occurredAt: "2026-08-28T10:00:00.000Z",
    actorType: "human",
    actorId: "analyst-001",
    stage: "evidence_admission",
    eventType: "evidence.admission.approved",
    status: "completed",
    intakeArtifactRef: "runs/intake-run-001/intake-result.json",
    snapshotId: "snapshot-review-001"
  }
};

test("renders a read-only approved evidence decision", () => {
  const summary = renderEvidenceDecisionSummary(approved);

  assert.match(summary, /^# Evidence Admission Decision/m);
  assert.match(summary, /read-only/i);
  assert.match(summary, /approved/);
  assert.match(summary, /analyst-001/);
  assert.match(summary, /snapshot-review-001/);
  assert.match(summary, new RegExp("a{64}"));
  assert.doesNotMatch(summary, /<button|<form|<input/i);
});

test("a rejected decision does not render a snapshot section", () => {
  const { snapshot: _snapshot, ...withoutSnapshot } = approved;
  const summary = renderEvidenceDecisionSummary({
    ...withoutSnapshot,
    outcome: "rejected",
    decision: { ...approved.decision, decision: "rejected" },
    event: { ...approved.event, eventType: "evidence.admission.rejected", snapshotId: undefined }
  });

  assert.match(summary, /rejected/);
  assert.doesNotMatch(summary, /Approved Snapshot/);
});