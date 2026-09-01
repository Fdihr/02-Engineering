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

const approvedScope = {
  id: "scope-001",
  runId: "research-run-001",
  version: 1,
  purpose: { value: "Assess operational continuity risk.", origin: "human" },
  threatTopic: { value: "Cyber threats", origin: "human" },
  audience: { value: "Strategic risk leadership", origin: "human" },
  geographies: { value: ["Northern Europe"], origin: "human" },
  timeWindow: {
    value: {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-08-31T23:59:59.999Z"
    },
    origin: "human"
  },
  status: "approved",
  approvedBy: "analyst-001",
  approvedAt: "2026-06-30T10:00:00.000Z",
  artifactRef: "runs/research-run-001/memo-scopes/scope-001/v1/approved-memo-scope.json",
  artifactSha256: "a".repeat(64)
};

test("explicit human approval creates an approved research question", () => {
  const result = approveResearchQuestion(
    proposal,
    approvedScope,
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
  assert.equal(result.value.scopeApproval?.scopeId, "scope-001");
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
    approvedScope,
    "analyst-001",
    "2026-06-30T12:00:00.000Z"
  );
  const missingReviewer = approveResearchQuestion(
    proposal,
    approvedScope,
    " ",
    "2026-06-30T12:00:00.000Z"
  );

  assert.deepEqual(invalidWindow, { ok: false, error: "INVALID_RESEARCH_TIME_WINDOW" });
  assert.deepEqual(missingReviewer, { ok: false, error: "MISSING_RESEARCH_REVIEWER" });
});

test("only proposed questions can enter the approval boundary", () => {
  const result = approveResearchQuestion(
    { ...proposal, status: "approved" },
    approvedScope,
    "analyst-001",
    "2026-06-30T12:00:00.000Z"
  );

  assert.deepEqual(result, { ok: false, error: "RESEARCH_QUESTION_NOT_PROPOSED" });
});

test("question approval cannot expand approved scope", () => {
  assert.deepEqual(
    approveResearchQuestion(
      { ...proposal, geographies: ["Northern Europe", "Central Asia"] },
      approvedScope,
      "analyst-001",
      "2026-06-30T12:00:00.000Z"
    ),
    { ok: false, error: "QUESTION_GEOGRAPHY_OUTSIDE_SCOPE" }
  );
  assert.deepEqual(
    approveResearchQuestion(
      {
        ...proposal,
        timeWindow: {
          from: "2026-06-01T00:00:00.000Z",
          to: "2026-08-28T23:59:59.999Z"
        }
      },
      approvedScope,
      "analyst-001",
      "2026-06-30T12:00:00.000Z"
    ),
    { ok: false, error: "QUESTION_TIME_WINDOW_OUTSIDE_SCOPE" }
  );
});