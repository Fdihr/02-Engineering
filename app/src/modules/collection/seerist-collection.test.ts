import assert from "node:assert/strict";
import test from "node:test";
import { prepareSeeristCollection } from "./seerist-collection.js";

const approvedQuestion = {
  id: "rq-collection-test",
  runId: "research-run-test",
  scopeVersion: 1,
  question: "What cyber threats could disrupt wind-farm operations?",
  rationale: "Synthetic provider-gate test.",
  geographies: ["Northern Europe"],
  timeWindow: {
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-08-28T23:59:59.999Z"
  },
  status: "approved",
  approvedBy: "analyst-test",
  approvedAt: "2026-08-28T08:00:00.000Z",
  scopeApproval: {
    scopeId: "scope-collection-test",
    scopeVersion: 1,
    artifactRef: "runs/research-run-test/memo-scopes/scope-collection-test/v1/approved.json",
    artifactSha256: "b".repeat(64)
  },
  artifactRef: "runs/research-run-test/research-questions/rq-collection-test/approved.json",
  artifactSha256: "a".repeat(64)
};

const operation = {
  id: "seerist-op-test",
  runId: "research-run-test",
  researchQuestionId: "rq-collection-test",
  provider: "seerist",
  method: "GET",
  endpoint: "/v1/wod",
  filters: { size: 10, country: "DK" }
};

test("prepares a Seerist operation only from matching approved intent", () => {
  const result = prepareSeeristCollection(
    operation,
    approvedQuestion,
    "2026-08-28T09:00:00.000Z"
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.researchQuestion.id, operation.researchQuestionId);
    assert.equal(
      result.value.requestUrl,
      "https://app.seerist.com/hyperionapi/v1/wod?size=10&country=DK"
    );
  }
});

test("rejects unapproved or late-approved research intent", () => {
  const unapproved = prepareSeeristCollection(
    operation,
    { ...approvedQuestion, status: "proposed" },
    "2026-08-28T09:00:00.000Z"
  );
  const approvedAfterRequest = prepareSeeristCollection(
    operation,
    { ...approvedQuestion, approvedAt: "2026-08-28T10:00:00.000Z" },
    "2026-08-28T09:00:00.000Z"
  );

  assert.deepEqual(unapproved, { ok: false, error: "RESEARCH_QUESTION_NOT_APPROVED" });
  assert.deepEqual(approvedAfterRequest, {
    ok: false,
    error: "QUESTION_APPROVED_AFTER_RETRIEVAL"
  });
});

test("rejects operations bound to another question or research run", () => {
  const wrongQuestion = prepareSeeristCollection(
    { ...operation, researchQuestionId: "rq-other" },
    approvedQuestion,
    "2026-08-28T09:00:00.000Z"
  );
  const wrongRun = prepareSeeristCollection(
    { ...operation, runId: "research-run-other" },
    approvedQuestion,
    "2026-08-28T09:00:00.000Z"
  );

  assert.deepEqual(wrongQuestion, { ok: false, error: "RESEARCH_QUESTION_MISMATCH" });
  assert.deepEqual(wrongRun, { ok: false, error: "RESEARCH_RUN_MISMATCH" });
});

test("permits inventoried read-only Hyperion GET endpoints and rejects unknown or traversal paths", () => {
  const allowedEndpoints = [
    "/v1/wod",
    "/v1/wod/breaking-events",
    "/v1/wod/calendar-events",
    "/v1/wod/risk-rating",
    "/v1/wod/risk-rating/pl",
    "/v1/wod/country-background/POL",
    "/v1/hotspots",
    "/v1/hotspots/topic/top",
    "/v2/auto-summary/pl/country",
    "/v2/clusters/cluster-123",
    "/v2/clusters/cluster-123/articles",
    "/v2/pulse/country",
    "/v2/pulse/country/pl",
    "/v1/aois/country",
    "/v1/config/risk-categories"
  ];
  for (const endpoint of allowedEndpoints) {
    const res = prepareSeeristCollection(
      { ...operation, endpoint },
      approvedQuestion,
      "2026-08-28T09:00:00.000Z"
    );
    assert.equal(res.ok, true, `Expected ${endpoint} to be permitted`);
  }

  for (const invalidEndpoint of [
    "/v1/risk-ratings",
    "/v1/searches",
    "/v2/auto-summary/pl/unknown",
    "/v1/wod/../searches"
  ]) {
    const res = prepareSeeristCollection(
      { ...operation, endpoint: invalidEndpoint },
      approvedQuestion,
      "2026-08-28T09:00:00.000Z"
    );
    assert.deepEqual(res, { ok: false, error: "INVALID_PROVIDER_OPERATION" });
  }
});

test("rejects provider endpoints outside the implemented collection boundary", () => {
  const result = prepareSeeristCollection(
    { ...operation, endpoint: "/v1/risk-ratings" },
    approvedQuestion,
    "2026-08-28T09:00:00.000Z"
  );

  assert.deepEqual(result, { ok: false, error: "INVALID_PROVIDER_OPERATION" });
});

test("rejects collection without explicit scope approval lineage", () => {
  const { scopeApproval: _scopeApproval, ...legacyQuestion } = approvedQuestion;
  assert.deepEqual(
    prepareSeeristCollection(
      operation,
      legacyQuestion,
      "2026-08-28T09:00:00.000Z"
    ),
    { ok: false, error: "MEMO_SCOPE_APPROVAL_REQUIRED" }
  );
});