import assert from "node:assert/strict";
import test from "node:test";
import type { ApprovedMemoScope } from "../../core/types.js";
import {
  createResearchQuestionDraftRequest,
  recordResearchQuestionDraft,
  RESEARCH_QUESTION_DRAFT_RESPONSE_SCHEMA_VERSION
} from "./question-drafting.js";

const scope: ApprovedMemoScope = {
  id: "scope-1",
  runId: "run-1",
  version: 1,
  purpose: { value: "Assess operational continuity risk.", origin: "human" },
  researchThesis: {
    value: "Third-party operational dependencies are a more likely disruption path than direct attacks.",
    origin: "human"
  },
  threatTopic: { value: "Cyber threats", origin: "human" },
  audience: { value: "Risk leadership", origin: "human" },
  geographies: { value: ["Northern Europe"], origin: "human" },
  timeWindow: {
    value: {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-08-31T23:59:59.999Z"
    },
    origin: "human"
  },
  status: "approved",
  approvedBy: "analyst-1",
  approvedAt: "2026-06-30T10:00:00.000Z",
  artifactRef: "runs/run-1/memo-scope.json",
  artifactSha256: "a".repeat(64)
};

test("draft request uses the thesis and all existing scope fields", () => {
  const result = createResearchQuestionDraftRequest(
    scope,
    "2026-06-30T11:00:00.000Z"
  );
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.scope.researchThesis.value, scope.researchThesis?.value);
  assert.match(result.value.prompt.system, /directly test or investigate/);
  assert.match(result.value.prompt.system, /support, qualify, or contradict/);
  assert.match(result.value.prompt.user, /Northern Europe/);
  assert.match(result.value.prompt.user, /Risk leadership/);
});

test("AI response becomes a bounded proposal and never an approval", () => {
  const request = createResearchQuestionDraftRequest(
    scope,
    "2026-06-30T11:00:00.000Z"
  );
  assert.equal(request.ok, true);
  if (!request.ok) return;
  const recorded = recordResearchQuestionDraft({
    request: request.value,
    responseValue: {
      schemaVersion: RESEARCH_QUESTION_DRAFT_RESPONSE_SCHEMA_VERSION,
      provider: "github-copilot-vscode",
      requestId: request.value.id,
      invocationId: "copilot-invocation-1",
      startedAt: "2026-06-30T11:01:00.000Z",
      completedAt: "2026-06-30T11:02:00.000Z",
      proposal: {
        question: "How have attacks on third-party operational dependencies affected wind-energy continuity in Northern Europe?",
        rationale: "This tests whether dependency attacks, rather than direct attacks, are the more likely disruption path within the approved topic, geography, and period."
      }
    },
    scope,
    questionId: "rq-draft-1",
    recordedAt: "2026-06-30T11:03:00.000Z"
  });
  assert.equal(recorded.ok, true);
  if (!recorded.ok) return;
  assert.equal(recorded.value.proposal.status, "proposed");
  assert.equal(recorded.value.proposal.researchThesis, scope.researchThesis?.value);
  assert.deepEqual(recorded.value.proposal.geographies, ["Northern Europe"]);
  assert.deepEqual(recorded.value.proposal.timeWindow, scope.timeWindow.value);
});

test("rejects a response bound to another request or scope", () => {
  const request = createResearchQuestionDraftRequest(
    scope,
    "2026-06-30T11:00:00.000Z"
  );
  assert.equal(request.ok, true);
  if (!request.ok) return;
  const response = {
    schemaVersion: RESEARCH_QUESTION_DRAFT_RESPONSE_SCHEMA_VERSION,
    provider: "github-copilot-vscode",
    requestId: "another-request",
    invocationId: "copilot-invocation-1",
    startedAt: "2026-06-30T11:01:00.000Z",
    completedAt: "2026-06-30T11:02:00.000Z",
    proposal: { question: "Question?", rationale: "Thesis rationale." }
  };
  assert.deepEqual(
    recordResearchQuestionDraft({
      request: request.value,
      responseValue: response,
      scope,
      questionId: "rq-draft-1",
      recordedAt: "2026-06-30T11:03:00.000Z"
    }),
    { ok: false, error: "RESEARCH_QUESTION_DRAFT_REQUEST_MISMATCH" }
  );
  assert.deepEqual(
    recordResearchQuestionDraft({
      request: request.value,
      responseValue: { ...response, requestId: request.value.id },
      scope: { ...scope, researchThesis: { value: "Changed thesis", origin: "human" } },
      questionId: "rq-draft-1",
      recordedAt: "2026-06-30T11:03:00.000Z"
    }),
    { ok: false, error: "RESEARCH_QUESTION_DRAFT_SCOPE_MISMATCH" }
  );
});

test("rejects a draft request prepared before scope approval", () => {
  assert.deepEqual(
    createResearchQuestionDraftRequest(scope, "2026-06-30T09:00:00.000Z"),
    { ok: false, error: "INVALID_RESEARCH_QUESTION_DRAFT_REQUEST" }
  );
});

test("SDK question drafting retains model identity and cannot approve its own proposal", () => {
  const request = createResearchQuestionDraftRequest(scope, "2026-06-30T11:00:00.000Z");
  assert.equal(request.ok, true);
  if (!request.ok) return;
  const recorded = recordResearchQuestionDraft({
    request: request.value, scope, questionId: "rq-sdk-1", recordedAt: "2026-06-30T11:03:00.000Z",
    responseValue: {
      schemaVersion: "research-question-draft-copilot-sdk-response-v1",
      provider: "github-copilot-sdk", model: "test-model-1", requestId: request.value.id,
      invocationId: "session-1", startedAt: "2026-06-30T11:01:00.000Z", completedAt: "2026-06-30T11:02:00.000Z",
      proposal: { question: "Do dependency attacks cause more disruption than direct attacks?", rationale: "Compare evidence supporting and contradicting the thesis." }
    }
  });
  assert.equal(recorded.ok, true);
  if (recorded.ok) {
    assert.equal(recorded.value.invocation.model, "test-model-1");
    assert.equal(recorded.value.proposal.status, "proposed");
    assert.equal(recorded.value.proposal.researchThesis, scope.researchThesis?.value);
  }
});
