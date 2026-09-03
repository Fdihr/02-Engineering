import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  createSupportCalibrationRecord,
  validateMemoPublicationDecision,
  validateSupportCalibrationPolicy,
  validateSupportCalibrationRecord
} from "./publication.js";

const binding = (name: string) => ({
  artifactRef: `runs/run-1/${name}.json`,
  artifactSha256: name === "decision" ? "a".repeat(64) : "b".repeat(64)
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