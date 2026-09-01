import assert from "node:assert/strict";
import test from "node:test";
import type {
  LedgerEntry,
  RouteDecision,
  SeeristEvidenceCandidate
} from "../../core/types.js";
import { renderIntakeSummary } from "./intake-summary.js";

const item: SeeristEvidenceCandidate = {
  provider: "seerist",
  endpoint: "/v1/wod",
  providerItemId: "1030013",
  sourceType: "analysis",
  providerTimestamp: "2026-08-28T08:00:00.000Z",
  retrievedAt: "2026-08-28T08:55:45.000Z",
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
  sourceLinks: ["https://example.invalid/source?a=1&b=2"],
  referenceCount: 2,
  hasSourceMetadata: true,
  researchQuestion: {
    id: "rq-001",
    runId: "research-run-001",
    scopeVersion: 1,
    question: "What developments could affect operational continuity?",
    rationale: "Bound synthetic reporting test.",
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
};

const decision: RouteDecision = {
  providerItemId: item.providerItemId,
  role: item.role,
  destination: "source_canonicalization",
  approvalStatus: "not_applicable",
  ruleId: "RULE-EVIDENCE-CANONICALIZE-001",
  reason: "Captured provider material requires canonicalization and question relevance"
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
  assert.match(summary, /source_canonicalization/);
  assert.match(summary, /not_applicable/);
  assert.match(summary, /captured_content/);
  assert.match(summary, /What developments could affect operational continuity\?/);
  assert.match(summary, /runs\/probe-001\/raw-response\.json/);
  assert.match(summary, new RegExp("b{64}"));
  assert.match(summary, /operation-001/);
  assert.match(summary, /2026-08-28T09:00:00\.000Z/);
  assert.doesNotMatch(summary, /<(?:button|form|input)|\]\([^)]*(?:approve|reject)/i);
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