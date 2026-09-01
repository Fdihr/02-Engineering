import assert from "node:assert/strict";
import test from "node:test";
import { createSourceDocument } from "../source/source-document.js";
import { createQuestionRelevanceRequest } from "./question-relevance.js";
import {
  assessCopilotPocResponse,
  COPILOT_POC_MODEL,
  COPILOT_POC_PROVIDER
} from "./copilot-poc.js";

const source = createSourceDocument({
  runId: "run-1",
  sourceItemId: "source-1",
  sourceKind: "retrieved-publisher",
  contentFormat: "markdown",
  body: "The report identifies Unit 7 as the attributed actor.",
  sourceArtifactRef: "runs/run-1/retrieval.json",
  sourceArtifactSha256: "a".repeat(64),
  lineageArtifactRefs: []
});
if (!source.ok) {
  throw new Error(source.error);
}

const documentArtifactRef = "runs/run-1/source-document.json";
const documentArtifactSha256 = "b".repeat(64);
const request = createQuestionRelevanceRequest({
  preparedAt: "2026-08-31T10:00:00.000Z",
  researchQuestion: {
    id: "question-1",
    runId: "run-1",
    scopeVersion: 1,
    question: "Who was attributed responsibility?",
    rationale: "Identify attributed actors.",
    geographies: ["Ukraine"],
    timeWindow: {
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-12-31T23:59:59.000Z"
    },
    status: "approved",
    approvedBy: "reviewer-1",
    approvedAt: "2026-08-31T09:00:00.000Z",
    artifactRef: "runs/run-1/question.json",
    artifactSha256: "c".repeat(64)
  },
  sourceDocument: source.value,
  sourceDocumentArtifactRef: documentArtifactRef,
  sourceDocumentArtifactSha256: documentArtifactSha256,
  sourceLimitations: ["The source has not been independently corroborated."]
});
if (!request.ok) {
  throw new Error(request.error);
}

const segment = source.value.segments[0];
if (!segment) {
  throw new Error("Missing fixture segment");
}
const quote = "Unit 7";
const start = Buffer.from(segment.text, "utf8").indexOf(Buffer.from(quote, "utf8"));
const response = {
  schemaVersion: "question-relevance-copilot-poc-response-v1",
  requestId: request.value.id,
  invocationId: "copilot-session-1",
  startedAt: "2026-08-31T10:01:00.000Z",
  completedAt: "2026-08-31T10:02:00.000Z",
  proposal: {
    verdict: "relevant",
    rationale: "The source identifies the actor requested by the question.",
    support: [
      {
        anchor: {
          sourceDocumentId: source.value.id,
          sourceDocumentArtifactRef: documentArtifactRef,
          sourceDocumentArtifactSha256: documentArtifactSha256,
          segmentId: segment.id,
          segmentSha256: segment.textSha256,
          quote,
          quoteStartUtf8Byte: start,
          quoteEndUtf8Byte: start + Buffer.byteLength(quote, "utf8")
        },
        relationToQuestion: "This names Unit 7 as the attributed actor."
      }
    ],
    limitations: [
      "The underlying Copilot model identity is not exposed to this PoC workflow."
    ]
  }
};

test("adapts a bounded Copilot response without claiming model identity", () => {
  const result = assessCopilotPocResponse(
    request.value,
    "runs/run-1/request.json",
    "d".repeat(64),
    response,
    "runs/run-1/response.json",
    "e".repeat(64)
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.assessment.modelInvocation.provider, COPILOT_POC_PROVIDER);
    assert.equal(result.value.assessment.modelInvocation.model, COPILOT_POC_MODEL);
    assert.equal(result.value.assessment.status, "proposed");
    assert.equal(result.value.decision.approvalStatus, "pending_human_review");
  }
});

test("rejects a response for another request", () => {
  const altered = { ...response, requestId: "another-request" };
  assert.deepEqual(
    assessCopilotPocResponse(
      request.value,
      "runs/run-1/request.json",
      "d".repeat(64),
      altered,
      "runs/run-1/response.json",
      "e".repeat(64)
    ),
    { ok: false, error: "RELEVANCE_REQUEST_MISMATCH" }
  );
});