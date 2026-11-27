import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import type { ArtifactBinding } from "../assurance/types.js";
import {
  keyJudgementPolicyFromStandard,
  DEFAULT_MEMO_STANDARD_PATH,
  validateMemoStandard,
  validateMemoStandardV1,
  type MemoStandardV1
} from "../memo/standard-v1.js";
import {
  createBoundedWriterRequest,
  validateBoundedWriterRequest,
  recordWriterResponse,
  renderMemoMarkdown
} from "../memo/writer.js";
import type { ChallengeRecord } from "./challenge.js";
import {
  createAutomatedAdjudication,
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
  const recordInput = {
    request: request.value,
    requestArtifact: binding("key-judgement-request"),
    responseValue: response,
    responseArtifact: binding("key-judgement-response"),
    buildRecord,
    challengeRecord,
    adjudication,
    policy,
    recordedAt: "2026-09-03T10:05:00.000Z"
  };
  const recorded = recordKeyJudgementResponse(recordInput);
  const sdkRecorded = recordKeyJudgementResponse({
    ...recordInput, responseValue: { ...response, provider: "github-copilot-sdk", model: "test-model-1" }
  });
  assert.equal(sdkRecorded.ok, true);
  if (sdkRecorded.ok) assert.equal(sdkRecorded.value.invocation.model, "test-model-1");
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

test("memo standard v2 removes only the word ceiling and rejects invented limits", async () => {
  const value = JSON.parse(await readFile(resolve("src/modules/memo/standards/memo-standard-v2.json"), "utf8"));
  const standard = validateMemoStandard(value);
  assert.ok(standard.ok);
  assert.equal(standard.value.version, 2);
  assert.equal("maxWords" in standard.value.limits, false);
  assert.deepEqual(keyJudgementPolicyFromStandard(standard.value), policy);
  assert.equal(validateMemoStandardV1(value).ok, false);
  for (const maxWords of [350, 1_000_000, null]) {
    assert.equal(validateMemoStandard({ ...value, limits: { ...value.limits, maxWords } }).ok, false);
  }
  assert.equal(validateMemoStandard({ ...value, version: 1 }).ok, false);
  const old = JSON.parse(await readFile(resolve("src/modules/memo/standards/memo-standard-v1.json"), "utf8"));
  delete old.limits.maxWords;
  assert.equal(validateMemoStandard(old).ok, false);
});

test("memo standard v3 is approved, provenance-bound, domain-neutral, and regression-backed", async () => {
  const value = JSON.parse(await readFile(resolve(DEFAULT_MEMO_STANDARD_PATH), "utf8"));
  const standard = validateMemoStandard(value);
  assert.ok(standard.ok);
  if (!standard.ok || standard.value.version !== 3) return;
  assert.equal(standard.value.status, "approved-standard");
  assert.equal(standard.value.approvedBy, "Fdihr");
  assert.equal(standard.value.sourceMemoRefs.length, 23);
  assert.equal(standard.value.archiveCoverage.verifiedAndCuratedCount, 23);
  assert.equal(standard.value.archiveCoverage.excludedCount, 9);
  assert.equal(standard.value.keyJudgementPolicy.maxKeyJudgementsStatus, "approved");
  assert.equal(standard.value.keyJudgementPolicy.maxKeyJudgements, 3);
  assert.equal("maxWords" in standard.value.limits, false);
  assert.equal(standard.value.regressionExamples.length, 4);
  assert.ok(standard.value.styleGuidance.length > 0);

  assert.equal(validateMemoStandard({
    ...value,
    archiveCoverage: { ...value.archiveCoverage, verifiedAndCuratedCount: 22 }
  }).ok, false);
  assert.equal(validateMemoStandard({
    ...value,
    sourceMemoRefs: value.sourceMemoRefs.map((entry: { sha256: string }, index: number) =>
      index === 0 ? { ...entry, sha256: "invalid" } : entry)
  }).ok, false);
  assert.equal(validateMemoStandard({
    ...value,
    limits: { ...value.limits, maxWords: 1200 }
  }).ok, false);
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
  const recordInput = {
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
  };
  const recorded = recordWriterResponse(recordInput);
  const sdkRecorded = recordWriterResponse({
    ...recordInput, responseValue: { ...response, provider: "github-copilot-sdk", model: "test-model-1" }
  });
  assert.equal(sdkRecorded.ok, true);
  if (sdkRecorded.ok) assert.equal(sdkRecorded.value.invocation.model, "test-model-1");
  assert.equal(recorded.ok, true);
  if (!recorded.ok) return;
  const countWords = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
  const budget = writerRequest.value.wordBudget;
  assert.ok(budget);
  assert.equal(budget.fixedWords, countWords(renderMemoMarkdown(recorded.value.memo)));
  assert.equal(budget.fixedWords + budget.reservedStatementWords + budget.maxProseWords, standard.limits.maxWords);
  assert.match(writerRequest.value.prompt.system, new RegExp(`at most ${budget.maxProseWords} whitespace-separated words`));
  const sections = [
    ...Array<string>(standard.limits.maxAnalysisStatements).fill("analysis"),
    ...Array<string>(standard.limits.maxUncertaintyStatements).fill("uncertainties"),
    ...Array<string>(standard.limits.maxIndicatorStatements).fill("indicators")
  ];
  assert.ok(budget.maxProseWords >= sections.length);
  const statements = sections.map((section, index) => ({
    section, text: Array<string>(index === 0 ? budget.maxProseWords - sections.length + 1 : 1).fill("word").join(" "),
    claims: writerRequest.value.claims.map(claim => claim.alias)
  }));
  const atLimit = recordWriterResponse({ ...recordInput,
    responseValue: { ...response, proposal: { statements } } });
  assert.ok(atLimit.ok);
  assert.equal(countWords(renderMemoMarkdown(atLimit.value.memo)), standard.limits.maxWords);
  const tooLongStatements = structuredClone(statements);
  tooLongStatements[0]!.text += " word";
  assert.deepEqual(recordWriterResponse({ ...recordInput,
    responseValue: { ...response, proposal: { statements: tooLongStatements } } }),
    { ok: false, error: "MEMO_TOO_LONG" });
  const writerInputs = {
    buildRecord, buildRecordArtifact: buildArtifact, challengeRecord, challengeRecordArtifact: challengeArtifact,
    adjudication, adjudicationArtifact, keyJudgementRecord: keyRecord.value,
    keyJudgementRecordArtifact: binding(keyRecord.value.id), question, questionArtifact: binding("question"),
    standard, standardArtifact, preparedAt: writerRequest.value.preparedAt
  };
  const historical = createBoundedWriterRequest({ ...writerInputs, wordBudget: false });
  assert.ok(historical.ok);
  assert.equal(historical.value.wordBudget, undefined);
  assert.doesNotMatch(historical.value.prompt.system, /Fixed sections already use/);
  const historicalRecord = recordWriterResponse({ ...recordInput, request: historical.value,
    responseValue: { ...response, requestId: historical.value.id } });
  assert.ok(historicalRecord.ok);
  assert.deepEqual(historicalRecord.value.memo, recorded.value.memo);
  assert.deepEqual(createBoundedWriterRequest({ ...writerInputs,
    standard: { ...standard, limits: { ...standard.limits, maxWords: budget.fixedWords - 1 } } }),
    { ok: false, error: "MEMO_FIXED_CONTENT_TOO_LONG" });
  const fixedOnly = createBoundedWriterRequest({ ...writerInputs,
    standard: { ...standard, limits: { ...standard.limits, maxWords: budget.fixedWords } } });
  assert.ok(fixedOnly.ok);
  assert.equal(fixedOnly.value.wordBudget?.maxProseWords, 0);
  const uncappedStandard = validateMemoStandard(JSON.parse(await readFile(resolve("src/modules/memo/standards/memo-standard-v3.json"), "utf8")));
  assert.ok(uncappedStandard.ok);
  if (!uncappedStandard.ok || uncappedStandard.value.version !== 3) return;
  const uncappedArtifact = binding("memo-standard-v3");
  const approvedKeyRequest = createKeyJudgementRequest({
    buildRecord,
    buildRecordArtifact: buildArtifact,
    challengeRecord,
    challengeRecordArtifact: challengeArtifact,
    adjudication,
    adjudicationArtifact,
    memoStandardArtifact: uncappedArtifact,
    policy: keyJudgementPolicyFromStandard(uncappedStandard.value),
    preparedAt: "2026-09-03T10:03:00.000Z"
  });
  assert.ok(approvedKeyRequest.ok);
  if (!approvedKeyRequest.ok) return;
  const uncappedKeyRecord = recordKeyJudgementResponse({
    request: approvedKeyRequest.value,
    requestArtifact: binding("approved-key-judgement-request"),
    responseValue: {
      schemaVersion: "key-judgement-copilot-response-v1",
      requestId: approvedKeyRequest.value.id,
      invocationId: "approved-key-judgement-invocation",
      provider: "github-copilot-vscode",
      model: "not-exposed-by-host",
      startedAt: "2026-09-03T10:04:00.000Z",
      completedAt: "2026-09-03T10:04:30.000Z",
      freshSession: true,
      capturedBy: "TESTER",
      proposal: {
        selections: [
          { requirementId: "ir-01", claim: "c01", judgementText: "The visit is reported by one source." },
          { requirementId: "ir-02", claim: "c02", judgementText: "The purpose remains uncertain." }
        ],
        omissions: []
      }
    },
    responseArtifact: binding("approved-key-judgement-response"),
    buildRecord,
    challengeRecord,
    adjudication,
    policy: keyJudgementPolicyFromStandard(uncappedStandard.value),
    recordedAt: "2026-09-03T10:05:00.000Z"
  });
  assert.ok(uncappedKeyRecord.ok);
  if (!uncappedKeyRecord.ok) return;
  const uncappedRequest = createBoundedWriterRequest({ ...writerInputs,
    standard: uncappedStandard.value, standardArtifact: uncappedArtifact,
    keyJudgementRecord: uncappedKeyRecord.value,
    keyJudgementRecordArtifact: binding(uncappedKeyRecord.value.id) });
  assert.ok(uncappedRequest.ok);
  assert.equal(uncappedRequest.value.wordBudget, undefined);
  assert.match(uncappedRequest.value.prompt.system, /no overall word-count target or hard word limit/);
  assert.match(uncappedRequest.value.prompt.system, /Lead with a clear bottom line/);
  assert.doesNotMatch(uncappedRequest.value.prompt.system, /very short|whitespace-separated words/);
  assert.doesNotMatch(JSON.stringify(uncappedRequest.value), /Israel-Iran|sourceMemoRefs|archiveCoverage|regressionExamples/);
  const longMemo = recordWriterResponse({ ...recordInput,
    request: uncappedRequest.value, standard: uncappedStandard.value, keyJudgementRecord: uncappedKeyRecord.value,
    responseValue: { ...response, requestId: uncappedRequest.value.id, proposal: { statements: [
      { section: "analysis", text: Array<string>(450).fill("x").join(" "), claims: ["c01"] },
      { section: "analysis", text: Array<string>(450).fill("x").join(" "), claims: ["c02"] }
    ] } } });
  assert.ok(longMemo.ok);
  assert.ok(countWords(renderMemoMarkdown(longMemo.value.memo)) > 1_000);
  assert.equal(longMemo.value.memo.memoStandardVersion, 3);
  assert.ok(!longMemo.value.memo.publicationBlockers.includes("PROVISIONAL_MEMO_STANDARD"));
  assert.ok(longMemo.value.verification.checks.some(check => check.check === "prohibited-patterns"));
  assert.equal(longMemo.value.verification.checks.some(check => check.check === "word-limit-and-prohibited-patterns"), false);
  assert.ok(validateBoundedWriterRequest(uncappedRequest.value).ok);
  assert.equal(validateBoundedWriterRequest({ ...uncappedRequest.value, wordBudget: budget }).ok, false);

  const v4Standard = validateMemoStandard(JSON.parse(await readFile(resolve(DEFAULT_MEMO_STANDARD_PATH), "utf8")));
  assert.ok(v4Standard.ok);
  if (!v4Standard.ok || v4Standard.value.version !== 4) return;
  const v4Artifact = binding("memo-standard-v4");
  const v4SingleJudgementReq = createKeyJudgementRequest({
    buildRecord,
    buildRecordArtifact: buildArtifact,
    challengeRecord,
    challengeRecordArtifact: challengeArtifact,
    adjudication,
    adjudicationArtifact,
    memoStandardArtifact: v4Artifact,
    policy: keyJudgementPolicyFromStandard(v4Standard.value),
    preparedAt: "2026-09-03T10:03:30.000Z"
  });
  assert.ok(v4SingleJudgementReq.ok);
  if (!v4SingleJudgementReq.ok) return;
  const v4KeyRecord = recordKeyJudgementResponse({
    request: v4SingleJudgementReq.value,
    requestArtifact: binding("v4-key-judgement-request"),
    responseValue: {
      schemaVersion: "key-judgement-copilot-response-v1",
      requestId: v4SingleJudgementReq.value.id,
      invocationId: "v4-key-judgement-invocation",
      provider: "github-copilot-vscode",
      model: "not-exposed-by-host",
      startedAt: "2026-09-03T10:04:00.000Z",
      completedAt: "2026-09-03T10:04:30.000Z",
      freshSession: true,
      capturedBy: "TESTER",
      proposal: {
        selections: [
          { requirementId: "ir-01", claim: "c01", judgementText: "The visit is reported by one source." }
        ],
        omissions: [
          { requirementId: "ir-02", reason: "Secondary contested detail kept in narrative prose." }
        ]
      }
    },
    responseArtifact: binding("v4-key-judgement-response"),
    buildRecord,
    challengeRecord,
    adjudication,
    policy: keyJudgementPolicyFromStandard(v4Standard.value),
    recordedAt: "2026-09-03T10:05:00.000Z"
  });
  assert.ok(v4KeyRecord.ok);
  if (!v4KeyRecord.ok) return;
  const v4WriterReq = createBoundedWriterRequest({
    ...writerInputs,
    standard: v4Standard.value,
    standardArtifact: v4Artifact,
    keyJudgementRecord: v4KeyRecord.value,
    keyJudgementRecordArtifact: binding(v4KeyRecord.value.id),
    memoContext: {
      title: "Reported diplomatic visit and operational posture",
      audience: "Regional Security Leadership",
      purpose: "Assess near-term operational exposure",
      requirementTexts: {
        "ir-01": "What confirmed details establish the diplomatic visit?",
        "ir-02": "What was the operational purpose of the visit?",
        "ir-03": "Were energy infrastructure sites affected during the visit?"
      }
    }
  });
  assert.ok(v4WriterReq.ok);
  if (!v4WriterReq.ok) return;
  // v4 retains the full non-rejected adjudicated claim pool (both c01 and c02), not only selected KJ c01!
  assert.deepEqual(v4WriterReq.value.claims.map((entry) => entry.alias), ["c01", "c02"]);
  assert.ok(validateBoundedWriterRequest(v4WriterReq.value).ok);
  const v4Recorded = recordWriterResponse({
    ...recordInput,
    request: v4WriterReq.value,
    standard: v4Standard.value,
    keyJudgementRecord: v4KeyRecord.value,
    responseValue: {
      ...response,
      requestId: v4WriterReq.value.id,
      proposal: {
        statements: [
          { section: "bluf", text: "Single-source reporting indicates an official visit occurred, though its operational objective remains unverified.", claims: ["c01", "c02"] },
          { section: "situation", text: "Initial reporting described the arrival of the delegation.", claims: ["c01"] },
          { section: "situation", text: "Subsequent commentary noted that officials have not disclosed the agenda.", claims: ["c02"] },
          { section: "analysis", text: "Operational teams should treat the reported agenda with caution until corroborated.", claims: ["c01", "c02"] },
          { section: "uncertainties", text: "Public reporting relies on a single outlet without independent official confirmation.", claims: ["c02"] },
          { section: "indicators", text: "Official communiques confirming bilateral security commitments.", claims: ["c01"] }
        ]
      }
    }
  });
  assert.ok(v4Recorded.ok);
  if (!v4Recorded.ok) return;
  const v4Markdown = renderMemoMarkdown(v4Recorded.value.memo);
  assert.match(v4Markdown, /^# Memorandum: Reported diplomatic visit and operational posture/m);
  assert.match(v4Markdown, /\*\*To:\*\* Regional Security Leadership/);
  assert.match(v4Markdown, /## Bottom Line\nSingle-source reporting indicates an official visit occurred/);
  assert.match(v4Markdown, /## Key Judgements\n- The visit is reported by one source\. \[claim:[^\]]+\] \*\(Moderate confidence\)\*/);
  assert.match(v4Markdown, /## Situation\nInitial reporting described the arrival of the delegation\. \[claim:[^\]]+\] Subsequent commentary noted that officials have not disclosed the agenda\. \[claim:[^\]]+\]/);
  assert.match(v4Markdown, /## Assessment & Implications/);
  assert.match(v4Markdown, /Were energy infrastructure sites affected during the visit\?/);
  assert.match(v4Markdown, /## Outlook & Indicators to Watch/);
  assert.doesNotMatch(v4Markdown, /NOT FOR PUBLICATION|Status: accepted|Sourcing Summary|ir-03: silent/);
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
    !recorded.value.memo.publicationBlockers.includes(
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

  assert.equal(writerRequest.value.approvedScope, null);
  assert.ok(recorded.value.memo.publicationBlockers.includes("LEGACY_SCOPE_LINEAGE_UNAVAILABLE"));
  assert.match(renderMemoMarkdown(recorded.value.memo), /The visit is reported by one source\. \[claim:claim-a\] \*\*Status: accepted\.\*\*/);

  const scopedQuestion = {
    ...question,
    scopeApproval: {
      scopeId: "scope-1",
      scopeVersion: 1,
      artifactRef: "runs/run-1/memo-scopes/scope-1/v1/approved-memo-scope.json",
      artifactSha256: "b".repeat(64)
    }
  };
  const dependentBuild = structuredClone(buildRecord);
  dependentBuild.synthesis.limitations = [{
    id: "limitation-dependency",
    kind: "source-caveat",
    sourceNoteIds: ["note-1"],
    text: "Reporting dependency is mixed: NCSC-NL, Modat."
  }];
  const scopedRequest = createBoundedWriterRequest({
    buildRecord: dependentBuild,
    buildRecordArtifact: buildArtifact,
    challengeRecord,
    challengeRecordArtifact: challengeArtifact,
    adjudication,
    adjudicationArtifact,
    keyJudgementRecord: keyRecord.value,
    keyJudgementRecordArtifact: binding(keyRecord.value.id),
    question: scopedQuestion,
    questionArtifact: binding("question"),
    standard,
    standardArtifact,
    preparedAt: "2026-09-03T10:06:00.000Z"
  });
  assert.equal(scopedRequest.ok, true);
  if (!scopedRequest.ok) return;
  assert.deepEqual(scopedRequest.value.approvedScope, {
    artifactRef: scopedQuestion.scopeApproval.artifactRef,
    artifactSha256: scopedQuestion.scopeApproval.artifactSha256
  });
  assert.ok(!scopedRequest.value.derivedLimitations.some((text) => text.includes("legacy question")));
  assert.match(scopedRequest.value.derivedSourcingSummary, /Reporting dependency is mixed: NCSC-NL, Modat\./);
  const scopedRecorded = recordWriterResponse({
    request: scopedRequest.value,
    requestArtifact: binding("writer-request-scoped"),
    responseValue: { ...response, requestId: scopedRequest.value.id },
    responseArtifact: binding("writer-response-scoped"),
    buildRecord: dependentBuild,
    challengeRecord,
    adjudication,
    keyJudgementRecord: keyRecord.value,
    question: scopedQuestion,
    standard,
    recordedAt: "2026-09-03T10:08:00.000Z"
  });
  assert.equal(scopedRecorded.ok, true);
  if (!scopedRecorded.ok) return;
  assert.ok(!scopedRecorded.value.memo.publicationBlockers.includes("LEGACY_SCOPE_LINEAGE_UNAVAILABLE"));
  assert.deepEqual(scopedRecorded.value.memo.approvedScope, scopedRequest.value.approvedScope);
  assert.deepEqual(scopedRecorded.value.memo.sourcingSummary.reportingDependencies, [
    "Reporting dependency is mixed: NCSC-NL, Modat."
  ]);

  const automated = createAutomatedAdjudication({
    buildRecord,
    buildRecordArtifact: buildArtifact,
    challengeRecord,
    challengeRecordArtifact: challengeArtifact,
    createdAt: "2026-09-03T10:09:00.000Z"
  });
  assert.equal(automated.ok, true);
  if (!automated.ok) return;
  assert.equal(validatePerformedAdjudication(automated.value).ok, true);
  assert.deepEqual(automated.value.claims, [
    { claimId: "claim-a", status: "accepted", openChallengeIds: [] },
    { claimId: "claim-b", status: "contested", openChallengeIds: ["challenge-b"] }
  ]);
});