import assert from "node:assert/strict";
import test from "node:test";
import { createSourceDocument } from "../source/source-document.js";
import { anchorQuote } from "./anchoring.js";
import { observationId } from "./ids.js";
import { validateProfilePolicy } from "./policy.js";
import { approveRequirements } from "./requirements.js";
import { validateAdmittedSource } from "./snapshot-source.js";
import type { ProfilePolicy } from "./types.js";

const policyValue = {
  policyId: "geopolitical-source-assurance-v1",
  claimKinds: ["event", "statement", "assessment", "forecast"],
  attributionKinds: ["direct", "attributed", "relayed"],
  dateRoles: ["event", "reporting", "publication", "reference", "unknown"],
  dispositions: ["covered", "partial", "silent", "contradicted"],
  reviewVerdicts: ["supported", "unsupported", "duplicate", "chrome"],
  limits: {
    quoteMinUtf8Bytes: 20,
    quoteMaxUtf8Bytes: 600,
    textMaxChars: 240,
    maxObservations: 60,
    maxAttempts: 2
  }
};

const policyResult = validateProfilePolicy(policyValue);
if (!policyResult.ok) {
  throw new Error(policyResult.error);
}
export const policy: ProfilePolicy = policyResult.value;

const body = [
  "# Regional briefing",
  "",
  "The ministry announced a formal review on 4 March.",
  "",
  "- [Home](https://example.invalid/home)",
  "",
  "The ministry announced a formal review on 4 March.",
  "",
  "The same claim appeared twice. The same claim appeared twice.",
  "",
  "Officials said the \u201creview\u201d would continue through spring."
].join("\n");

const documentResult = createSourceDocument({
  runId: "run-1",
  sourceItemId: "source-1",
  sourceKind: "retrieved-publisher",
  contentFormat: "markdown",
  body,
  sourceArtifactRef: "runs/run-1/retrieval.json",
  sourceArtifactSha256: "c".repeat(64),
  lineageArtifactRefs: []
});
if (!documentResult.ok) {
  throw new Error(documentResult.error);
}
export const document = documentResult.value;
export const documentArtifactRef =
  "runs/run-1/sources/source-1/source-document.json";
export const documentArtifactSha256 = "d".repeat(64);

const segment = (ordinal: number): string => {
  const found = document.segments[ordinal];
  if (!found) {
    throw new Error(`Missing fixture segment ${ordinal}`);
  }
  return found.id;
};

export const approvedQuestion = {
  id: "rq-test-001",
  runId: "run-1",
  scopeVersion: 1,
  question: "Did the ministry announce a formal review?",
  rationale: "Establish whether a review was announced.",
  geographies: ["Testland"],
  timeWindow: {
    from: "2026-03-01T00:00:00.000Z",
    to: "2026-03-31T00:00:00.000Z"
  },
  status: "approved",
  approvedBy: "TESTER",
  approvedAt: "2026-03-05T00:00:00.000Z",
  artifactRef:
    "runs/run-1/research-questions/rq-test-001/approved-research-question.json",
  artifactSha256: "a".repeat(64)
};

export const snapshotValue = {
  snapshotId: "snapshot-decision-1",
  sourceDecisionId: "decision-1",
  sourceRunId: "run-1",
  providerItemId: "candidate-1",
  admittedBy: "TESTER",
  admittedAt: "2026-03-06T00:00:00.000Z",
  intakeArtifactRef: "runs/run-1/source-reintakes/candidate-1/intake-result.json",
  rawArtifactRef: "runs/run-1/raw.json",
  rawArtifactSha256: "b".repeat(64),
  item: {
    role: "evidence_candidate",
    providerItemId: "candidate-1",
    contentCompleteness: "captured_content",
    limitations: ["Retrieved content remains untrusted."],
    researchQuestion: approvedQuestion,
    questionRelevance: {
      assessment: {
        researchQuestionId: "rq-test-001",
        sourceDocumentArtifactRef: documentArtifactRef,
        sourceDocumentArtifactSha256: documentArtifactSha256
      }
    }
  }
};

export const decisionValue = {
  id: "decision-1",
  sourceRunId: "run-1",
  providerItemId: "candidate-1",
  reviewerId: "TESTER",
  decidedAt: "2026-03-06T00:00:00.000Z",
  decision: "approved",
  reason: "it fits",
  intakeArtifactRef: "runs/run-1/source-reintakes/candidate-1/intake-result.json"
};

export const admittedInput = {
  snapshotValue,
  snapshotArtifactRef: "runs/decision-1/approved-evidence-snapshot.json",
  snapshotArtifactSha256: "e".repeat(64),
  decisionValue,
  decisionArtifactRef: "runs/decision-1/evidence-decision.json",
  decisionArtifactSha256: "f".repeat(64),
  researchQuestionValue: approvedQuestion,
  sourceDocumentValue: document,
  sourceDocumentArtifactRef: documentArtifactRef,
  sourceDocumentArtifactSha256: documentArtifactSha256,
  validatedAt: "2026-03-10T00:00:00.000Z"
};

test("accepts a policy and rejects altered policy values", () => {
  assert.equal(validateProfilePolicy(policyValue).ok, true);
  assert.deepEqual(
    validateProfilePolicy({ ...policyValue, claimKinds: ["event"] }),
    { ok: false, error: "INVALID_POLICY_VALUES" }
  );
  assert.deepEqual(
    validateProfilePolicy({
      ...policyValue,
      limits: { ...policyValue.limits, quoteMinUtf8Bytes: 700 }
    }),
    { ok: false, error: "INVALID_POLICY_LIMITS" }
  );
});

test("anchors an exact quote inside its named segment", () => {
  const quote = "The ministry announced a formal review on 4 March.";
  const anchor = anchorQuote(
    document,
    documentArtifactRef,
    documentArtifactSha256,
    segment(1),
    quote,
    policy
  );
  assert.equal(anchor.ok, true);
  if (anchor.ok) {
    assert.equal(anchor.value.quote, quote);
    assert.equal(anchor.value.segmentId, segment(1));
    assert.equal(
      anchor.value.quoteEndUtf8Byte - anchor.value.quoteStartUtf8Byte,
      Buffer.byteLength(quote, "utf8")
    );
  }
});

test("treats an identical line in another segment as a separate unique anchor", () => {
  const quote = "The ministry announced a formal review on 4 March.";
  const first = anchorQuote(
    document,
    documentArtifactRef,
    documentArtifactSha256,
    segment(1),
    quote,
    policy
  );
  const second = anchorQuote(
    document,
    documentArtifactRef,
    documentArtifactSha256,
    segment(3),
    quote,
    policy
  );
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (first.ok && second.ok) {
    assert.notEqual(first.value.segmentId, second.value.segmentId);
  }
});

test("rejects ambiguous, missing, short, and non-byte-exact quotes", () => {
  assert.deepEqual(
    anchorQuote(
      document,
      documentArtifactRef,
      documentArtifactSha256,
      segment(4),
      "The same claim appeared twice.",
      policy
    ),
    { ok: false, error: "QUOTE_AMBIGUOUS_IN_SEGMENT" }
  );
  assert.deepEqual(
    anchorQuote(
      document,
      documentArtifactRef,
      documentArtifactSha256,
      segment(1),
      "A sentence that is absent from the source.",
      policy
    ),
    { ok: false, error: "QUOTE_NOT_FOUND_IN_SEGMENT" }
  );
  assert.deepEqual(
    anchorQuote(
      document,
      documentArtifactRef,
      documentArtifactSha256,
      segment(1),
      "too short",
      policy
    ),
    { ok: false, error: "QUOTE_LENGTH_OUT_OF_POLICY" }
  );
  assert.deepEqual(
    anchorQuote(
      document,
      documentArtifactRef,
      documentArtifactSha256,
      "source-segment-missing",
      "The ministry announced a formal review on 4 March.",
      policy
    ),
    { ok: false, error: "SEGMENT_NOT_FOUND" }
  );
  assert.deepEqual(
    anchorQuote(
      document,
      documentArtifactRef,
      documentArtifactSha256,
      segment(5),
      'Officials said the "review" would continue through spring.',
      policy
    ),
    { ok: false, error: "QUOTE_NOT_FOUND_IN_SEGMENT" }
  );
});

test("anchors a curly quotation byte-exactly", () => {
  const anchor = anchorQuote(
    document,
    documentArtifactRef,
    documentArtifactSha256,
    segment(5),
    "Officials said the \u201creview\u201d would continue through spring.",
    policy
  );
  assert.equal(anchor.ok, true);
});

test("observation ids are stable for identical content and change with it", () => {
  const anchor = anchorQuote(
    document,
    documentArtifactRef,
    documentArtifactSha256,
    segment(1),
    "The ministry announced a formal review on 4 March.",
    policy
  );
  assert.equal(anchor.ok, true);
  if (!anchor.ok) {
    return;
  }
  const first = observationId(anchor.value, "event", "A review was announced.");
  const second = observationId(anchor.value, "event", "A review was announced.");
  assert.equal(first, second);
  assert.notEqual(
    first,
    observationId(anchor.value, "statement", "A review was announced.")
  );
  assert.notEqual(
    first,
    observationId(anchor.value, "event", "A different claim entirely.")
  );
});

const proposal = {
  proposalId: "req-proposal-1",
  questionId: "rq-test-001",
  runId: "run-1",
  requirements: [
    { irId: "ir-01", text: "Was a review announced?" },
    { irId: "ir-02", text: "What date was given?" }
  ]
};

const approvalInput = {
  proposalValue: proposal,
  proposalArtifactRef: "runs/run-1/requirements/req-proposal-1/requirements-proposal.json",
  proposalArtifactSha256: "1".repeat(64),
  researchQuestionValue: approvedQuestion,
  reviewerId: "TESTER",
  approvedAt: "2026-03-07T00:00:00.000Z"
};

test("binds approved requirements to the exact approved question", () => {
  const approved = approveRequirements(approvalInput);
  assert.equal(approved.ok, true);
  if (approved.ok) {
    assert.equal(approved.value.approvalId, "approved-req-proposal-1");
    assert.equal(approved.value.questionArtifactSha256, "a".repeat(64));
    assert.equal(approved.value.requirements.length, 2);
  }
});

test("rejects requirement proposals that do not match their question or run", () => {
  assert.deepEqual(
    approveRequirements({
      ...approvalInput,
      proposalValue: { ...proposal, questionId: "rq-other" }
    }),
    { ok: false, error: "RESEARCH_QUESTION_MISMATCH" }
  );
  assert.deepEqual(
    approveRequirements({
      ...approvalInput,
      proposalValue: { ...proposal, runId: "run-2" }
    }),
    { ok: false, error: "RESEARCH_RUN_MISMATCH" }
  );
  assert.deepEqual(
    approveRequirements({
      ...approvalInput,
      proposalValue: {
        ...proposal,
        requirements: [
          { irId: "ir-01", text: "First" },
          { irId: "ir-01", text: "Duplicate" }
        ]
      }
    }),
    { ok: false, error: "DUPLICATE_REQUIREMENT_ID" }
  );
});

test("accepts the admitted source and rejects broken admission lineage", () => {
  const admitted = validateAdmittedSource(admittedInput);
  assert.equal(admitted.ok, true);
  if (admitted.ok) {
    assert.equal(admitted.value.snapshotId, "snapshot-decision-1");
    assert.equal(admitted.value.sourceDocument.id, document.id);
    assert.equal(admitted.value.researchQuestion.id, "rq-test-001");
  }

  assert.deepEqual(
    validateAdmittedSource({
      ...admittedInput,
      decisionValue: { ...decisionValue, decision: "rejected" }
    }),
    { ok: false, error: "EVIDENCE_NOT_APPROVED" }
  );
  assert.deepEqual(
    validateAdmittedSource({
      ...admittedInput,
      decisionValue: { ...decisionValue, reviewerId: "SOMEONE-ELSE" }
    }),
    { ok: false, error: "EVIDENCE_DECISION_MISMATCH" }
  );
  assert.deepEqual(
    validateAdmittedSource({
      ...admittedInput,
      sourceDocumentArtifactSha256: "9".repeat(64)
    }),
    { ok: false, error: "SOURCE_DOCUMENT_CHECKSUM_MISMATCH" }
  );
  assert.deepEqual(
    validateAdmittedSource({
      ...admittedInput,
      snapshotValue: { ...snapshotValue, snapshotId: "snapshot-other" }
    }),
    { ok: false, error: "INVALID_SNAPSHOT_ARTIFACT" }
  );
});
