import assert from "node:assert/strict";
import test from "node:test";
import { approveMemoScope, validateApprovedMemoScope } from "./memo-scope.js";

const proposal = {
  id: "scope-001",
  runId: "research-run-001",
  version: 1,
  purpose: { value: "Assess operational continuity risk.", origin: "human" },
  threatTopic: { value: "Cyber and hybrid threats", origin: "human" },
  audience: { value: "Strategic risk leadership", origin: "human" },
  geographies: { value: ["Northern Europe"], origin: "human" },
  timeWindow: {
    value: {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-08-31T23:59:59.999Z"
    },
    origin: "human"
  },
  requestedOutput: { value: "memo", origin: "human" },
  status: "proposed"
};

test("explicit human approval creates an approved memo scope", () => {
  const result = approveMemoScope(
    proposal,
    "analyst-001",
    "2026-06-30T12:00:00.000Z"
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }
  assert.equal(result.value.status, "approved");
  assert.equal(result.value.approvedBy, "analyst-001");
  assert.deepEqual(result.value.geographies.value, ["Northern Europe"]);
});

test("inferred values require an assumption reason", () => {
  const result = approveMemoScope(
    {
      ...proposal,
      audience: { value: "Strategic risk leadership", origin: "inferred" }
    },
    "analyst-001",
    "2026-06-30T12:00:00.000Z"
  );

  assert.deepEqual(result, { ok: false, error: "INVALID_MEMO_SCOPE" });
});

test("approved scope validation enforces artifact lineage and chronology", () => {
  const approved = approveMemoScope(
    proposal,
    "analyst-001",
    "2026-06-30T12:00:00.000Z"
  );
  assert.equal(approved.ok, true);
  if (!approved.ok) {
    return;
  }
  const artifact = {
    ...approved.value,
    artifactRef: "runs/research-run-001/memo-scopes/scope-001/v1/approved-memo-scope.json",
    artifactSha256: "a".repeat(64)
  };

  assert.equal(
    validateApprovedMemoScope(artifact, "2026-07-01T00:00:00.000Z").ok,
    true
  );
  assert.deepEqual(
    validateApprovedMemoScope(artifact, "2026-06-29T00:00:00.000Z"),
    { ok: false, error: "SCOPE_APPROVED_AFTER_USE" }
  );
});