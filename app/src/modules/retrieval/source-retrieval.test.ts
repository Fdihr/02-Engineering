import assert from "node:assert/strict";
import test from "node:test";
import { prepareSourceRetrieval } from "./source-retrieval.js";

const sourceUrl = "https://example.invalid/article";
const intakeResult = {
  item: {
    provider: "seerist",
    providerItemId: "lead-1",
    sourceLinks: [sourceUrl],
    role: "collection_lead",
    contentCompleteness: "summary_only",
    researchQuestion: {
      id: "rq-1",
      runId: "run-1",
      scopeVersion: 1,
      question: "What happened?",
      rationale: "Synthetic retrieval test.",
      geographies: ["Example"],
      timeWindow: {
        from: "2026-08-25T00:00:00.000Z",
        to: "2026-08-28T23:59:59.999Z"
      },
      status: "approved",
      approvedBy: "analyst-test",
      approvedAt: "2026-08-28T08:00:00.000Z",
      artifactRef: "runs/run-1/research-questions/rq-1/approved.json",
      artifactSha256: "a".repeat(64)
    }
  },
  decision: {
    providerItemId: "lead-1",
    role: "collection_lead",
    destination: "source_retrieval",
    approvalStatus: "not_applicable"
  },
  ledgerEntry: {
    runId: "run-1",
    eventType: "intake.item.routed",
    status: "completed"
  }
};

test("authorizes the exact source URL on a routed collection lead", () => {
  const result = prepareSourceRetrieval(
    intakeResult,
    sourceUrl,
    "2026-08-28T09:00:00.000Z"
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.providerItemId, "lead-1");
    assert.equal(result.value.sourceUrl, sourceUrl);
    assert.equal(result.value.researchQuestion.id, "rq-1");
  }
});

test("rejects items not routed to source retrieval", () => {
  const result = prepareSourceRetrieval(
    {
      ...intakeResult,
      decision: { ...intakeResult.decision, destination: "human_review" }
    },
    sourceUrl,
    "2026-08-28T09:00:00.000Z"
  );

  assert.deepEqual(result, { ok: false, error: "LEAD_NOT_ROUTED_TO_RETRIEVAL" });
});

test("rejects unlisted and private source URLs", () => {
  assert.deepEqual(
    prepareSourceRetrieval(
      intakeResult,
      "https://other.invalid/article",
      "2026-08-28T09:00:00.000Z"
    ),
    { ok: false, error: "SOURCE_URL_NOT_ON_LEAD" }
  );
  assert.deepEqual(
    prepareSourceRetrieval(
      {
        ...intakeResult,
        item: { ...intakeResult.item, sourceLinks: ["https://127.0.0.1/article"] }
      },
      "https://127.0.0.1/article",
      "2026-08-28T09:00:00.000Z"
    ),
    { ok: false, error: "UNSAFE_SOURCE_URL" }
  );
});