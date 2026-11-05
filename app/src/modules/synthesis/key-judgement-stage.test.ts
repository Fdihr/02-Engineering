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
  const value = JSON.parse(await readFile(resolve(DEFAULT_MEMO_STANDARD_PATH), "utf8"));
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
  const uncappedStandard = validateMemoStandard(JSON.parse(await readFile(resolve(DEFAULT_MEMO_STANDARD_PATH), "utf8")));
  assert.ok(uncappedStandard.ok);
  const uncappedArtifact = binding("memo-standard-v2");
  const uncappedKeyRecord = { ...keyRecord.value, memoStandard: uncappedArtifact };
  const uncappedRequest = createBoundedWriterRequest({ ...writerInputs,
    standard: uncappedStandard.value, standardArtifact: uncappedArtifact, keyJudgementRecord: uncappedKeyRecord });
  assert.ok(uncappedRequest.ok);
  assert.equal(uncappedRequest.value.wordBudget, undefined);
  assert.match(uncappedRequest.value.prompt.system, /no word-count target or hard word limit/);
  assert.doesNotMatch(uncappedRequest.value.prompt.system, /very short|whitespace-separated words/);
  const longMemo = recordWriterResponse({ ...recordInput,
    request: uncappedRequest.value, standard: uncappedStandard.value, keyJudgementRecord: uncappedKeyRecord,
    responseValue: { ...response, requestId: uncappedRequest.value.id, proposal: { statements: [
      { section: "analysis", text: Array<string>(450).fill("x").join(" "), claims: ["c01"] },
      { section: "analysis", text: Array<string>(450).fill("x").join(" "), claims: ["c02"] }
    ] } } });
  assert.ok(longMemo.ok);
  assert.ok(countWords(renderMemoMarkdown(longMemo.value.memo)) > 1_000);
  assert.equal(longMemo.value.memo.memoStandardVersion, 2);
  assert.ok(longMemo.value.verification.checks.some(check => check.check === "prohibited-patterns"));
  assert.equal(longMemo.value.verification.checks.some(check => check.check === "word-limit-and-prohibited-patterns"), false);
  assert.ok(validateBoundedWriterRequest(uncappedRequest.value).ok);
  assert.equal(validateBoundedWriterRequest({ ...uncappedRequest.value, wordBudget: budget }).ok, false);
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
});