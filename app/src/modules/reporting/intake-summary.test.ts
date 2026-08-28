import assert from "node:assert/strict";
import test from "node:test";
import type { EvidenceCandidate, LedgerEntry, RouteDecision } from "../../core/types.js";
import { renderIntakeSummary } from "./intake-summary.js";

const item: EvidenceCandidate = {
  provider: "seerist",
  endpoint: "/v1/wod",
  providerItemId: "1030013",
  sourceType: "analysis",
  providerTimestamp: "2026-08-28T08:00:00.000Z",
  retrievedAt: "2026-08-28T08:55:45.000Z",
  rawArtifactRef: "runs/probe-001/raw-response.json",
  sourceLinks: ["https://example.invalid/source?a=1&b=2"],
  referenceCount: 2,
  hasSourceMetadata: true,
  role: "evidence_candidate",
  contentCompleteness: "captured_content"
};

const decision: RouteDecision = {
  providerItemId: item.providerItemId,
  role: item.role,
  destination: "human_review",
  approvalStatus: "pending_human_review",
  ruleId: "RULE-EVIDENCE-REVIEW-001",
  reason: "Captured analyst material requires explicit human approval"
};

const ledgerEntry: LedgerEntry = {
  runId: "run-intake-test-001",
  occurredAt: "2026-08-28T09:00:00.000Z",
  eventType: "intake.item.routed",
  status: "completed",
  artifactRef: item.rawArtifactRef
};

test("renders a read-only intake summary from canonical output", () => {
  const summary = renderIntakeSummary({ item, decision, ledgerEntry });

  assert.match(summary, /^# Intake Review/m);
  assert.match(summary, /read-only/i);
  assert.match(summary, /intake-result\.json.*canonical/i);
  assert.match(summary, /1030013/);
  assert.match(summary, /evidence_candidate/);
  assert.match(summary, /human_review/);
  assert.match(summary, /pending_human_review/);
  assert.match(summary, /captured_content/);
  assert.match(summary, /runs\/probe-001\/raw-response\.json/);
  assert.match(summary, /2026-08-28T09:00:00\.000Z/);
  assert.doesNotMatch(summary, /<button|approve|reject/i);
  assert.equal(summary.endsWith("\n"), true);
});

test("escapes provider-originated Markdown characters", () => {
  const summary = renderIntakeSummary({
    item: {
      ...item,
      sourceType: "analysis | injected",
      sourceLinks: ["https://example.invalid/<unsafe>"]
    },
    decision,
    ledgerEntry
  });

  assert.match(summary, /analysis \\| injected/);
  assert.match(summary, /\\<unsafe\\>/);
});