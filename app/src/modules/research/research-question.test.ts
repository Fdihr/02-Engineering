import assert from "node:assert/strict";
import test from "node:test";
import { approveResearchQuestion } from "./research-question.js";

const proposal = {
  id: "rq-001",
  runId: "research-run-001",
  scopeVersion: 1,
  question: "What cyber threats could disrupt wind-farm operations in Northern Europe?",
  rationale: "Bound collection to operationally relevant cyber threats.",
  geographies: ["Northern Europe"],
  timeWindow: {
    from: "2026-07-01T00:00:00.000Z",
    to: "2026-08-28T23:59:59.999Z"
  },
  status: "proposed"
};

test("explicit human approval creates an approved research question", () => {
  const result = approveResearchQuestion(
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
  assert.equal(result.value.approvedAt, "2026-06-30T12:00:00.000Z");
  assert.equal(result.value.question, proposal.question);
});

test("invalid scope and missing reviewer metadata cannot create approval", () => {
  const invalidWindow = approveResearchQuestion(
    {
      ...proposal,
      timeWindow: {
        from: "2026-09-01T00:00:00.000Z",
        to: "2026-08-01T00:00:00.000Z"
      }
    },
    "analyst-001",
    "2026-06-30T12:00:00.000Z"
  );
  const missingReviewer = approveResearchQuestion(
    proposal,
    " ",
    "2026-06-30T12:00:00.000Z"
  );

  assert.deepEqual(invalidWindow, { ok: false, error: "INVALID_RESEARCH_TIME_WINDOW" });
  assert.deepEqual(missingReviewer, { ok: false, error: "MISSING_RESEARCH_REVIEWER" });
});

test("only proposed questions can enter the approval boundary", () => {
  const result = approveResearchQuestion(
    { ...proposal, status: "approved" },
    "analyst-001",
    "2026-06-30T12:00:00.000Z"
  );

  assert.deepEqual(result, { ok: false, error: "RESEARCH_QUESTION_NOT_PROPOSED" });
});