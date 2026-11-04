import assert from "node:assert/strict";
import test from "node:test";
import { createBoundMemoDecision } from "../modules/memo/publication.js";
import { memoRevisionRoute, validateMemoRevisionAuthorization } from "./memo-revision.js";

const binding = { artifactRef: "runs/run-1/memo.json", artifactSha256: "a".repeat(64) };
const target = { runId: "run-1", memoId: "memo-1", memoVersion: 1, memo: binding,
  markdown: binding, writer: binding, verification: binding, gate: binding, calibrationPolicy: binding };

test("memo revision routes unsupported samples and non-editorial issues upstream", () => {
  for (const [issueType, route] of [["editorial", "review"], ["evidence-gap", "evidence"],
    ["source-analysis", "evidence"], ["external-judgment", "analysis/findings"],
    ["organizational-relevance", "analysis/findings"], ["standard-policy", "audit"]]) {
    const decision = createBoundMemoDecision({ target, selectedObservationIds: ["obs-1"],
      approvalBlockers: ["PROVISIONAL_MEMO_STANDARD"], decidedAt: "2026-11-04T13:00:00Z",
      submitted: { target, reviewerId: "REVIEWER", decision: "revision-requested", issueType,
        feedback: "Revise this draft.", sampledVerdicts: [{ observationId: "obs-1", verdict: "supported" }],
        drillDownVerdicts: [] } });
    assert.ok(decision.ok);
    assert.equal(memoRevisionRoute(decision.value).route, route);
    assert.equal(memoRevisionRoute(decision.value).eligible, issueType === "editorial");
    for (const verdict of ["unsupported", "uncertain"] as const) {
      assert.equal(memoRevisionRoute({ ...decision.value, sampledVerdicts: [{ observationId: "obs-1", verdict }] }).route, "evidence");
    }
    assert.equal(memoRevisionRoute({ ...decision.value, decision: "rejected" }).eligible, false);
  }
  assert.equal(memoRevisionRoute(null).eligible, false);
});

test("memo revision authorization rejects surplus calls, ambiguous models and mismatched targets", () => {
  const authorization = { schemaVersion: "bounded-memo-revision-v1", id: "revision-1", runId: "run-1",
    parentMemoId: "memo-1", target, decision: binding, request: binding, approvedBy: "EDITOR",
    approvedAt: "2026-11-04T13:00:00Z", provider: "github-copilot-sdk", model: "writer-test", maxCalls: 1 };
  assert.equal(validateMemoRevisionAuthorization(authorization).ok, true);
  for (const update of [{ maxCalls: 2 }, { model: "auto" }, { model: "" }, { parentMemoId: "memo-2" },
    { approvedBy: "" }, { provider: "foundry" }, { unexpected: true }, { decision: { ...binding, artifactSha256: "" } }]) {
    assert.equal(validateMemoRevisionAuthorization({ ...authorization, ...update }).ok, false);
  }
});
