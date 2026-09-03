import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolve } from "node:path";
import type {
  ArtifactBinding,
  NoteObservation,
  SourceNote
} from "../assurance/types.js";
import { verifyPublicationEligibility } from "../memo/publication-check.js";
import { buildExternalSynthesis, createSynthesisBuildEnvelope } from "./build.js";
import {
  validateOutletIdentityTable,
  validateSynthesisProfilePolicy
} from "./policy.js";
import { validateSynthesisSourceNote } from "./source-note.js";
import {
  createSynthesisBuildRequest,
  validateSynthesisBuildRequest
} from "./request.js";
import { recordSynthesisBuildResponse } from "./response.js";
import {
  createBuildResponseStructuralExample,
  parseBuildProposal
} from "./proposal.js";
import {
  CHALLENGE_CHECKS,
  createChallengeRequest,
  createChallengeStructuralExample,
  createProvisionalAdjudication,
  parseChallengeProposal,
  recordChallengeResponse
} from "./challenge.js";
import {
  createWriterRequest,
  recordWriterResponse,
  renderMemoMarkdown,
  validateMemoStandardV0,
  type MemoStandardV0
} from "../memo/writer.js";
import type {
  BoundSourceNote,
  BuildClaimProposal,
  OutletIdentityTable,
  SynthesisBuildRecord,
  SynthesisProfilePolicy
} from "./types.js";
import {
  LEGACY_BUILD_REQUEST_SCHEMA_VERSION,
  LEGACY_BUILD_REQUEST_SCHEMA_VERSION_V2
} from "./types.js";

const binding = (name: string): ArtifactBinding => ({
  artifactRef: `runs/run-1/${name}.json`,
  artifactSha256: createHash("sha256").update(name).digest("hex")
});

const lineageBinding = binding("lineage");

const observation = (input: {
  id: string;
  kind?: "event" | "statement" | "assessment" | "forecast";
  attribution?: "direct" | "attributed" | "relayed";
  attributedTo?: string;
  irId?: string;
  reviewVerdict?: "supported" | "unreviewed";
}): NoteObservation => ({
  segment: "01",
  quote: `Synthetic quote ${input.id}`,
  text: `Synthetic observation ${input.id}`,
  claimKind: input.kind ?? "event",
  attribution: input.attributedTo
    ? { kind: input.attribution ?? "relayed", attributedTo: input.attributedTo }
    : { kind: input.attribution ?? "direct" },
  irIds: [input.irId ?? "ir-01"],
  observationId: input.id,
  segmentId: `segment-${input.id}`,
  anchor: {
    sourceDocumentId: `document-${input.id}`,
    sourceDocumentArtifactRef: `runs/run-1/${input.id}/source-document.json`,
    sourceDocumentArtifactSha256: "d".repeat(64),
    segmentId: `segment-${input.id}`,
    segmentSha256: "e".repeat(64),
    quote: `Synthetic quote ${input.id}`,
    quoteStartUtf8Byte: 0,
    quoteEndUtf8Byte: 24
  },
  origin: "model",
  proposedQuote: `Synthetic quote ${input.id}`,
  matchedVia: "exact",
  reviewVerdict: input.reviewVerdict ?? "supported"
});

const assessment = {
  reliability: {
    access: "direct" as const,
    accessRationale: "Synthetic direct access for deterministic testing.",
    trackRecord: "established" as const,
    trackRecordRationale: "Synthetic established record for deterministic testing.",
    alignment: "No alignment is asserted by the fixture."
  },
  dependency: {
    kind: "original" as const,
    upstreamSources: [],
    rationale: "Synthetic original reporting."
  },
  limitations: []
};

const note = (input: {
  id: string;
  host: string;
  observations: NoteObservation[];
  provisional?: boolean;
  synthetic?: boolean;
  caveats?: string[];
  supersedesNoteId?: string;
}): SourceNote => {
  const synthetic = input.synthetic ?? false;
  const provisional = input.provisional ?? false;
  const reviewed = !provisional && !synthetic;
  const observations = input.observations.map((entry) => ({
    ...entry,
    reviewVerdict: reviewed ? ("supported" as const) : ("unreviewed" as const)
  }));
  const irIds = [...new Set(observations.flatMap((entry) => entry.irIds))];
  const provisionalCaveat =
    "Observations not reviewed by a human; evidence in this note is provisional.";
  return {
    schemaVersion: "source-intelligence-note-v2",
    id: input.id,
    assembledAt: "2026-09-03T08:00:00.000Z",
    runId: "run-1",
    snapshotId: `snapshot-${input.id}`,
    sourceDecisionId: `decision-${input.id}`,
    candidateId: `candidate-${input.id}`,
    researchQuestionId: "rq-1",
    sourceDocumentId: `document-${input.id}`,
    sourceIdentity: { kind: "publisher", publisherHost: input.host },
    reviewStatus: synthetic ? "synthetic" : provisional ? "provisional" : "reviewed",
    ...(input.supersedesNoteId ? { supersedesNoteId: input.supersedesNoteId } : {}),
    lineage: {
      snapshot: lineageBinding,
      evidenceDecision: lineageBinding,
      researchQuestion: lineageBinding,
      sourceDocument: lineageBinding,
      requirements: lineageBinding,
      policy: lineageBinding,
      contract: {
        requestSchemaVersion: "source-assurance-extract-request-v2",
        responseSchemaVersion: "source-assurance-copilot-poc-response-v2",
        checks: []
      },
      extractCommit: lineageBinding,
      reviewPackage: lineageBinding,
      reviewResponse: lineageBinding,
      reviewRecord: lineageBinding,
      invocation: {
        id: "invocation-1",
        provider: "github-copilot-vscode",
        model: "not-exposed-by-host",
        startedAt: "2026-09-03T07:00:00.000Z",
        completedAt: "2026-09-03T07:00:01.000Z",
        freshSession: true,
        capturedBy: "TESTER",
        request: lineageBinding,
        response: lineageBinding
      }
    },
    inScopeObservations: observations,
    outOfIrObservations: [],
    rejectedObservations: [],
    irDispositions: irIds.map((irId) => ({
      irId,
      modelDisposition: "covered",
      humanDisposition: reviewed ? "covered" : null,
      finalDisposition: reviewed ? "covered" : null,
      observationIds: observations
        .filter((entry) => entry.irIds.includes(irId))
        .map((entry) => entry.observationId)
    })),
    assessment: reviewed ? assessment : { status: "not-assessed" },
    attributionSummary: [],
    caveats: [
      ...(input.caveats ?? []),
      ...(provisional ? [provisionalCaveat] : []),
      ...(synthetic ? ["Synthetic source note used only for deterministic testing; it is not evidence."] : [])
    ],
    gaps: []
  };
};

const readPolicy = async (): Promise<{
  policy: SynthesisProfilePolicy;
  outlets: OutletIdentityTable;
}> => {
  const policyValue: unknown = JSON.parse(
    await readFile(
      resolve("src/modules/synthesis/policies/geopolitical-synthesis-v1.json"),
      "utf8"
    )
  );
  const outletValue: unknown = JSON.parse(
    await readFile(
      resolve("src/modules/synthesis/policies/geopolitical-outlets-v1.json"),
      "utf8"
    )
  );
  const policy = validateSynthesisProfilePolicy(policyValue);
  const outlets = validateOutletIdentityTable(outletValue);
  if (!policy.ok || !outlets.ok) throw new Error("Invalid synthesis fixtures");
  return { policy: policy.value, outlets: outlets.value };
};

const bound = (source: SourceNote): BoundSourceNote => ({
  note: source,
  artifact: binding(source.id)
});

const envelope = async (sources: SourceNote[]) => {
  const { policy, outlets } = await readPolicy();
  const result = createSynthesisBuildEnvelope({
    sources: sources.map(bound),
    policy,
    policyArtifact: binding("synthesis-policy"),
    outletIdentityTable: outlets,
    outletIdentityArtifact: binding("outlet-table"),
    createdAt: "2026-09-03T09:00:00.000Z"
  });
  if (!result.ok) throw new Error(result.error);
  return { envelope: result.value, policy, outlets };
};

const proposal = (
  supportAliases: string[],
  kind: BuildClaimProposal["kind"] = "reported-fact"
): BuildClaimProposal => ({
  statement: "A synthetic event occurred.",
  kind,
  ...(kind === "statement" ? { attributedTo: "Synthetic source" } : {}),
  ...(kind.startsWith("analytic-")
    ? { analyticRationale: "Synthetic rationale for a bounded analytic judgment." }
    : {}),
  supportAliases,
  confidence: {
    level: "low",
    rationale: "The fixture uses a conservative level within the computed ceiling."
  }
});

test("validates provisional notes and rejects non-note artifacts", () => {
  const provisional = note({
    id: "note-provisional",
    host: "nv.ua",
    observations: [observation({ id: "obs-1" })],
    provisional: true
  });
  assert.equal(validateSynthesisSourceNote(provisional).ok, true);
  assert.deepEqual(validateSynthesisSourceNote({ schemaVersion: "source-assurance-review-package-v1" }), {
    ok: false,
    error: "INVALID_SOURCE_NOTE"
  });
});

test("provisional synthesis flags claims, limitations, and limited evidence", async () => {
  const provisional = note({
    id: "note-provisional",
    host: "nv.ua",
    observations: [observation({ id: "obs-provisional" })],
    provisional: true
  });
  const prepared = await envelope([provisional]);
  const built = buildExternalSynthesis({
    envelope: prepared.envelope,
    sources: [bound(provisional)],
    policy: prepared.policy,
    outletIdentityTable: prepared.outlets,
    proposals: [proposal(["n1-o01"])],
    createdAt: "2026-09-03T10:00:00.000Z"
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.value.reviewStatus, "provisional");
  assert.equal(built.value.claims[0]?.provisional, true);
  assert.equal(built.value.limitedEvidence, true);
  assert.ok(
    built.value.limitations.some((entry) =>
      entry.text.startsWith("Observations not reviewed by a human")
    )
  );
  assert.equal(built.value.claims[0]?.confidenceCeilingRuleId, "ceiling-one-limited-fact");
});

test("dependency is claim-scoped for mixed independent and shared-origin reporting", async () => {
  const alpha = note({
    id: "note-alpha",
    host: "alpha.example",
    observations: [
      observation({ id: "alpha-independent", irId: "ir-01" }),
      observation({ id: "alpha-nyt", attribution: "relayed", attributedTo: "NYT", irId: "ir-02" })
    ]
  });
  const beta = note({
    id: "note-beta",
    host: "beta.example",
    observations: [
      observation({ id: "beta-independent", irId: "ir-01" }),
      observation({ id: "beta-nyt", attribution: "relayed", attributedTo: "The New York Times", irId: "ir-02" })
    ]
  });
  const prepared = await envelope([alpha, beta]);
  const independent = prepared.envelope.observationRelationships.find(
    (entry) => entry.leftObservationId === "alpha-independent" && entry.rightObservationId === "beta-independent"
  );
  const shared = prepared.envelope.observationRelationships.find(
    (entry) => entry.leftObservationId === "alpha-nyt" && entry.rightObservationId === "beta-nyt"
  );
  assert.equal(independent?.relationship, "independent");
  assert.equal(shared?.relationship, "shared-origin");

  const built = buildExternalSynthesis({
    envelope: prepared.envelope,
    sources: [bound(alpha), bound(beta)],
    policy: prepared.policy,
    outletIdentityTable: prepared.outlets,
    proposals: [
      proposal(["n1-o01", "n2-o01"]),
      proposal(["n1-o02", "n2-o02"])
    ],
    createdAt: "2026-09-03T10:00:00.000Z"
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.value.claims[0]?.independentSourceCount, 2);
  assert.equal(built.value.claims[0]?.confidenceCeilingRuleId, "ceiling-two-established-fact");
  assert.equal(built.value.claims[1]?.independentSourceCount, 1);
  assert.equal(built.value.claims[1]?.confidenceCeilingRuleId, "ceiling-one-established-fact");
  assert.equal(built.value.sourceAppendix.length, 2);
});

test("derivative reporting recognizes a held upstream publisher", async () => {
  const origin = note({
    id: "note-origin",
    host: "nytimes.com",
    observations: [observation({ id: "origin-event" })]
  });
  const relay = note({
    id: "note-relay",
    host: "synthetic.example",
    observations: [observation({ id: "relay-event", attribution: "relayed", attributedTo: "NYT" })]
  });
  const prepared = await envelope([origin, relay]);
  assert.ok(prepared.envelope.observationRelationships.some((entry) => entry.relationship === "derivative"));
});

test("kind bounds test every observation row and reject statement-to-fact inflation", async () => {
  const cases = [
    { observationKind: "event" as const, claimKind: "reported-fact" as const },
    { observationKind: "statement" as const, claimKind: "statement" as const },
    { observationKind: "assessment" as const, claimKind: "analytic-assessment" as const },
    { observationKind: "forecast" as const, claimKind: "analytic-forecast" as const }
  ];
  for (const [index, entry] of cases.entries()) {
    const source = note({
      id: `note-kind-${index}`,
      host: "alpha.example",
      observations: [observation({ id: `obs-kind-${index}`, kind: entry.observationKind })]
    });
    const prepared = await envelope([source]);
    const built = buildExternalSynthesis({
      envelope: prepared.envelope,
      sources: [bound(source)],
      policy: prepared.policy,
      outletIdentityTable: prepared.outlets,
      proposals: [proposal(["n1-o01"], entry.claimKind)],
      createdAt: "2026-09-03T10:00:00.000Z"
    });
    assert.equal(built.ok, true);
  }
  const statementSource = note({
    id: "note-statement",
    host: "alpha.example",
    observations: [observation({ id: "obs-statement", kind: "statement" })]
  });
  const prepared = await envelope([statementSource]);
  assert.deepEqual(
    buildExternalSynthesis({
      envelope: prepared.envelope,
      sources: [bound(statementSource)],
      policy: prepared.policy,
      outletIdentityTable: prepared.outlets,
      proposals: [proposal(["n1-o01"], "reported-fact")],
      createdAt: "2026-09-03T10:00:00.000Z"
    }),
    { ok: false, error: "CLAIM_KIND_EXCEEDS_SUPPORT" }
  );
});

test("omission caveats force limited evidence without fabricating metrics", async () => {
  const source = note({
    id: "note-caveated",
    host: "alpha.example",
    observations: [observation({ id: "obs-caveated" })],
    caveats: [
      "No omission pass was performed: source coverage may be incomplete."
    ]
  });
  const prepared = await envelope([source]);
  assert.equal(prepared.envelope.limitedEvidence, true);
  assert.ok(prepared.envelope.limitations.some((entry) => entry.text.startsWith("No omission pass was performed")));
});

test("publication blocks provisional lineage and rebuilt envelopes carry supersession", async () => {
  const provisional = note({
    id: "note-provisional",
    host: "nv.ua",
    observations: [observation({ id: "obs-provisional" })],
    provisional: true
  });
  const reviewed = note({
    id: "note-reviewed",
    host: "nv.ua",
    observations: [observation({ id: "obs-reviewed" })],
    supersedesNoteId: provisional.id
  });
  assert.deepEqual(verifyPublicationEligibility([provisional]), {
    ok: false,
    error: "PROVISIONAL_SOURCE_LINEAGE"
  });
  assert.deepEqual(verifyPublicationEligibility([reviewed]), {
    ok: true,
    value: { status: "eligible" }
  });
  assert.equal(reviewed.supersedesNoteId, provisional.id);
  const prepared = await envelope([reviewed]);
  assert.deepEqual(prepared.envelope.supersedesNoteIds, [provisional.id]);
});

test("policy keeps unreached confidence cells visibly untested", async () => {
  const { policy } = await readPolicy();
  assert.equal(policy.confidenceCeilingRules.length, 20);
  assert.deepEqual(
    policy.confidenceCeilingRules
      .filter((entry) => entry.testStatus === "tested")
      .map((entry) => entry.id)
      .sort(),
    [
      "ceiling-one-established-fact",
      "ceiling-one-limited-fact",
      "ceiling-two-established-fact"
    ]
  );
});

test("synthetic notes can never produce a reviewed or publishable chain", async () => {
  const reviewed = note({
    id: "note-reviewed-real",
    host: "alpha.example",
    observations: [observation({ id: "obs-reviewed-real" })]
  });
  const synthetic = note({
    id: "note-synthetic",
    host: "synthetic.example",
    observations: [observation({ id: "obs-synthetic" })],
    synthetic: true
  });
  assert.equal(validateSynthesisSourceNote(synthetic).ok, true);
  const prepared = await envelope([reviewed, synthetic]);
  assert.equal(prepared.envelope.reviewStatus, "synthetic");
  assert.equal(prepared.envelope.limitedEvidence, true);
  assert.deepEqual(verifyPublicationEligibility([reviewed, synthetic]), {
    ok: false,
    error: "SYNTHETIC_SOURCE_LINEAGE"
  });
});

test("Build request uses qualified aliases and response rejects derived fields", async () => {
  const source = note({
    id: "note-request",
    host: "alpha.example",
    observations: [observation({ id: "obs-request" })],
    provisional: true
  });
  const prepared = await envelope([source]);
  const envelopeArtifact = binding("build-envelope");
  const request = createSynthesisBuildRequest({
    envelope: prepared.envelope,
    envelopeArtifact,
    sources: [bound(source)],
    policy: prepared.policy,
    preparedAt: "2026-09-03T09:30:00.000Z"
  });
  assert.equal(request.ok, true);
  if (!request.ok) return;
  assert.equal(validateSynthesisBuildRequest(request.value).ok, true);
  assert.equal(request.value.schemaVersion, "synthesis-build-request-v3");
  assert.equal(request.value.observations[0]?.alias, "n1-o01");
  assert.deepEqual(
    request.value.observations[0]?.singleSupportConfidenceCeilings,
    [
      {
        kind: "reported-fact",
        ceiling: "low",
        ruleId: "ceiling-one-limited-fact"
      }
    ]
  );
  assert.match(request.value.prompt.system, /Do not output IDs, dependencies/);
  const promptInput = JSON.parse(request.value.prompt.user) as {
    responseShapeText?: unknown;
    contentFreeStructuralExample?: unknown;
  };
  assert.equal(typeof promptInput.responseShapeText, "string");
  assert.equal(typeof promptInput.contentFreeStructuralExample, "object");
  assert.equal(parseBuildProposal(createBuildResponseStructuralExample()).ok, true);

  const legacyRequest = createSynthesisBuildRequest({
    envelope: prepared.envelope,
    envelopeArtifact,
    sources: [bound(source)],
    policy: prepared.policy,
    preparedAt: "2026-09-03T09:30:00.000Z",
    schemaVersion: LEGACY_BUILD_REQUEST_SCHEMA_VERSION
  });
  assert.equal(legacyRequest.ok, true);
  if (legacyRequest.ok) {
    assert.equal(validateSynthesisBuildRequest(legacyRequest.value).ok, true);
    assert.equal(
      legacyRequest.value.observations[0]?.singleSupportConfidenceCeilings,
      undefined
    );
    assert.equal(legacyRequest.value.authorisation, undefined);
  }
  const legacyV2Request = createSynthesisBuildRequest({
    envelope: prepared.envelope,
    envelopeArtifact,
    sources: [bound(source)],
    policy: prepared.policy,
    preparedAt: "2026-09-03T09:30:00.000Z",
    schemaVersion: LEGACY_BUILD_REQUEST_SCHEMA_VERSION_V2,
    authorisation: binding("legacy-v2-authorisation")
  });
  assert.equal(legacyV2Request.ok, true);
  if (legacyV2Request.ok) {
    assert.equal(validateSynthesisBuildRequest(legacyV2Request.value).ok, true);
    assert.ok(
      legacyV2Request.value.observations[0]?.singleSupportConfidenceCeilings
    );
    assert.deepEqual(
      legacyV2Request.value.authorisation,
      binding("legacy-v2-authorisation")
    );
  }

  const responseBase = {
    schemaVersion: "synthesis-build-copilot-response-v1",
    requestId: request.value.id,
    invocationId: "build-invocation-1",
    provider: "github-copilot-vscode",
    model: "not-exposed-by-host",
    startedAt: "2026-09-03T09:31:00.000Z",
    completedAt: "2026-09-03T09:31:01.000Z",
    freshSession: true,
    capturedBy: "TESTER",
    proposal: {
      claims: [proposal(["n1-o01"])]
    }
  };
  const recorded = recordSynthesisBuildResponse({
    request: request.value,
    requestArtifact: binding("build-request"),
    responseValue: responseBase,
    responseArtifact: binding("build-response"),
    envelope: prepared.envelope,
    envelopeArtifact,
    sources: [bound(source)],
    policy: prepared.policy,
    outletIdentityTable: prepared.outlets,
    recordedAt: "2026-09-03T09:32:00.000Z"
  });
  assert.equal(recorded.ok, true);
  if (recorded.ok) {
    assert.equal(recorded.value.synthesis.claims[0]?.provisional, true);
    assert.equal(recorded.value.synthesis.claims[0]?.synthetic, false);
    assert.equal(recorded.value.synthesis.limitedEvidence, true);
  }

  const withDerivedField = structuredClone(responseBase);
  Object.assign(withDerivedField.proposal.claims[0] ?? {}, {
    limitedEvidence: false
  });
  assert.deepEqual(
    recordSynthesisBuildResponse({
      request: request.value,
      requestArtifact: binding("build-request"),
      responseValue: withDerivedField,
      responseArtifact: binding("build-response-extra"),
      envelope: prepared.envelope,
      envelopeArtifact,
      sources: [bound(source)],
      policy: prepared.policy,
      outletIdentityTable: prepared.outlets,
      recordedAt: "2026-09-03T09:32:00.000Z"
    }),
    { ok: false, error: "INVALID_BUILD_RESPONSE" }
  );

  const inflated = structuredClone(responseBase);
  const inflatedClaim = inflated.proposal.claims[0];
  if (inflatedClaim) inflatedClaim.confidence.level = "high";
  assert.deepEqual(
    recordSynthesisBuildResponse({
      request: request.value,
      requestArtifact: binding("build-request"),
      responseValue: inflated,
      responseArtifact: binding("build-response-high"),
      envelope: prepared.envelope,
      envelopeArtifact,
      sources: [bound(source)],
      policy: prepared.policy,
      outletIdentityTable: prepared.outlets,
      recordedAt: "2026-09-03T09:32:00.000Z"
    }),
    { ok: false, error: "CONFIDENCE_EXCEEDS_CEILING" }
  );
});

test("synthetic support is explicit on every recorded claim", async () => {
  const synthetic = note({
    id: "note-request-synthetic",
    host: "synthetic.example",
    observations: [observation({ id: "obs-request-synthetic" })],
    synthetic: true
  });
  const prepared = await envelope([synthetic]);
  const built = buildExternalSynthesis({
    envelope: prepared.envelope,
    sources: [bound(synthetic)],
    policy: prepared.policy,
    outletIdentityTable: prepared.outlets,
    proposals: [proposal(["n1-o01"])],
    createdAt: "2026-09-03T10:00:00.000Z"
  });
  assert.equal(built.ok, true);
  if (!built.ok) return;
  assert.equal(built.value.reviewStatus, "synthetic");
  assert.equal(built.value.claims[0]?.provisional, true);
  assert.equal(built.value.claims[0]?.synthetic, true);
});

test("strict proposal aliases unwrap known containers and reject collisions", () => {
  const example = createBuildResponseStructuralExample() as {
    claims: unknown[];
  };
  assert.equal(parseBuildProposal(example.claims).ok, true);
  assert.equal(parseBuildProposal({ output: example.claims }).ok, true);
  assert.equal(parseBuildProposal({ result: { claims: example.claims } }).ok, true);

  const base = example.claims[0] as Record<string, unknown>;
  assert.deepEqual(
    parseBuildProposal([{ ...base, statement: "Conflicting alias." }]),
    { ok: false, error: "INVALID_BUILD_RESPONSE" }
  );
  assert.deepEqual(
    parseBuildProposal([{ ...base, limitedEvidence: false }]),
    { ok: false, error: "INVALID_BUILD_RESPONSE" }
  );
  assert.deepEqual(parseBuildProposal({ wrapper: example.claims }), {
    ok: false,
    error: "INVALID_BUILD_RESPONSE"
  });
});

const challengeFixture = async () => {
  const source = note({
    id: "note-challenge",
    host: "alpha.example",
    observations: [
      observation({ id: "obs-challenge-event", irId: "ir-01" }),
      observation({
        id: "obs-challenge-statement",
        kind: "statement",
        attribution: "attributed",
        attributedTo: "Synthetic official",
        irId: "ir-01"
      })
    ],
    provisional: true
  });
  const prepared = await envelope([source]);
  const synthesis = buildExternalSynthesis({
    envelope: prepared.envelope,
    sources: [bound(source)],
    policy: prepared.policy,
    outletIdentityTable: prepared.outlets,
    proposals: [
      proposal(["n1-o01"]),
      {
        ...proposal(["n1-o02"], "statement"),
        attributedTo: "Synthetic official"
      }
    ],
    createdAt: "2026-09-03T10:00:00.000Z"
  });
  if (!synthesis.ok) throw new Error(synthesis.error);
  const buildRecord = {
    schemaVersion: "synthesis-build-record-v1" as const,
    id: "build-record-challenge",
    recordedAt: "2026-09-03T10:01:00.000Z",
    runId: "run-1",
    reviewStatus: "provisional" as const,
    limitedEvidence: true,
    supersedesNoteIds: [],
    envelope: binding("challenge-envelope"),
    request: binding("challenge-build-request"),
    response: binding("challenge-build-response"),
    invocation: {
      id: "build-invocation-challenge",
      provider: "github-copilot-vscode" as const,
      model: "not-exposed-by-host" as const,
      startedAt: "2026-09-03T10:00:00.000Z",
      completedAt: "2026-09-03T10:00:30.000Z",
      freshSession: true as const,
      capturedBy: "TESTER"
    },
    synthesis: synthesis.value
  };
  const buildRecordArtifact = binding("build-record-challenge");
  const request = createChallengeRequest({
    buildRecord,
    buildRecordArtifact,
    envelope: prepared.envelope,
    sources: [bound(source)],
    preparedAt: "2026-09-03T10:02:00.000Z"
  });
  if (!request.ok) throw new Error(request.error);
  return {
    source,
    buildRecord,
    buildRecordArtifact,
    request: request.value
  };
};

const challengeResponse = (
  request: Awaited<ReturnType<typeof challengeFixture>>["request"],
  override?: (
    claimIndex: number,
    checkIndex: number,
    check: (typeof CHALLENGE_CHECKS)[number]
  ) => Record<string, unknown> | undefined
) => ({
  schemaVersion: "synthesis-challenge-copilot-response-v1",
  requestId: request.id,
  invocationId: "challenge-invocation-1",
  provider: "github-copilot-vscode",
  model: "not-exposed-by-host",
  startedAt: "2026-09-03T10:03:00.000Z",
  completedAt: "2026-09-03T10:03:30.000Z",
  freshSession: true,
  capturedBy: "TESTER",
  proposal: {
    claims: request.claims.map((claim, claimIndex) => ({
      claim: claim.claimAlias,
      checks: CHALLENGE_CHECKS.map((check, checkIndex) =>
        override?.(claimIndex, checkIndex, check) ?? {
          item: check,
          result: "none"
        }
      )
    }))
  }
});

test("Challenge packs all claims, hides Build rationale, and preselects IR overlap", async () => {
  const fixture = await challengeFixture();
  assert.equal(fixture.request.claims.length, 2);
  assert.equal(fixture.request.checklist.length, 6);
  assert.doesNotMatch(JSON.stringify(fixture.request.claims), /rationale/);
  assert.deepEqual(
    fixture.request.claims[0]?.contradictionCandidates.map((entry) => entry.alias),
    ["n1-o02"]
  );
  assert.deepEqual(
    fixture.request.claims[1]?.contradictionCandidates.map((entry) => entry.alias),
    ["n1-o01"]
  );
  assert.equal(parseChallengeProposal(createChallengeStructuralExample()).ok, true);
});

test("all-none Challenge is valid and records zero yield without retry", async () => {
  const fixture = await challengeFixture();
  const record = recordChallengeResponse({
    request: fixture.request,
    requestArtifact: binding("challenge-request"),
    responseValue: challengeResponse(fixture.request),
    responseArtifact: binding("challenge-response"),
    buildRecord: fixture.buildRecord,
    buildRecordArtifact: fixture.buildRecordArtifact,
    recordedAt: "2026-09-03T10:04:00.000Z"
  });
  assert.equal(record.ok, true);
  if (!record.ok) return;
  assert.equal(record.value.results.length, 12);
  assert.equal(record.value.metrics.challengesRaised, 0);
  assert.equal(record.value.metrics.challengeRate, 0);
  assert.equal(record.value.metrics.upheldOverRaised, null);
});

test("Challenge rejects missing matrix rows, new evidence, and unknown fields", async () => {
  const fixture = await challengeFixture();
  const missing = challengeResponse(fixture.request);
  missing.proposal.claims[0]?.checks.pop();
  assert.deepEqual(
    recordChallengeResponse({
      request: fixture.request,
      requestArtifact: binding("challenge-request"),
      responseValue: missing,
      responseArtifact: binding("challenge-response-missing"),
      buildRecord: fixture.buildRecord,
      buildRecordArtifact: fixture.buildRecordArtifact,
      recordedAt: "2026-09-03T10:04:00.000Z"
    }),
    { ok: false, error: "INVALID_CHALLENGE_COVERAGE" }
  );

  const unknownAlias = challengeResponse(fixture.request, (claimIndex, _index, check) =>
    claimIndex === 0 && check === "inference-beyond-cited-observations"
      ? {
          item: check,
          result: "challenge",
          reason: "The claim extends beyond its cited observation.",
          aliases: ["n9-o99"]
        }
      : undefined
  );
  assert.deepEqual(
    recordChallengeResponse({
      request: fixture.request,
      requestArtifact: binding("challenge-request"),
      responseValue: unknownAlias,
      responseArtifact: binding("challenge-response-alias"),
      buildRecord: fixture.buildRecord,
      buildRecordArtifact: fixture.buildRecordArtifact,
      recordedAt: "2026-09-03T10:04:00.000Z"
    }),
    { ok: false, error: "INVALID_CHALLENGE_ALIAS" }
  );

  const extra = challengeResponse(fixture.request);
  Object.assign(extra.proposal.claims[0]?.checks[0] ?? {}, { confidence: "lower" });
  assert.deepEqual(parseChallengeProposal(extra.proposal), {
    ok: false,
    error: "INVALID_CHALLENGE_RESPONSE"
  });
});

test("raised challenges remain open and contested when adjudication is absent", async () => {
  const fixture = await challengeFixture();
  const response = challengeResponse(fixture.request, (claimIndex, _index, check) => {
    if (claimIndex !== 0 || check !== "plausible-alternative") return undefined;
    return {
      item: check,
      result: "challenge",
      reason: "A less consequential explanation remains possible.",
      aliases: ["n1-o01"],
      hypothesis: "The event may reflect routine activity rather than escalation."
    };
  });
  const record = recordChallengeResponse({
    request: fixture.request,
    requestArtifact: binding("challenge-request"),
    responseValue: response,
    responseArtifact: binding("challenge-response-open"),
    buildRecord: fixture.buildRecord,
    buildRecordArtifact: fixture.buildRecordArtifact,
    recordedAt: "2026-09-03T10:04:00.000Z"
  });
  assert.equal(record.ok, true);
  if (!record.ok) return;
  assert.equal(record.value.metrics.challengesRaised, 1);
  const alternative = record.value.results.find(
    (entry) => entry.check === "plausible-alternative" && entry.verdict === "challenge"
  );
  assert.deepEqual(alternative?.alternativeHypothesis?.status, "hypothesis");
  const adjudication = createProvisionalAdjudication({
    buildRecord: fixture.buildRecord,
    buildRecordArtifact: fixture.buildRecordArtifact,
    challengeRecord: record.value,
    challengeRecordArtifact: binding("challenge-record"),
    createdAt: "2026-09-03T10:05:00.000Z"
  });
  assert.equal(adjudication.ok, true);
  if (!adjudication.ok) return;
  assert.equal(adjudication.value.adjudicationStatus, "not-performed");
  assert.equal(adjudication.value.claims[0]?.status, "contested");
  assert.equal(adjudication.value.claims[1]?.status, "proposed");
  assert.equal(adjudication.value.openChallengeIds.length, 1);
});

test("Challenge strictly normalizes the authorized null-or-object form", () => {
  const proposal = [
    {
      claimAlias: "c01",
      results: CHALLENGE_CHECKS.map((check) =>
        check === "plausible-alternative"
          ? {
              check,
              challenge: {
                reason: "A bounded alternative remains plausible.",
                aliases: ["n1-o01"],
                hypothesis: "The event may have a routine explanation."
              }
            }
          : { check, challenge: null }
      )
    }
  ];
  const parsed = parseChallengeProposal(proposal);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.value[0]?.checks.length, 6);
  assert.deepEqual(
    parsed.value[0]?.checks.find((entry) => entry.check === "plausible-alternative")
      ?.alternativeHypothesis,
    { status: "hypothesis", text: "The event may have a routine explanation." }
  );

  const unknown = structuredClone(proposal);
  const challenge = unknown[0]?.results[3]?.challenge;
  if (challenge) Object.assign(challenge, { confidence: "lower" });
  assert.deepEqual(parseChallengeProposal(unknown), {
    ok: false,
    error: "INVALID_CHALLENGE_RESPONSE"
  });
});

const writerFixture = async () => {
  const challenge = await challengeFixture();
  const challengedResponse = challengeResponse(
    challenge.request,
    (claimIndex, _checkIndex, check) => {
      if (check === "hidden-single-source-dependence") {
        return {
          item: check,
          result: "challenge",
          reason: "Single-source dependence remains open.",
          aliases: [`n1-o0${claimIndex + 1}`]
        };
      }
      if (claimIndex === 0 && check === "plausible-alternative") {
        return {
          item: check,
          result: "challenge",
          reason: "A routine explanation remains plausible.",
          aliases: ["n1-o01"],
          hypothesis: "The event may reflect routine activity."
        };
      }
      return undefined;
    }
  );
  const challengeRecord = recordChallengeResponse({
    request: challenge.request,
    requestArtifact: binding("writer-challenge-request"),
    responseValue: challengedResponse,
    responseArtifact: binding("writer-challenge-response"),
    buildRecord: challenge.buildRecord,
    buildRecordArtifact: challenge.buildRecordArtifact,
    recordedAt: "2026-09-03T10:04:00.000Z"
  });
  if (!challengeRecord.ok) throw new Error(challengeRecord.error);
  const adjudication = createProvisionalAdjudication({
    buildRecord: challenge.buildRecord,
    buildRecordArtifact: challenge.buildRecordArtifact,
    challengeRecord: challengeRecord.value,
    challengeRecordArtifact: binding("writer-challenge-record"),
    createdAt: "2026-09-03T10:05:00.000Z"
  });
  if (!adjudication.ok) throw new Error(adjudication.error);
  const standardValue: unknown = JSON.parse(
    await readFile(resolve("src/modules/memo/standards/memo-standard-v0.json"), "utf8")
  );
  const standard = validateMemoStandardV0(standardValue);
  if (!standard.ok) throw new Error(standard.error);
  const buildRecord: SynthesisBuildRecord = {
    ...structuredClone(challenge.buildRecord),
    reviewStatus: "synthetic",
    synthesis: {
      ...structuredClone(challenge.buildRecord.synthesis),
      reviewStatus: "synthetic"
    }
  };
  buildRecord.synthesis.questionCoverage.push({
    irId: "ir-06",
    disposition: "silent",
    sourceNoteIds: ["note-challenge"],
    observationIds: [],
    provisional: true
  });
  buildRecord.synthesis.intelligenceGaps.push("ir-06");
  const question = {
    id: "rq-writer",
    runId: "run-1",
    scopeVersion: 1,
    question: "What happened and why does it matter?",
    rationale: "Synthetic writer fixture.",
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
  const request = createWriterRequest({
    buildRecord,
    buildRecordArtifact: challenge.buildRecordArtifact,
    challengeRecord: challengeRecord.value,
    challengeRecordArtifact: binding("writer-challenge-record"),
    adjudication: adjudication.value,
    adjudicationArtifact: binding("writer-adjudication"),
    question,
    questionArtifact: binding("writer-question"),
    standard: standard.value,
    standardArtifact: binding("writer-standard"),
    preparedAt: "2026-09-03T10:06:00.000Z"
  });
  if (!request.ok) throw new Error(request.error);
  return {
    buildRecord,
    challengeRecord: challengeRecord.value,
    adjudication: adjudication.value,
    question,
    standard: standard.value as MemoStandardV0,
    request: request.value
  };
};

const writerResponse = (
  request: Awaited<ReturnType<typeof writerFixture>>["request"],
  text = "The picture remains provisional and contested."
) => ({
  schemaVersion: "memo-writer-copilot-response-v1",
  requestId: request.id,
  invocationId: "writer-invocation-1",
  provider: "github-copilot-vscode",
  model: "not-exposed-by-host",
  startedAt: "2026-09-03T10:07:00.000Z",
  completedAt: "2026-09-03T10:07:30.000Z",
  freshSession: true,
  capturedBy: "TESTER",
  proposal: {
    statements: [
      {
        section: "bluf",
        text,
        claims: request.claims.map((claim) => claim.alias)
      },
      ...request.claims.map((claim) => ({
        section: "key-judgments",
        text: `Provisional judgment for ${claim.alias}.`,
        claims: [claim.alias]
      }))
    ]
  }
});

test("writer derives contested status, alternatives, gaps, sourcing, and blockers", async () => {
  const fixture = await writerFixture();
  assert.equal(fixture.request.approvedScope, null);
  assert.equal(fixture.request.requiredAlternativeCount, 1);
  assert.deepEqual(fixture.request.requiredGaps, [
    { irId: "ir-06", disposition: "silent" }
  ]);
  const record = recordWriterResponse({
    request: fixture.request,
    requestArtifact: binding("writer-request"),
    responseValue: writerResponse(fixture.request),
    responseArtifact: binding("writer-response"),
    buildRecord: fixture.buildRecord,
    challengeRecord: fixture.challengeRecord,
    adjudication: fixture.adjudication,
    question: fixture.question,
    standard: fixture.standard,
    recordedAt: "2026-09-03T10:08:00.000Z"
  });
  assert.equal(record.ok, true);
  if (!record.ok) return;
  assert.ok(record.value.memo.keyJudgments.every((entry) => entry.confidence.level === "low"));
  assert.ok(record.value.memo.keyJudgments.every((entry) => entry.statement.status === "contested"));
  assert.equal(record.value.memo.competingExplanations.length, 1);
  assert.deepEqual(record.value.memo.gaps, [{ irId: "ir-06", disposition: "silent" }]);
  assert.equal(record.value.memo.sourcingSummary.claimBearingSourceCount, 1);
  assert.equal(record.value.memo.sourcingSummary.singleSourceDependent, true);
  assert.match(
    record.value.memo.bluf[0]?.text ?? "",
    /two contested low-confidence claims, one competing explanation, and one silent information requirement/
  );
  assert.ok(record.value.memo.publicationBlockers.includes("SYNTHETIC_SOURCE_LINEAGE"));
  assert.ok(record.value.memo.publicationBlockers.includes("PROVISIONAL_SOURCE_LINEAGE"));
  assert.ok(record.value.memo.publicationBlockers.includes("ADJUDICATION_NOT_PERFORMED"));
    assert.ok(
      record.value.memo.limitations.includes(
        "support check: model-only, unvalidated"
      )
    );
  assert.equal(record.value.verification.contentVerdict, "pass");
  assert.equal(record.value.verification.publicationVerdict, "block");
  const markdown = renderMemoMarkdown(record.value.memo);
  assert.match(markdown, /NOT FOR PUBLICATION/);
  assert.match(markdown, /\*\*Hypothesis:\*\*/);
  assert.match(markdown, /ir-06: silent/);
});

test("writer rejects missing claim judgments and prohibited confidence inflation", async () => {
  const fixture = await writerFixture();
  const missing = writerResponse(fixture.request);
  missing.proposal.statements.pop();
  assert.deepEqual(
    recordWriterResponse({
      request: fixture.request,
      requestArtifact: binding("writer-request"),
      responseValue: missing,
      responseArtifact: binding("writer-response-missing"),
      buildRecord: fixture.buildRecord,
      challengeRecord: fixture.challengeRecord,
      adjudication: fixture.adjudication,
      question: fixture.question,
      standard: fixture.standard,
      recordedAt: "2026-09-03T10:08:00.000Z"
    }),
    { ok: false, error: "INVALID_WRITER_COVERAGE" }
  );
  const inflated = writerResponse(
    fixture.request,
    "High confidence reporting independently confirmed the claims."
  );
  assert.deepEqual(
    recordWriterResponse({
      request: fixture.request,
      requestArtifact: binding("writer-request"),
      responseValue: inflated,
      responseArtifact: binding("writer-response-inflated"),
      buildRecord: fixture.buildRecord,
      challengeRecord: fixture.challengeRecord,
      adjudication: fixture.adjudication,
      question: fixture.question,
      standard: fixture.standard,
      recordedAt: "2026-09-03T10:08:00.000Z"
    }),
    { ok: false, error: "PROHIBITED_MEMO_PATTERN" }
  );
});