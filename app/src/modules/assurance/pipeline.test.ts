import assert from "node:assert/strict";
import test from "node:test";
import { createSourceDocument } from "../source/source-document.js";
import { assembleSourceNote } from "./assemble.js";
import { recordExtractResponse } from "./extract/record.js";
import { createExtractRequest } from "./extract/request.js";
import { measureAssurance, readMeasuredNote } from "./measure.js";
import { validateProfilePolicy } from "./policy.js";
import { approveRequirements } from "./requirements.js";
import { createReviewPackage } from "./review/package.js";
import { recordReview } from "./review/record.js";
import { validateAdmittedSource } from "./snapshot-source.js";
import type {
  AdmittedSource,
  ApprovedRequirements,
  ExtractCommit,
  ProfilePolicy
} from "./types.js";

const policyResult = validateProfilePolicy({
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
});
if (!policyResult.ok) {
  throw new Error(policyResult.error);
}
const policy: ProfilePolicy = policyResult.value;

const documentArtifactRef = "runs/run-1/sources/source-1/source-document.json";
const documentArtifactSha256 = "d".repeat(64);

const documentResult = createSourceDocument({
  runId: "run-1",
  sourceItemId: "source-1",
  sourceKind: "retrieved-publisher",
  contentFormat: "markdown",
  body: [
    "The ministry announced a formal review on 4 March.",
    "",
    "A spokesperson said the review would continue through spring."
  ].join("\n"),
  sourceArtifactRef: "runs/run-1/retrieval.json",
  sourceArtifactSha256: "c".repeat(64),
  lineageArtifactRefs: []
});
if (!documentResult.ok) {
  throw new Error(documentResult.error);
}
const document = documentResult.value;

const segmentId = (ordinal: number): string => {
  const segment = document.segments[ordinal];
  if (!segment) {
    throw new Error(`Missing fixture segment ${ordinal}`);
  }
  return segment.id;
};

const approvedQuestion = {
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

const admittedResult = validateAdmittedSource({
  snapshotValue: {
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
      source: { publisherHost: "example.test" },
      researchQuestion: approvedQuestion,
      questionRelevance: {
        assessment: {
          researchQuestionId: "rq-test-001",
          sourceDocumentArtifactRef: documentArtifactRef,
          sourceDocumentArtifactSha256: documentArtifactSha256
        }
      }
    }
  },
  snapshotArtifactRef: "runs/decision-1/approved-evidence-snapshot.json",
  snapshotArtifactSha256: "e".repeat(64),
  decisionValue: {
    id: "decision-1",
    sourceRunId: "run-1",
    providerItemId: "candidate-1",
    reviewerId: "TESTER",
    decidedAt: "2026-03-06T00:00:00.000Z",
    decision: "approved",
    reason: "it fits",
    intakeArtifactRef: "runs/run-1/source-reintakes/candidate-1/intake-result.json"
  },
  decisionArtifactRef: "runs/decision-1/evidence-decision.json",
  decisionArtifactSha256: "f".repeat(64),
  researchQuestionValue: approvedQuestion,
  sourceDocumentValue: document,
  sourceDocumentArtifactRef: documentArtifactRef,
  sourceDocumentArtifactSha256: documentArtifactSha256,
  validatedAt: "2026-03-10T00:00:00.000Z"
});
if (!admittedResult.ok) {
  throw new Error(admittedResult.error);
}
const admitted: AdmittedSource = admittedResult.value;

const requirementsArtifact = {
  artifactRef: "runs/run-1/requirements/req-proposal-1/approved-requirements.json",
  artifactSha256: "1".repeat(64)
};
const policyArtifact = {
  artifactRef: "src/modules/assurance/policies/geopolitical-source-assurance-v1.json",
  artifactSha256: "2".repeat(64)
};
const requestArtifact = {
  artifactRef:
    "runs/run-1/assurance/snapshot-decision-1/extract/attempt-1/extract-request.json",
  artifactSha256: "3".repeat(64)
};
const responseArtifact = {
  artifactRef:
    "runs/run-1/assurance/snapshot-decision-1/extract/attempt-1/copilot-response.json",
  artifactSha256: "4".repeat(64)
};
const commitArtifact = {
  artifactRef: "runs/run-1/assurance/snapshot-decision-1/extract/extract-commit.json",
  artifactSha256: "5".repeat(64)
};
const packageArtifact = {
  artifactRef: "runs/run-1/assurance/snapshot-decision-1/review/review-package.json",
  artifactSha256: "7".repeat(64)
};
const responseReviewArtifact = {
  artifactRef:
    "runs/run-1/assurance/snapshot-decision-1/review/review-response-1.json",
  artifactSha256: "8".repeat(64)
};
const recordArtifact = {
  artifactRef: "runs/run-1/assurance/snapshot-decision-1/review/review-record.json",
  artifactSha256: "9".repeat(64)
};

const approvedRequirementsResult = approveRequirements({
  proposalValue: {
    proposalId: "req-proposal-1",
    questionId: "rq-test-001",
    runId: "run-1",
    requirements: [
      { irId: "ir-01", text: "Was a review announced?" },
      { irId: "ir-02", text: "How long will the review continue?" }
    ]
  },
  proposalArtifactRef:
    "runs/run-1/requirements/req-proposal-1/requirements-proposal.json",
  proposalArtifactSha256: "0".repeat(64),
  researchQuestionValue: approvedQuestion,
  reviewerId: "TESTER",
  approvedAt: "2026-03-07T00:00:00.000Z"
});
if (!approvedRequirementsResult.ok) {
  throw new Error(approvedRequirementsResult.error);
}
const requirements: ApprovedRequirements = approvedRequirementsResult.value;

const buildCommit = (proposal: unknown): ExtractCommit => {
  const request = createExtractRequest({
    admitted,
    requirements,
    requirementsArtifact,
    policy,
    policyArtifact,
    attempt: 1,
    preparedAt: "2026-03-10T00:00:00.000Z",
    feedback: null
  });
  if (!request.ok) {
    throw new Error(request.error);
  }
  const outcome = recordExtractResponse({
    request: request.value,
    requestArtifact,
    responseValue: {
      schemaVersion: "source-assurance-copilot-poc-response-v2",
      requestId: request.value.id,
      invocationId: "copilot-session-1",
      provider: "github-copilot-vscode",
      model: "not-exposed-by-host",
      startedAt: "2026-03-10T00:01:00.000Z",
      completedAt: "2026-03-10T00:02:00.000Z",
      freshSession: true,
      capturedBy: "TESTER",
      proposal
    },
    responseArtifact,
    admitted,
    requirements,
    requirementsArtifact,
    policy,
    policyArtifact,
    recordedAt: "2026-03-10T00:03:00.000Z"
  });
  if (!outcome.ok || outcome.value.status !== "committed") {
    throw new Error("Expected a committed extraction");
  }
  return outcome.value.commit;
};

const singleObservationProposal = {
  observations: [
    {
      segment: "01",
      quote: "The ministry announced a formal review on 4 March.",
      text: "The ministry announced a formal review.",
      claimKind: "event",
      attribution: { kind: "direct" },
      date: { text: "4 March", role: "event" },
      irIds: ["ir-01"]
    }
  ],
  dispositions: [
    { irId: "ir-01", disposition: "covered" },
    { irId: "ir-02", disposition: "silent" }
  ]
};

const commit = buildCommit(singleObservationProposal);

const buildPackage = (source: ExtractCommit = commit) => {
  const result = createReviewPackage({
    commit: source,
    commitArtifact,
    requirements,
    document,
    createdAt: "2026-03-11T00:00:00.000Z"
  });
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
};

const reviewPackage = buildPackage();

const humanObservation = {
  segment: "02",
  quote: "A spokesperson said the review would continue through spring.",
  text: "A spokesperson said the review would continue through spring.",
  claimKind: "statement",
  attribution: { kind: "attributed", attributedTo: "A spokesperson" },
  irIds: ["ir-02"]
};

const assessment = {
  reliability: {
    access: "indirect",
    accessRationale: "The publisher relays official statements.",
    trackRecord: "unknown",
    trackRecordRationale: "Not established in this experiment.",
    alignment: "No declared alignment was identified."
  },
  dependency: {
    kind: "mixed",
    upstreamSources: ["Ministry statement"],
    rationale: "The article mixes narration with attributed statements."
  },
  limitations: ["Single-source only."]
};

const baseResponse = {
  packageSha256: packageArtifact.artifactSha256,
  reviewerId: "TESTER",
  reviewedAt: "2026-03-12T00:00:00.000Z",
  supportPass: "performed",
  omissionPass: "performed",
  verdicts: reviewPackage.observations.map((entry) => ({
    observationId: entry.observationId,
    verdict: "supported"
  })),
  humanObservations: [humanObservation],
  irReview: [
    { irId: "ir-01", disposition: "covered" },
    {
      irId: "ir-02",
      disposition: "partial",
      note: "The duration is described only as continuing through spring."
    }
  ],
  assessment
};

const buildRecord = (responseValue: unknown, source = reviewPackage) =>
  recordReview({
    reviewPackage: source,
    packageArtifact,
    responseValue,
    responseArtifact: responseReviewArtifact,
    document,
    documentArtifact: {
      artifactRef: documentArtifactRef,
      artifactSha256: documentArtifactSha256
    },
    requirements,
    policy,
    recordedAt: "2026-03-13T00:00:00.000Z"
  });

test("orders the review package and collapses exact duplicates", () => {
  const duplicated = buildCommit({
    observations: [
      singleObservationProposal.observations[0],
      singleObservationProposal.observations[0]
    ],
    dispositions: [
      { irId: "ir-01", disposition: "covered" },
      { irId: "ir-02", disposition: "silent" }
    ]
  });
  const collapsed = buildPackage(duplicated);
  assert.equal(duplicated.observations.length, 2);
  assert.equal(collapsed.observations.length, 1);
  assert.deepEqual(collapsed.observations[0]?.extractIndexes, [0, 1]);
  assert.equal(collapsed.observations[0]?.occurrences, 2);
});

test("records a bound review with anchored human observations", () => {
  const record = buildRecord(baseResponse);
  assert.equal(record.ok, true);
  if (record.ok) {
    assert.equal(record.value.humanObservations.length, 1);
    assert.equal(record.value.humanObservations[0]?.origin, "human");
    assert.ok("dependency" in record.value.assessment);
    if ("dependency" in record.value.assessment) {
      assert.equal(record.value.assessment.dependency.kind, "mixed");
    }
  }
});

const provisionalResponse = {
  packageSha256: packageArtifact.artifactSha256,
  reviewerId: "PROVISIONAL-CONTROLLER",
  reviewedAt: "2026-03-12T00:00:00.000Z",
  supportPass: "not-performed",
  omissionPass: "not-performed",
  verdicts: [],
  humanObservations: [],
  irReview: []
};

test("records provisional review state without human judgments", () => {
  const record = buildRecord(provisionalResponse);
  assert.equal(record.ok, true);
  if (!record.ok) {
    return;
  }
  assert.equal(record.value.supportPass, "not-performed");
  assert.equal(record.value.irReviewBasis, "not-performed");
  assert.deepEqual(record.value.assessment, { status: "not-assessed" });
  assert.deepEqual(
    record.value.verdicts.map((entry) => entry.verdict),
    reviewPackage.observations.map(() => "unreviewed")
  );

  const explicit = buildRecord({
    ...provisionalResponse,
    assessment: { status: "not-assessed" }
  });
  assert.equal(explicit.ok, true);
});

test("rejects every contradictory provisional judgment field", () => {
  const observationId = reviewPackage.observations[0]?.observationId ?? "";
  const contradictions = [
    { ...provisionalResponse, omissionPass: "performed" },
    {
      ...provisionalResponse,
      verdicts: [{ observationId, verdict: "supported" }]
    },
    { ...provisionalResponse, humanObservations: [humanObservation] },
    {
      ...provisionalResponse,
      irReview: [{ irId: "ir-01", disposition: "covered" }]
    },
    { ...provisionalResponse, assessment }
  ];
  for (const response of contradictions) {
    assert.deepEqual(buildRecord(response), {
      ok: false,
      error: "INVALID_SUPPORT_PASS"
    });
  }
});

test("rejects reviews that are unbound, incomplete, or unexplained", () => {
  assert.deepEqual(buildRecord({ ...baseResponse, packageSha256: "a".repeat(64) }), {
    ok: false,
    error: "RESPONSE_NOT_BOUND_TO_PACKAGE"
  });
  assert.deepEqual(buildRecord({ ...baseResponse, verdicts: [] }), {
    ok: false,
    error: "INVALID_VERDICT_COVERAGE"
  });
  assert.deepEqual(
    buildRecord({
      ...baseResponse,
      irReview: [
        { irId: "ir-01", disposition: "covered" },
        { irId: "ir-02", disposition: "partial" }
      ]
    }),
    { ok: false, error: "MISSING_IR_REVIEW_NOTE" }
  );
  assert.deepEqual(
    buildRecord({
      ...baseResponse,
      humanObservations: [
        { ...humanObservation, quote: "A quotation absent from the source document." }
      ]
    }),
    { ok: false, error: "INVALID_HUMAN_OBSERVATION" }
  );
  assert.deepEqual(
    buildRecord({
      ...baseResponse,
      humanObservations: [
        { ...humanObservation, attribution: { kind: "direct" } }
      ]
    }),
    { ok: false, error: "INVALID_HUMAN_OBSERVATION" }
  );
});

const buildNote = (responseValue: unknown = baseResponse) => {
  const record = buildRecord(responseValue);
  if (!record.ok) {
    throw new Error(record.error);
  }
  return assembleSourceNote({
    admitted,
    commit,
    commitArtifact,
    reviewPackage,
    reviewRecord: record.value,
    reviewRecordArtifact: recordArtifact,
    requirements,
    policy,
    assembledAt: "2026-03-14T00:00:00.000Z"
  });
};

test("assembles a lineage-complete note with disjoint observation sets", () => {
  const note = buildNote();
  assert.equal(note.ok, true);
  if (!note.ok) {
    return;
  }
  assert.equal(note.value.inScopeObservations.length, 2);
  assert.equal(note.value.outOfIrObservations.length, 0);
  assert.equal(note.value.rejectedObservations.length, 0);
  assert.equal(note.value.lineage.snapshot.artifactSha256, "e".repeat(64));
  assert.equal(note.value.lineage.reviewRecord.artifactSha256, "9".repeat(64));
  assert.deepEqual(note.value.gaps, [
    {
      irId: "ir-02",
      disposition: "partial",
      note: "The duration is described only as continuing through spring."
    }
  ]);
  assert.equal(
    note.value.irDispositions.find((entry) => entry.irId === "ir-02")
      ?.modelDisposition,
    "silent"
  );
  assert.equal(
    note.value.irDispositions.find((entry) => entry.irId === "ir-02")
      ?.finalDisposition,
    "partial"
  );
  assert.ok(
    note.value.caveats.some((entry) => entry.includes("fresh model session"))
  );
});

test("assembles provisional observations and null human dispositions honestly", () => {
  const note = buildNote(provisionalResponse);
  assert.equal(note.ok, true);
  if (!note.ok) {
    return;
  }
  assert.equal(note.value.reviewStatus, "provisional");
  assert.ok(
    [...note.value.inScopeObservations, ...note.value.outOfIrObservations].every(
      (entry) => entry.reviewVerdict === "unreviewed"
    )
  );
  assert.ok(
    note.value.irDispositions.every(
      (entry) => entry.humanDisposition === null && entry.finalDisposition === null
    )
  );
  assert.deepEqual(note.value.assessment, { status: "not-assessed" });
  assert.equal(
    note.value.caveats.filter(
      (entry) =>
        entry ===
        "Observations not reviewed by a human; evidence in this note is provisional."
    ).length,
    1
  );
  assert.ok(
    !note.value.caveats.some((entry) =>
      entry.startsWith("No omission pass was performed")
    )
  );
});

test("reviewed notes can supersede but never edit provisional notes", () => {
  const provisional = buildNote(provisionalResponse);
  const reviewedRecord = buildRecord(baseResponse);
  if (!provisional.ok || !reviewedRecord.ok) {
    throw new Error("Expected provisional note and reviewed record");
  }
  const reviewed = assembleSourceNote({
    admitted,
    commit,
    commitArtifact,
    reviewPackage,
    reviewRecord: reviewedRecord.value,
    reviewRecordArtifact: recordArtifact,
    supersededNote: provisional.value,
    requirements,
    policy,
    assembledAt: "2026-03-16T00:00:00.000Z"
  });
  assert.equal(reviewed.ok, true);
  if (reviewed.ok) {
    assert.equal(reviewed.value.reviewStatus, "reviewed");
    assert.equal(reviewed.value.supersedesNoteId, provisional.value.id);
    assert.equal(provisional.value.reviewStatus, "provisional");
    assert.equal(provisional.value.supersedesNoteId, undefined);
  }
});

test("assembly fails on disposition inconsistency instead of repairing it", () => {
  assert.deepEqual(
    buildNote({
      ...baseResponse,
      humanObservations: [],
      irReview: [
        { irId: "ir-01", disposition: "covered" },
        { irId: "ir-02", disposition: "partial", note: "Claimed without evidence." }
      ]
    }),
    { ok: false, error: "IR_DISPOSITION_UNSUPPORTED" }
  );
  assert.deepEqual(
    buildNote({
      ...baseResponse,
      irReview: [
        { irId: "ir-01", disposition: "covered" },
        { irId: "ir-02", disposition: "silent", note: "Denied despite evidence." }
      ]
    }),
    { ok: false, error: "IR_DISPOSITION_SILENT_WITH_EVIDENCE" }
  );
});

test("measures the run and recommends the next experiment", () => {
  const note = buildNote();
  const record = buildRecord(baseResponse);
  if (!note.ok || !record.ok) {
    throw new Error("Expected a note and a review record");
  }
  const measured = readMeasuredNote(note.value, policy);
  assert.equal(measured.ok, true);
  if (!measured.ok) {
    return;
  }

  const metrics = measureAssurance({
    note: measured.value,
    reviewPackage,
    reviewRecord: record.value,
    attemptFailures: [[]],
    measuredAt: "2026-03-15T00:00:00.000Z"
  });
  assert.equal(metrics.ok, true);
  if (!metrics.ok) {
    return;
  }
  assert.equal(metrics.value.supportFailureRate, 0);
  assert.equal(metrics.value.chromeRate, 0);
  assert.equal(metrics.value.omissionCount, 1);
  assert.deepEqual(metrics.value.dispositionMismatches, {
    total: 1,
    overclaims: 0,
    underclaims: 1
  });
  assert.equal(metrics.value.quoteFidelityFailures, 0);
  assert.ok(
    metrics.value.recommendations.some((entry) =>
      entry.includes("requirement tagging")
    )
  );
});

test("provisional measurement leaves every review metric unmeasured", () => {
  const note = buildNote(provisionalResponse);
  const record = buildRecord(provisionalResponse);
  if (!note.ok || !record.ok) {
    throw new Error("Expected a provisional note and review record");
  }
  const measuredNote = readMeasuredNote(note.value, policy);
  if (!measuredNote.ok) {
    throw new Error(measuredNote.error);
  }
  const metrics = measureAssurance({
    note: measuredNote.value,
    reviewPackage,
    reviewRecord: record.value,
    attemptFailures: [[]],
    measuredAt: "2026-03-15T00:00:00.000Z"
  });
  assert.equal(metrics.ok, true);
  if (!metrics.ok) {
    return;
  }
  assert.equal(metrics.value.reviewStatus, "provisional");
  assert.equal(metrics.value.reviewedModelObservations, null);
  assert.equal(metrics.value.supportFailureRate, null);
  assert.equal(metrics.value.chromeRate, null);
  assert.equal(metrics.value.omissionCount, null);
  assert.deepEqual(metrics.value.dispositionMismatches, {
    total: null,
    overclaims: null,
    underclaims: null
  });
  assert.deepEqual(metrics.value.tagPrecision, {
    tagsProposed: null,
    tagsRemoved: null,
    precision: null
  });
  for (const warning of [
    "support pass remains unmeasured",
    "Chrome rate remains unmeasured",
    "Sweep decision remains unmeasured",
    "Tag precision remains unmeasured",
    "Disposition comparison remains unmeasured"
  ]) {
    assert.ok(metrics.value.recommendations.some((entry) => entry.includes(warning)));
  }
});

test("removes an over-tagged requirement without calling the quote unsupported", () => {
  const overTagged = buildCommit({
    observations: [
      {
        ...singleObservationProposal.observations[0],
        irIds: ["ir-01", "ir-02"]
      }
    ],
    dispositions: [
      { irId: "ir-01", disposition: "covered" },
      { irId: "ir-02", disposition: "covered" }
    ]
  });
  const overTaggedPackage = buildPackage(overTagged);
  const observationId = overTaggedPackage.observations[0]?.observationId ?? "";

  const record = buildRecord(
    {
      ...baseResponse,
      verdicts: [
        { observationId, verdict: "supported", correctedIrIds: ["ir-01"] }
      ],
      humanObservations: [],
      irReview: [
        { irId: "ir-01", disposition: "covered" },
        { irId: "ir-02", disposition: "silent", note: "The duration is not given." }
      ]
    },
    overTaggedPackage
  );
  assert.equal(record.ok, true);
  if (!record.ok) {
    return;
  }
  assert.deepEqual(record.value.verdicts[0]?.correctedIrIds, ["ir-01"]);

  const note = assembleSourceNote({
    admitted,
    commit: overTagged,
    commitArtifact,
    reviewPackage: overTaggedPackage,
    reviewRecord: record.value,
    reviewRecordArtifact: recordArtifact,
    requirements,
    policy,
    assembledAt: "2026-03-14T00:00:00.000Z"
  });
  assert.equal(note.ok, true);
  if (!note.ok) {
    return;
  }
  assert.deepEqual(note.value.inScopeObservations[0]?.irIds, ["ir-01", "ir-02"]);
  assert.deepEqual(note.value.inScopeObservations[0]?.correctedIrIds, ["ir-01"]);
  assert.deepEqual(
    note.value.irDispositions.find((entry) => entry.irId === "ir-02")
      ?.observationIds,
    []
  );

  const metrics = measureAssurance({
    note: {
      runId: note.value.runId,
      snapshotId: note.value.snapshotId,
      reviewStatus: "reviewed",
      irDispositions: note.value.irDispositions,
      matchedVia: ["exact"]
    },
    reviewPackage: overTaggedPackage,
    reviewRecord: record.value,
    attemptFailures: [[]],
    measuredAt: "2026-03-15T00:00:00.000Z"
  });
  assert.equal(metrics.ok, true);
  if (!metrics.ok) {
    return;
  }
  assert.equal(metrics.value.supportFailureRate, 0);
  assert.deepEqual(metrics.value.tagPrecision, {
    tagsProposed: 2,
    tagsRemoved: 1,
    precision: 0.5
  });
});

test("rejects corrected tags that are not a proper subset of the proposal", () => {
  const observationId = reviewPackage.observations[0]?.observationId ?? "";
  assert.deepEqual(
    buildRecord({
      ...baseResponse,
      verdicts: [{ observationId, verdict: "supported", correctedIrIds: ["ir-02"] }]
    }),
    { ok: false, error: "INVALID_CORRECTED_TAGS" }
  );
  assert.deepEqual(
    buildRecord({
      ...baseResponse,
      verdicts: [
        {
          observationId,
          verdict: "unsupported",
          note: "Not supported.",
          correctedIrIds: []
        }
      ]
    }),
    { ok: false, error: "INVALID_CORRECTED_TAGS" }
  );
});

test("records an unperformed omission pass as unmeasured, never as zero", () => {
  const response = {
    ...baseResponse,
    omissionPass: "not-performed",
    humanObservations: [],
    irReview: [
      { irId: "ir-01", disposition: "covered" },
      { irId: "ir-02", disposition: "silent", note: "No supporting observation." }
    ]
  };
  const record = buildRecord(response);
  assert.equal(record.ok, true);
  if (!record.ok) {
    return;
  }

  const note = assembleSourceNote({
    admitted,
    commit,
    commitArtifact,
    reviewPackage,
    reviewRecord: record.value,
    reviewRecordArtifact: recordArtifact,
    requirements,
    policy,
    assembledAt: "2026-03-14T00:00:00.000Z"
  });
  assert.equal(note.ok, true);
  if (!note.ok) {
    return;
  }
  assert.ok(
    note.value.caveats.some((entry) => entry.includes("No omission pass was performed"))
  );

  const metrics = measureAssurance({
    note: {
      runId: note.value.runId,
      snapshotId: note.value.snapshotId,
      reviewStatus: "reviewed",
      irDispositions: note.value.irDispositions,
      matchedVia: ["exact"]
    },
    reviewPackage,
    reviewRecord: record.value,
    attemptFailures: [[]],
    measuredAt: "2026-03-15T00:00:00.000Z"
  });
  assert.equal(metrics.ok, true);
  if (!metrics.ok) {
    return;
  }
  assert.equal(metrics.value.omissionCount, null);
  assert.ok(
    metrics.value.recommendations.some((entry) =>
      entry.includes("Sweep decision remains unmeasured")
    )
  );
});

test("rejects human observations when no omission pass was performed", () => {
  assert.deepEqual(
    buildRecord({ ...baseResponse, omissionPass: "not-performed" }),
    { ok: false, error: "INVALID_OMISSION_PASS" }
  );
});

test("measurement routes support failures separately from coverage mismatches", () => {
  const record = buildRecord({
    ...baseResponse,
    verdicts: reviewPackage.observations.map((entry) => ({
      observationId: entry.observationId,
      verdict: "unsupported",
      note: "The quote does not support the stated claim kind."
    })),
    irReview: [
      { irId: "ir-01", disposition: "silent", note: "No supported observation." },
      {
        irId: "ir-02",
        disposition: "partial",
        note: "The duration is described only as continuing through spring."
      }
    ]
  });
  if (!record.ok) {
    throw new Error(record.error);
  }
  const metrics = measureAssurance({
    note: {
      runId: "run-1",
      snapshotId: "snapshot-decision-1",
      reviewStatus: "reviewed",
      irDispositions: [
        {
          irId: "ir-01",
          modelDisposition: "covered",
          humanDisposition: "silent"
        },
        {
          irId: "ir-02",
          modelDisposition: "silent",
          humanDisposition: "partial"
        }
      ],
      matchedVia: ["exact"]
    },
    reviewPackage,
    reviewRecord: record.value,
    attemptFailures: [[{ check: "E3", count: 2, rule: "quote rule" }], []],
    measuredAt: "2026-03-15T00:00:00.000Z"
  });
  assert.equal(metrics.ok, true);
  if (!metrics.ok) {
    return;
  }
  assert.equal(metrics.value.supportFailureRate, 1);
  assert.equal(metrics.value.quoteFidelityFailures, 2);
  assert.deepEqual(metrics.value.dispositionMismatches, {
    total: 2,
    overclaims: 1,
    underclaims: 1
  });
  assert.ok(
    metrics.value.recommendations.some((entry) =>
      entry.includes("bounded semantic support check")
    )
  );
});
