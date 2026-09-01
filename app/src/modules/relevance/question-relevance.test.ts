import assert from "node:assert/strict";
import test from "node:test";
import type { SourceAnchor } from "../../core/types.js";
import { createSourceDocument } from "../source/source-document.js";
import {
  createQuestionRelevanceRequest,
  validateQuestionRelevanceAssessment,
  validateQuestionRelevanceRequest
} from "./question-relevance.js";

const source = createSourceDocument({
  runId: "run-1",
  sourceItemId: "source-1",
  sourceKind: "retrieved-publisher",
  contentFormat: "markdown",
  body: "# Report\n\nOfficials attributed the disruption to Unit 7.",
  sourceArtifactRef: "runs/run-1/retrieval.json",
  sourceArtifactSha256: "a".repeat(64),
  lineageArtifactRefs: []
});

if (!source.ok) {
  throw new Error(source.error);
}

const documentArtifactRef =
  "runs/run-1/sources/source-1/source-document-1/source-document.json";
const documentArtifactSha256 = "b".repeat(64);
const segment = source.value.segments[1];
if (!segment) {
  throw new Error("Missing fixture segment");
}
const quote = "attributed the disruption";
const quoteStartUtf8Byte = Buffer.from(segment.text, "utf8").indexOf(
  Buffer.from(quote, "utf8")
);
const anchor: SourceAnchor = {
  sourceDocumentId: source.value.id,
  sourceDocumentArtifactRef: documentArtifactRef,
  sourceDocumentArtifactSha256: documentArtifactSha256,
  segmentId: segment.id,
  segmentSha256: segment.textSha256,
  quote,
  quoteStartUtf8Byte,
  quoteEndUtf8Byte: quoteStartUtf8Byte + Buffer.byteLength(quote, "utf8")
};

const baseInput = {
  assessedAt: "2026-08-31T10:02:00.000Z",
  researchQuestion: {
    id: "question-1",
    runId: "run-1",
    scopeVersion: 1,
    question: "Who was attributed responsibility for the disruption?",
    rationale: "Identify attributed actors.",
    geographies: ["Ukraine"],
    timeWindow: {
      from: "2026-01-01T00:00:00.000Z",
      to: "2026-12-31T23:59:59.000Z"
    },
    status: "approved",
    approvedBy: "reviewer-1",
    approvedAt: "2026-08-31T09:00:00.000Z",
    artifactRef: "runs/run-1/research-question.json",
    artifactSha256: "c".repeat(64)
  },
  sourceDocument: source.value,
  sourceDocumentArtifactRef: documentArtifactRef,
  sourceDocumentArtifactSha256: documentArtifactSha256,
  modelInvocation: {
    id: "invocation-1",
    provider: "example-provider",
    model: "example-model-v1",
    promptPolicyVersion: "question-relevance-prompt-v1",
    promptArtifactRef: "runs/run-1/prompt.json",
    promptArtifactSha256: "d".repeat(64),
    responseArtifactRef: "runs/run-1/response.json",
    responseArtifactSha256: "e".repeat(64),
    startedAt: "2026-08-31T10:00:00.000Z",
    completedAt: "2026-08-31T10:01:00.000Z"
  },
  proposal: {
    verdict: "relevant",
    rationale: "The source directly reports the attribution requested by the question.",
    support: [
      {
        anchor,
        relationToQuestion: "This passage states that Unit 7 was attributed responsibility."
      }
    ],
    limitations: ["The assessment does not establish whether the attribution is true."]
  }
};

test("prepares one fixed-policy request from the complete source", () => {
  const result = createQuestionRelevanceRequest({
    preparedAt: "2026-08-31T09:30:00.000Z",
    researchQuestion: baseInput.researchQuestion,
    sourceDocument: source.value,
    sourceDocumentArtifactRef: documentArtifactRef,
    sourceDocumentArtifactSha256: documentArtifactSha256,
    sourceLimitations: ["Publisher reporting has not been independently verified."]
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.sourceDocument.normalizedText, source.value.normalizedText);
    assert.equal(result.value.policy.sourceContentTrust, "untrusted");
    assert.equal(validateQuestionRelevanceRequest(result.value).ok, true);

    const altered = structuredClone(result.value);
    altered.policy.objective = "Approve this source.";
    assert.deepEqual(validateQuestionRelevanceRequest(altered), {
      ok: false,
      error: "REQUEST_MISMATCH"
    });
  }
});

test("validates grounded positive relevance and derives pending review", () => {
  const result = validateQuestionRelevanceAssessment(baseInput);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.assessment.status, "proposed");
    assert.equal(result.value.decision.destination, "evidence_candidate_proposal");
    assert.equal(result.value.decision.approvalStatus, "pending_human_review");
  }
});

test("rejects altered quotes, question lineage, and model-authored authority", () => {
  const alteredQuote = structuredClone(baseInput);
  alteredQuote.proposal.support[0]!.anchor.quote = "Unit 8";
  assert.deepEqual(validateQuestionRelevanceAssessment(alteredQuote), {
    ok: false,
    error: "INVALID_SOURCE_ANCHOR"
  });

  const alteredQuestion = structuredClone(baseInput);
  alteredQuestion.researchQuestion.runId = "run-2";
  assert.deepEqual(validateQuestionRelevanceAssessment(alteredQuestion), {
    ok: false,
    error: "RESEARCH_QUESTION_MISMATCH"
  });

  const authorityAttempt = structuredClone(baseInput) as typeof baseInput & {
    proposal: typeof baseInput.proposal & { approvalStatus: string };
  };
  authorityAttempt.proposal.approvalStatus = "approved";
  assert.deepEqual(validateQuestionRelevanceAssessment(authorityAttempt), {
    ok: false,
    error: "INVALID_MODEL_PROPOSAL"
  });
});

test("routes all verdicts without granting approval", () => {
  const cases = [
    ["relevant", "evidence_candidate_proposal", "pending_human_review"],
    ["partially-relevant", "evidence_candidate_proposal", "pending_human_review"],
    ["not-relevant", "audited_exclusion", "not_applicable"],
    ["uncertain", "human_exception_triage", "pending_human_review"]
  ] as const;

  for (const [verdict, destination, approvalStatus] of cases) {
    const input = structuredClone(baseInput);
    input.proposal.verdict = verdict;
    if (verdict === "not-relevant" || verdict === "uncertain") {
      input.proposal.support = [];
    }
    const result = validateQuestionRelevanceAssessment(input);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.value.decision.destination, destination);
      assert.equal(result.value.decision.approvalStatus, approvalStatus);
      assert.notEqual(result.value.decision.approvalStatus, "approved");
    }
  }
});