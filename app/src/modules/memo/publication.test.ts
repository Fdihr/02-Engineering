import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  createMemoPublicationGate,
  createPublishedMemoPackage,
  createSupportCalibrationRecord,
  createBoundMemoDecision,
  validateMemoPublicationDecision,
  validatePublishedMemoPackage,
  validateSupportCalibrationPolicy,
  validateSupportCalibrationRecord
} from "./publication.js";

const binding = (name: string) => ({
  artifactRef: `runs/run-1/${name}.json`,
  artifactSha256: name === "decision" ? "a".repeat(64) : "b".repeat(64)
});

test("bound publication decisions reject stale targets, incomplete samples and blockers", () => {
  const target = { runId: "run-1", memoId: "memo-1", memoVersion: 1,
    memo: binding("memo"), markdown: binding("markdown"), writer: binding("writer"),
    verification: binding("verification"), gate: binding("gate"), calibrationPolicy: binding("policy") };
  const submitted = { target, reviewerId: "reviewer", decision: "approved", issueType: "editorial",
    feedback: "Reviewed the exact draft.", sampledVerdicts: [{ observationId: "obs-1", verdict: "supported" }],
    drillDownVerdicts: [] };
  const input = { submitted, target, selectedObservationIds: ["obs-1"], approvalBlockers: [],
    decidedAt: "2026-11-04T13:00:00.000Z" };
  assert.equal(createBoundMemoDecision(input).ok, true);
  assert.deepEqual(createBoundMemoDecision({ ...input, approvalBlockers: ["PROVISIONAL_MEMO_STANDARD"] }),
    { ok: false, error: "PUBLICATION_BLOCKED" });
  assert.deepEqual(createBoundMemoDecision({ ...input, submitted: { ...submitted, sampledVerdicts: [] } }),
    { ok: false, error: "INCOMPLETE_MEMO_SAMPLE" });
  assert.deepEqual(createBoundMemoDecision({ ...input, submitted: { ...submitted, target: { ...target, memoVersion: 2 } } }),
    { ok: false, error: "STALE_MEMO_REVIEW" });
  assert.deepEqual(createBoundMemoDecision({ ...input, submitted: { ...submitted,
    sampledVerdicts: [{ observationId: "obs-1", verdict: "uncertain" }] } }), { ok: false, error: "PUBLICATION_BLOCKED" });
  assert.deepEqual(createBoundMemoDecision({ ...input, submitted: { ...submitted, reviewerId: "" } }),
    { ok: false, error: "INVALID_MEMO_REVIEW" });
  assert.equal(createBoundMemoDecision({ ...input, approvalBlockers: ["PROVISIONAL_MEMO_STANDARD"],
    submitted: { ...submitted, decision: "rejected" } }).ok, true);
  assert.equal(createBoundMemoDecision({ ...input, submitted: {
    ...submitted, issueType: undefined, decision: "approved"
  } }).ok, true);
  assert.deepEqual(createBoundMemoDecision({ ...input, approvalBlockers: ["OPEN_KEY_JUDGEMENT_CONTEST"],
    submitted: { ...submitted, issueType: undefined, decision: "approved" } }),
  { ok: false, error: "PUBLICATION_BLOCKED" });
});

test("publication gate exposes review only when deterministic blockers are clear", () => {
  assert.deepEqual(createMemoPublicationGate({
    memoId: "memo-1", checkedAt: "2026-11-04T13:00:00.000Z", blockers: []
  }), {
    schemaVersion: "memo-publication-gate-v1", memoId: "memo-1",
    checkedAt: "2026-11-04T13:00:00.000Z", status: "ready", reasons: [],
    humanApprovalAvailable: true
  });
  assert.equal(createMemoPublicationGate({
    memoId: "memo-1", checkedAt: "2026-11-04T13:00:00.000Z",
    blockers: ["OPEN_KEY_JUDGEMENT_CONTEST"]
  }).humanApprovalAvailable, false);
});

test("published package binds the approved audience, review and both memo formats", () => {
  const target = { runId: "run-1", memoId: "memo-1", memoVersion: 1,
    memo: binding("memo"), markdown: binding("markdown"), writer: binding("writer"),
    verification: binding("verification"), gate: binding("gate"), calibrationPolicy: binding("policy") };
  const result = createPublishedMemoPackage({
    runId: "run-1", memoId: "memo-1", memoVersion: 1,
    publishedAt: "2026-11-04T13:00:00.000Z", publishedBy: "publisher-1",
    publicationStatus: "published", audience: "Approved leadership audience", format: "markdown+json",
    approval: binding("decision"), reviewTarget: target,
    lineage: { buildRecord: binding("build") },
    memo: { id: "memo-1", runId: "run-1", version: 1 }, markdown: "# Approved memo"
  });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(validatePublishedMemoPackage(result.value).ok, true);
  assert.equal(validatePublishedMemoPackage({ ...result.value, markdown: "# Changed" }).ok, false);
});

test("validates publication samples and records drill-down calibration", async () => {
  const policyValue: unknown = JSON.parse(
    await readFile(
      resolve("src/modules/memo/standards/support-calibration-policy-v1.json"),
      "utf8"
    )
  );
  const policy = validateSupportCalibrationPolicy(policyValue);
  if (!policy.ok) throw new Error(policy.error);
  assert.equal(policy.value.sampleSizePerMemo, 5);
  assert.equal(policy.value.thresholdStatus, "provisional-untested");

  const observationIds = ["obs-1", "obs-2", "obs-3", "obs-4", "obs-5"];
  const decision = {
    schemaVersion: "memo-publication-decision-v2",
    id: "publication-1",
    runId: "run-1",
    memoId: "memo-1",
    memoVersion: 1,
    reviewerId: "reviewer-1",
    decidedAt: "2026-09-03T10:00:00.000Z",
    decision: "rejected",
    sampledVerdicts: observationIds.map((observationId) => ({
      observationId,
      verdict: "supported" as const
    })),
    drillDownVerdicts: [
      {
        targetType: "claim" as const,
        targetId: "claim-1",
        clickedAt: "2026-09-03T09:59:00.000Z"
      },
      {
        targetType: "observation" as const,
        targetId: "obs-2",
        clickedAt: "2026-09-03T09:59:30.000Z",
        verdict: "uncertain" as const
      }
    ]
  };
  const validatedDecision = validateMemoPublicationDecision(decision);
  assert.equal(validatedDecision.ok, true);
  if (!validatedDecision.ok) return;
  const record = createSupportCalibrationRecord({
    decision: validatedDecision.value,
    decisionArtifact: binding("decision"),
    policy: policy.value,
    policyArtifact: binding("policy"),
    selectedObservationIds: observationIds,
    recordedAt: "2026-09-03T10:01:00.000Z",
    cumulativeSampledVerdicts: 30,
    cumulativeMemos: 6,
    cumulativeDisagreementRate: 0
  });
  assert.equal(record.ok, true);
  if (!record.ok) return;
  assert.equal(record.value.thresholdStatus, "not-reached");
  assert.equal(record.value.drillDownVerdicts.length, 2);
  assert.equal(validateSupportCalibrationRecord(record.value).ok, true);

  assert.deepEqual(
    createSupportCalibrationRecord({
      decision: validatedDecision.value,
      decisionArtifact: binding("decision"),
      policy: policy.value,
      policyArtifact: binding("policy"),
      selectedObservationIds: observationIds.slice(0, 4),
      recordedAt: "2026-09-03T10:01:00.000Z",
      cumulativeSampledVerdicts: 0,
      cumulativeMemos: 0,
      cumulativeDisagreementRate: null
    }),
    { ok: false, error: "SAMPLED_VERDICT_MISMATCH" }
  );
});