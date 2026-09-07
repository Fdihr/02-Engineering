import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import type { ArtifactBinding } from "../assurance/types.js";
import {
  keyJudgementPolicyFromStandard,
  validateMemoStandardV1,
  type MemoStandardV1
} from "../memo/standard-v1.js";
import {
  createBoundedWriterRequest,
  recordWriterResponse
} from "../memo/writer.js";
import type { ChallengeRecord } from "./challenge.js";
import {
  createKeyJudgementRequest,
  projectClaimsForKeyJudgementSelection,
  recordKeyJudgementResponse,
  validatePerformedAdjudication,
  type PerformedAdjudication
} from "./key-judgement-stage.js";
import type { KeyJudgementPolicy } from "./key-judgements.js";
import type { SynthesisBuildRecord } from "./types.js";

const binding = (name: string): ArtifactBinding => ({
  artifactRef: `runs/run-1/${name}.json`,
  artifactSha256: "a".repeat(64)
});

const buildRecord = {
  schemaVersion: "synthesis-build-record-v1",
  id: "build-1",
  recordedAt: "2026-09-03T10:00:00.000Z",
  runId: "run-1",
  reviewStatus: "reviewed",
  limitedEvidence: true,
  supersedesNoteIds: [],
  envelope: binding("envelope"),
  request: binding("build-request"),
  response: binding("build-response"),
  invocation: {
    id: "build-invocation",
    provider: "github-copilot-vscode",
    model: "not-exposed-by-host",
    startedAt: "2026-09-03T09:59:00.000Z",
    completedAt: "2026-09-03T09:59:30.000Z",
    freshSession: true,
    capturedBy: "TESTER"
  },
  synthesis: {
    schemaVersion: "external-synthesis-v1",
    id: "synthesis-1",
    createdAt: "2026-09-03T10:00:00.000Z",
    runId: "run-1",
    reviewStatus: "reviewed",
    sourceNoteIds: ["note-1"],
    supersedesNoteIds: [],
    claims: [
      {
        id: "claim-a",
        statement: "The visit occurred.",
        kind: "reported-fact",
        authority: "source-reporting",
        supportingSourceNoteIds: ["note-1"],
        supportingObservationIds: ["obs-1"],
        confidence: { level: "moderate", rationale: "One established source." },
        provisional: false,
        synthetic: false,
        independentSourceCount: 1,
        singleSourceDependent: true,
        confidenceCeiling: "moderate",
        confidenceCeilingRuleId: "ceiling-1"
      },
      {
        id: "claim-b",
        statement: "The purpose remains uncertain.",
        kind: "analytic-assessment",
        authority: "analytic-judgment",
        analyticRationale: "The source gives several possible purposes.",
        supportingSourceNoteIds: ["note-1"],
        supportingObservationIds: ["obs-2"],
        confidence: { level: "low", rationale: "Purpose is inferred." },
        provisional: false,
        synthetic: false,
        independentSourceCount: 1,
        singleSourceDependent: true,
        confidenceCeiling: "low",
        confidenceCeilingRuleId: "ceiling-2"
      }
    ],
    questionCoverage: [
      {
        irId: "ir-01",
        disposition: "covered",
        sourceNoteIds: ["note-1"],
        observationIds: ["obs-1", "obs-2"],
        provisional: false
      },
      {
        irId: "ir-02",
        disposition: "partial",
        sourceNoteIds: ["note-1"],
        observationIds: ["obs-2"],
        provisional: false
      },
      {
        irId: "ir-03",
        disposition: "silent",
        sourceNoteIds: ["note-1"],
        observationIds: [],
        provisional: false
      }
    ],
    intelligenceGaps: ["ir-02", "ir-03"],
    limitations: [],
    sourceAppendix: [],
    limitedEvidence: true,
    delta: { status: "not-computed", reason: "no-prior-synthesis", claims: [] }
  }
} as SynthesisBuildRecord;

const buildArtifact = binding("build-record");
const challengeArtifact = binding("challenge-record");
const adjudicationArtifact = binding("adjudication");
const standardArtifact = binding("memo-standard-v1");

const challengeRecord = {
  schemaVersion: "synthesis-challenge-record-v1",
  id: "challenge-1",
  recordedAt: "2026-09-03T10:01:00.000Z",
  runId: "run-1",
  reviewStatus: "reviewed",
  limitedEvidence: true,
  buildRecord: buildArtifact,
  request: binding("challenge-request"),
  response: binding("challenge-response"),
  invocation: {
    id: "challenge-invocation",
    provider: "github-copilot-vscode",
    model: "not-exposed-by-host",
    startedAt: "2026-09-03T10:00:10.000Z",
    completedAt: "2026-09-03T10:00:40.000Z",
    freshSession: true,
    capturedBy: "TESTER"
  },
  results: [
    {
      id: "challenge-a",
      claimId: "claim-a",
      claimAlias: "c01",
      check: "plausible-alternative",
      verdict: "none"
    },
    {
      id: "challenge-b",
      claimId: "claim-b",
      claimAlias: "c02",
      check: "plausible-alternative",
      verdict: "challenge",
      rationale: "Another purpose remains plausible.",
      aliases: ["n1-o02"]
    }
  ],
  metrics: {
    schemaVersion: "synthesis-challenge-metrics-v1",
    runId: "run-1",
    claimCount: 2,
    checklistItemCount: 2,
    challengesRaised: 1,
    challengeRate: 0.5,
    raisedByClaim: [],
    raisedByCheck: [],
    upheldOverRaised: null
  }
} as ChallengeRecord;

const adjudication: PerformedAdjudication = {
  schemaVersion: "synthesis-adjudication-v1",
  id: "adjudication-1",
  createdAt: "2026-09-03T10:02:00.000Z",
  runId: "run-1",
  adjudicationStatus: "performed",
  reviewStatus: "reviewed",
  limitedEvidence: true,
  buildRecord: buildArtifact,
  challengeRecord: challengeArtifact,
  claims: [
    { claimId: "claim-a", status: "accepted", openChallengeIds: [] },
    {
      claimId: "claim-b",
      status: "contested",
      openChallengeIds: ["challenge-b"]
    }
  ]
};

const policy: KeyJudgementPolicy = {
  policyId: "memo-standard-v1-key-judgements-v1",
  maxKeyJudgements: 3,
  allowContested: true,
  judgementTextMaxChars: 240
};

test("projects committed claims through performed adjudication and code-derived IR coverage", () => {
  const projected = projectClaimsForKeyJudgementSelection(
    buildRecord,
    adjudication
  );
  assert.equal(projected.ok, true);
  if (!projected.ok) return;
  assert.deepEqual(projected.value, [
    {
      claimId: "claim-a",
      requirementIds: ["ir-01"],
      status: "accepted",
      confidence: "moderate",
      ceiling: "moderate",
      provisional: false,
      openChallengeIds: []
    },
    {
      claimId: "claim-b",
      requirementIds: ["ir-01", "ir-02"],
      status: "contested",
      confidence: "low",
      ceiling: "low",
      provisional: false,
      openChallengeIds: ["challenge-b"]
    }
  ]);
});

test("request reuses Challenge aliases and never renders claim ids to the model", () => {
  const request = createKeyJudgementRequest({
    buildRecord,
    buildRecordArtifact: buildArtifact,
    challengeRecord,
    challengeRecordArtifact: challengeArtifact,
    adjudication,
    adjudicationArtifact,
    memoStandardArtifact: standardArtifact,
    policy,
    preparedAt: "2026-09-03T10:03:00.000Z"
  });
  assert.equal(request.ok, true);
  if (!request.ok) return;
  assert.deepEqual(request.value.eligibility.eligibleAliasesByRequirement, {
    "ir-01": ["c01", "c02"],
    "ir-02": ["c02"]
  });
  assert.deepEqual(
    request.value.eligibility.requirementsWithoutEligibleClaim,
    ["ir-03"]
  );
  assert.doesNotMatch(request.value.prompt.system, /claim-a|claim-b/);
  assert.doesNotMatch(request.value.prompt.user, /claim-a|claim-b/);
});

test("record safely unwraps the response and attaches claim-owned fields", () => {
  const request = createKeyJudgementRequest({
    buildRecord,
    buildRecordArtifact: buildArtifact,
    challengeRecord,
    challengeRecordArtifact: challengeArtifact,
    adjudication,
    adjudicationArtifact,
    memoStandardArtifact: standardArtifact,
    policy,
    preparedAt: "2026-09-03T10:03:00.000Z"
  });
  assert.equal(request.ok, true);
  if (!request.ok) return;
  const response = {
    schemaVersion: "key-judgement-copilot-response-v1",
    requestId: request.value.id,
    invocationId: "key-judgement-invocation",
    provider: "github-copilot-vscode",
    model: "not-exposed-by-host",
    startedAt: "2026-09-03T10:04:00.000Z",
    completedAt: "2026-09-03T10:04:30.000Z",
    freshSession: true,
    capturedBy: "TESTER",
    proposal: {
      output: {
        selections: [
          {
            requirementId: "ir-01",
            claim: "c01",
            judgementText: "The visit is reported by one source."
          },
          {
            requirementId: "ir-02",
            claim: "c02",
            judgementText: "The purpose remains uncertain."
          }
        ],
        omissions: []
      }
    }
  };
  const recorded = recordKeyJudgementResponse({
    request: request.value,
    requestArtifact: binding("key-judgement-request"),
    responseValue: response,
    responseArtifact: binding("key-judgement-response"),
    buildRecord,
    challengeRecord,
    adjudication,
    policy,
    recordedAt: "2026-09-03T10:05:00.000Z"
  });
  assert.equal(recorded.ok, true);
  if (!recorded.ok) return;
  assert.equal(recorded.value.selection.selections.length, 2);
  assert.deepEqual(recorded.value.selection.selections[1], {
    requirementId: "ir-02",
    claimId: "claim-b",
    judgementText: "The purpose remains uncertain.",
    confidence: "low",
    ceiling: "low",
    status: "contested",
    provisional: false,
    openChallengeIds: ["challenge-b"]
  });
});

test("provisional adjudication cannot enter key-judgement eligibility", () => {
  assert.deepEqual(
    validatePerformedAdjudication({
      ...adjudication,
      schemaVersion: "synthesis-provisional-adjudication-v1",
      adjudicationStatus: "not-performed"
    }),
    { ok: false, error: { code: "INVALID_ADJUDICATION" } }
  );
});

test("memo standard v1 owns the provisional key-judgement policy", async () => {
  const value: unknown = JSON.parse(
    await readFile(
      resolve("src/modules/memo/standards/memo-standard-v1.json"),
      "utf8"
    )
  );
  const standard = validateMemoStandardV1(value);
  assert.equal(standard.ok, true);
  if (!standard.ok) return;
  assert.equal(
    standard.value.keyJudgementPolicy.maxKeyJudgementsStatus,
    "provisional"
  );
  assert.deepEqual(keyJudgementPolicyFromStandard(standard.value), policy);
});

test("writer v2 consumes bounded selected judgements without model rewriting", async () => {
  const standardValue: unknown = JSON.parse(
    await readFile(
      resolve("src/modules/memo/standards/memo-standard-v1.json"),
      "utf8"
    )
  );
  const parsedStandard = validateMemoStandardV1(standardValue);
  assert.equal(parsedStandard.ok, true);
  if (!parsedStandard.ok) return;
  const standard = parsedStandard.value as MemoStandardV1;
  const keyRequest = createKeyJudgementRequest({
    buildRecord,
    buildRecordArtifact: buildArtifact,
    challengeRecord,
    challengeRecordArtifact: challengeArtifact,
    adjudication,
    adjudicationArtifact,
    memoStandardArtifact: standardArtifact,
    policy: keyJudgementPolicyFromStandard(standard),
    preparedAt: "2026-09-03T10:03:00.000Z"
  });
  assert.equal(keyRequest.ok, true);
  if (!keyRequest.ok) return;
  const keyRecord = recordKeyJudgementResponse({
    request: keyRequest.value,
    requestArtifact: binding("key-judgement-request"),
    responseValue: {
      schemaVersion: "key-judgement-copilot-response-v1",
      requestId: keyRequest.value.id,
      invocationId: "key-judgement-invocation",
      provider: "github-copilot-vscode",
      model: "not-exposed-by-host",
      startedAt: "2026-09-03T10:04:00.000Z",
      completedAt: "2026-09-03T10:04:30.000Z",
      freshSession: true,
      capturedBy: "TESTER",
      proposal: {
        selections: [
          {
            requirementId: "ir-01",
            claim: "c01",
            judgementText: "The visit is reported by one source."
          },
          {
            requirementId: "ir-02",
            claim: "c02",
            judgementText: "The purpose remains uncertain."
          }
        ],
        omissions: []
      }
    },
    responseArtifact: binding("key-judgement-response"),
    buildRecord,
    challengeRecord,
    adjudication,
    policy: keyJudgementPolicyFromStandard(standard),
    recordedAt: "2026-09-03T10:05:00.000Z"
  });
  assert.equal(keyRecord.ok, true);
  if (!keyRecord.ok) return;
  const question = {
    id: "rq-1",
    runId: "run-1",
    scopeVersion: 1,
    question: "What happened and why does it matter?",
    rationale: "Bounded writer test.",
    geographies: ["Testland"],
    timeWindow: {
      from: "2026-09-01T00:00:00.000Z",
      to: "2026-09-03T23:59:59.999Z"
    },
    status: "approved" as const,
    approvedBy: "TESTER",
    approvedAt: "2026-09-01T00:00:00.000Z",
    artifactRef: "runs/run-1/question.json",
    artifactSha256: "a".repeat(64)
  };
  const writerRequest = createBoundedWriterRequest({
    buildRecord,
    buildRecordArtifact: buildArtifact,
    challengeRecord,
    challengeRecordArtifact: challengeArtifact,
    adjudication,
    adjudicationArtifact,
    keyJudgementRecord: keyRecord.value,
    keyJudgementRecordArtifact: binding(keyRecord.value.id),
    question,
    questionArtifact: binding("question"),
    standard,
    standardArtifact,
    preparedAt: "2026-09-03T10:06:00.000Z"
  });
  assert.equal(writerRequest.ok, true);
  if (!writerRequest.ok) return;
  assert.equal(writerRequest.value.schemaVersion, "memo-writer-request-v2");
  assert.equal(writerRequest.value.keyJudgements.length, 2);
  assert.ok(
    writerRequest.value.keyJudgements.length <=
      standard.keyJudgementPolicy.maxKeyJudgements
  );
  assert.doesNotMatch(writerRequest.value.prompt.user, /"claim-a"|"claim-b"/);

  const response = {
    schemaVersion: "memo-writer-copilot-response-v1",
    requestId: writerRequest.value.id,
    invocationId: "writer-invocation",
    provider: "github-copilot-vscode",
    model: "not-exposed-by-host",
    startedAt: "2026-09-03T10:07:00.000Z",
    completedAt: "2026-09-03T10:07:30.000Z",
    freshSession: true,
    capturedBy: "TESTER",
    proposal: { statements: [] }
  };
  const recorded = recordWriterResponse({
    request: writerRequest.value,
    requestArtifact: binding("writer-request-v2"),
    responseValue: response,
    responseArtifact: binding("writer-response-v2"),
    buildRecord,
    challengeRecord,
    adjudication,
    keyJudgementRecord: keyRecord.value,
    question,
    standard,
    recordedAt: "2026-09-03T10:08:00.000Z"
  });
  assert.equal(recorded.ok, true);
  if (!recorded.ok) return;
  assert.deepEqual(
    recorded.value.memo.keyJudgments.map((entry) => entry.statement.text),
    [
      "The visit is reported by one source.",
      "The purpose remains uncertain."
    ]
  );
  assert.equal(recorded.value.memo.keyJudgments[0]?.confidence.level, "moderate");
  assert.equal(recorded.value.memo.keyJudgments[1]?.statement.status, "contested");
  assert.equal(recorded.value.memo.memoStandardVersion, 1);
  assert.ok(
    !recorded.value.memo.publicationBlockers.includes(
      "ADJUDICATION_NOT_PERFORMED"
    )
  );
  assert.ok(
    recorded.value.memo.publicationBlockers.includes(
      "OPEN_KEY_JUDGEMENT_CONTEST"
    )
  );

  const rewritten = structuredClone(response);
  rewritten.proposal.statements.push({
    section: "key-judgments",
    text: "A rewritten judgement.",
    claims: ["c01"]
  } as never);
  assert.deepEqual(
    recordWriterResponse({
      request: writerRequest.value,
      requestArtifact: binding("writer-request-v2"),
      responseValue: rewritten,
      responseArtifact: binding("writer-response-rewritten"),
      buildRecord,
      challengeRecord,
      adjudication,
      keyJudgementRecord: keyRecord.value,
      question,
      standard,
      recordedAt: "2026-09-03T10:08:00.000Z"
    }),
    { ok: false, error: "INVALID_WRITER_COVERAGE" }
  );
});