import { err, ok, type Result } from "../../core/result.js";
import type { ArtifactBinding } from "../assurance/types.js";
import {
  canonicalJson,
  hasOnlyKeys,
  isRecord,
  nonEmptyString,
  readArtifactBinding,
  sha256Text,
  validTime
} from "../assurance/validators.js";
import type { ChallengeRecord } from "./challenge.js";
import {
  computeKeyJudgementEligibility,
  parseKeyJudgementProposal,
  renderEligibilityForPrompt,
  validateKeyJudgementProposal,
  type ClaimAliasMap,
  type ClaimForSelection,
  type EligibilityError,
  type KeyJudgementError,
  type KeyJudgementPolicy,
  type KeyJudgementSelection
} from "./key-judgements.js";
import { unwrapStrictObject } from "./proposal.js";
import type { SynthesisBuildRecord } from "./types.js";

export const PERFORMED_ADJUDICATION_SCHEMA_VERSION =
  "synthesis-adjudication-v1" as const;
export const KEY_JUDGEMENT_REQUEST_SCHEMA_VERSION =
  "key-judgement-request-v1" as const;
export const KEY_JUDGEMENT_RESPONSE_SCHEMA_VERSION =
  "key-judgement-copilot-response-v1" as const;
export const KEY_JUDGEMENT_RECORD_SCHEMA_VERSION =
  "key-judgement-record-v1" as const;
export const KEY_JUDGEMENT_PROVIDER = "github-copilot-vscode" as const;
export const KEY_JUDGEMENT_MODEL = "not-exposed-by-host" as const;

export type PerformedAdjudication = {
  schemaVersion: typeof PERFORMED_ADJUDICATION_SCHEMA_VERSION;
  id: string;
  createdAt: string;
  runId: string;
  adjudicationStatus: "performed";
  reviewStatus: SynthesisBuildRecord["reviewStatus"];
  limitedEvidence: boolean;
  buildRecord: ArtifactBinding;
  challengeRecord: ArtifactBinding;
  claims: Array<{
    claimId: string;
    status: "accepted" | "contested" | "rejected";
    openChallengeIds: string[];
  }>;
};

export type KeyJudgementRequest = {
  schemaVersion: typeof KEY_JUDGEMENT_REQUEST_SCHEMA_VERSION;
  id: string;
  preparedAt: string;
  runId: string;
  stage: "key-judgement-selection";
  provider: typeof KEY_JUDGEMENT_PROVIDER;
  model: typeof KEY_JUDGEMENT_MODEL;
  reviewStatus: SynthesisBuildRecord["reviewStatus"];
  limitedEvidence: boolean;
  buildRecord: ArtifactBinding;
  challengeRecord: ArtifactBinding;
  adjudication: ArtifactBinding;
  memoStandard: ArtifactBinding;
  policy: KeyJudgementPolicy;
  claims: Array<{
    alias: string;
    statement: string;
    kind: SynthesisBuildRecord["synthesis"]["claims"][number]["kind"];
  }>;
  eligibility: {
    requirementIds: string[];
    eligibleAliasesByRequirement: Record<string, string[]>;
    requirementsWithoutEligibleClaim: string[];
  };
  prompt: { system: string; user: string };
};

export type KeyJudgementRecord = {
  schemaVersion: typeof KEY_JUDGEMENT_RECORD_SCHEMA_VERSION;
  id: string;
  recordedAt: string;
  runId: string;
  reviewStatus: SynthesisBuildRecord["reviewStatus"];
  limitedEvidence: boolean;
  buildRecord: ArtifactBinding;
  challengeRecord: ArtifactBinding;
  adjudication: ArtifactBinding;
  memoStandard: ArtifactBinding;
  request: ArtifactBinding;
  response: ArtifactBinding;
  invocation: {
    id: string;
    provider: typeof KEY_JUDGEMENT_PROVIDER;
    model: typeof KEY_JUDGEMENT_MODEL;
    startedAt: string;
    completedAt: string;
    freshSession: true;
    capturedBy: string;
  };
  selection: KeyJudgementSelection;
};

export type KeyJudgementStageError =
  | EligibilityError
  | KeyJudgementError
  | { code: "INVALID_ADJUDICATION" }
  | { code: "KEY_JUDGEMENT_INPUT_MISMATCH" }
  | { code: "CLAIM_CONFIDENCE_NOT_SELECTABLE"; claimIds: string[] }
  | { code: "INVALID_CLAIM_ALIAS_MAP" }
  | { code: "INVALID_KEY_JUDGEMENT_REQUEST" }
  | { code: "INVALID_KEY_JUDGEMENT_RESPONSE" }
  | { code: "INVALID_INVOCATION_CHRONOLOGY" }
  | { code: "FRESH_SESSION_NOT_ATTESTED" }
  | { code: "INVALID_ARTIFACT_BINDING" };

const sameBinding = (left: ArtifactBinding, right: ArtifactBinding): boolean =>
  left.artifactRef === right.artifactRef &&
  left.artifactSha256 === right.artifactSha256;

const validReviewStatus = (
  value: unknown
): value is SynthesisBuildRecord["reviewStatus"] =>
  value === "reviewed" || value === "provisional" || value === "synthetic";

export const validatePerformedAdjudication = (
  value: unknown
): Result<PerformedAdjudication, KeyJudgementStageError> => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "schemaVersion",
      "id",
      "createdAt",
      "runId",
      "adjudicationStatus",
      "reviewStatus",
      "limitedEvidence",
      "buildRecord",
      "challengeRecord",
      "claims"
    ]) ||
    value.schemaVersion !== PERFORMED_ADJUDICATION_SCHEMA_VERSION ||
    !nonEmptyString(value.id) ||
    !validTime(value.createdAt) ||
    !nonEmptyString(value.runId) ||
    value.adjudicationStatus !== "performed" ||
    !validReviewStatus(value.reviewStatus) ||
    typeof value.limitedEvidence !== "boolean" ||
    !readArtifactBinding(value.buildRecord) ||
    !readArtifactBinding(value.challengeRecord) ||
    !Array.isArray(value.claims)
  ) {
    return err({ code: "INVALID_ADJUDICATION" });
  }
  const validClaims = value.claims.every(
    (claim) =>
      isRecord(claim) &&
      hasOnlyKeys(claim, ["claimId", "status", "openChallengeIds"]) &&
      Boolean(nonEmptyString(claim.claimId)) &&
      (claim.status === "accepted" ||
        claim.status === "contested" ||
        claim.status === "rejected") &&
      Array.isArray(claim.openChallengeIds) &&
      claim.openChallengeIds.every((id) => Boolean(nonEmptyString(id))) &&
      new Set(claim.openChallengeIds).size === claim.openChallengeIds.length
  );
  const claimIds = value.claims.flatMap((claim) =>
    isRecord(claim) && typeof claim.claimId === "string" ? [claim.claimId] : []
  );
  if (!validClaims || new Set(claimIds).size !== claimIds.length) {
    return err({ code: "INVALID_ADJUDICATION" });
  }
  return ok(value as PerformedAdjudication);
};

export const projectClaimsForKeyJudgementSelection = (
  buildRecord: SynthesisBuildRecord,
  adjudication: PerformedAdjudication
): Result<ClaimForSelection[], KeyJudgementStageError> => {
  if (
    buildRecord.runId !== adjudication.runId ||
    buildRecord.reviewStatus !== adjudication.reviewStatus ||
    buildRecord.limitedEvidence !== adjudication.limitedEvidence
  ) {
    return err({ code: "KEY_JUDGEMENT_INPUT_MISMATCH" });
  }
  const adjudicationByClaim = new Map(
    adjudication.claims.map((claim) => [claim.claimId, claim] as const)
  );
  const buildClaimIds = buildRecord.synthesis.claims.map((claim) => claim.id);
  if (
    buildClaimIds.length !== adjudication.claims.length ||
    buildClaimIds.some((claimId) => !adjudicationByClaim.has(claimId))
  ) {
    return err({ code: "KEY_JUDGEMENT_INPUT_MISMATCH" });
  }
  const unknownConfidence = buildRecord.synthesis.claims
    .filter(
      (claim) =>
        claim.confidence.level === "unknown" ||
        claim.confidenceCeiling === "unknown"
    )
    .map((claim) => claim.id)
    .sort();
  if (unknownConfidence.length > 0) {
    return err({
      code: "CLAIM_CONFIDENCE_NOT_SELECTABLE",
      claimIds: unknownConfidence
    });
  }
  return ok(
    buildRecord.synthesis.claims.map((claim) => {
      const decided = adjudicationByClaim.get(claim.id)!;
      const supportedObservations = new Set(claim.supportingObservationIds);
      return {
        claimId: claim.id,
        requirementIds: buildRecord.synthesis.questionCoverage
          .filter((coverage) =>
            coverage.observationIds.some((observationId) =>
              supportedObservations.has(observationId)
            )
          )
          .map((coverage) => coverage.irId),
        status: decided.status,
        confidence: claim.confidence.level as ClaimForSelection["confidence"],
        ceiling: claim.confidenceCeiling as ClaimForSelection["ceiling"],
        provisional: claim.provisional,
        openChallengeIds: [...decided.openChallengeIds]
      };
    })
  );
};

export const claimAliasesFromChallenge = (
  buildRecord: SynthesisBuildRecord,
  challengeRecord: ChallengeRecord
): Result<ClaimAliasMap, KeyJudgementStageError> => {
  const aliases: ClaimAliasMap = {};
  const claimByAlias = new Map<string, string>();
  const aliasByClaim = new Map<string, string>();
  for (const result of challengeRecord.results) {
    const existingClaim = claimByAlias.get(result.claimAlias);
    const existingAlias = aliasByClaim.get(result.claimId);
    if (
      (existingClaim && existingClaim !== result.claimId) ||
      (existingAlias && existingAlias !== result.claimAlias)
    ) {
      return err({ code: "INVALID_CLAIM_ALIAS_MAP" });
    }
    claimByAlias.set(result.claimAlias, result.claimId);
    aliasByClaim.set(result.claimId, result.claimAlias);
    aliases[result.claimAlias] = result.claimId;
  }
  if (
    buildRecord.synthesis.claims.some(
      (claim) => !aliasByClaim.has(claim.id)
    ) ||
    [...aliasByClaim.keys()].some(
      (claimId) =>
        !buildRecord.synthesis.claims.some((claim) => claim.id === claimId)
    )
  ) {
    return err({ code: "INVALID_CLAIM_ALIAS_MAP" });
  }
  return ok(aliases);
};

const createPrompt = (input: {
  claims: KeyJudgementRequest["claims"];
  eligibilityText: string;
  policy: KeyJudgementPolicy;
}): KeyJudgementRequest["prompt"] => ({
  system: [
    "Select bounded key judgements from the eligible claim aliases.",
    "Choose only aliases listed for the corresponding information requirement.",
    "For every requirement with eligible claims, return one selection or one explicit omission.",
    "Word each selected judgement concisely without adding facts beyond its claim.",
    "Return exactly selections and omissions. Do not return confidence, status, challenge ids, claim ids, or rationale fields outside omission reasons."
  ].join("\n"),
  user: JSON.stringify(
    {
      task: "Select and word the bounded key judgements.",
      eligibility: input.eligibilityText,
      claims: input.claims,
      responseShape: {
        selections: [
          {
            requirementId: "<approved IR id>",
            claim: "<eligible alias>",
            judgementText: `<at most ${input.policy.judgementTextMaxChars} characters>`
          }
        ],
        omissions: [
          {
            requirementId: "<approved IR id with eligible claims>",
            reason: "<why no key judgement is selected>"
          }
        ]
      }
    },
    null,
    2
  )
});

export const createKeyJudgementRequest = (input: {
  buildRecord: SynthesisBuildRecord;
  buildRecordArtifact: ArtifactBinding;
  challengeRecord: ChallengeRecord;
  challengeRecordArtifact: ArtifactBinding;
  adjudication: PerformedAdjudication;
  adjudicationArtifact: ArtifactBinding;
  memoStandardArtifact: ArtifactBinding;
  policy: KeyJudgementPolicy;
  preparedAt: string;
}): Result<KeyJudgementRequest, KeyJudgementStageError> => {
  const preparedAt = validTime(input.preparedAt);
  const bindings = [
    input.buildRecordArtifact,
    input.challengeRecordArtifact,
    input.adjudicationArtifact,
    input.memoStandardArtifact
  ].map(readArtifactBinding);
  if (!preparedAt || bindings.some((binding) => !binding)) {
    return err({ code: "INVALID_ARTIFACT_BINDING" });
  }
  if (
    input.buildRecord.runId !== input.challengeRecord.runId ||
    !sameBinding(input.adjudication.buildRecord, bindings[0]!) ||
    !sameBinding(input.adjudication.challengeRecord, bindings[1]!)
  ) {
    return err({ code: "KEY_JUDGEMENT_INPUT_MISMATCH" });
  }
  const projected = projectClaimsForKeyJudgementSelection(
    input.buildRecord,
    input.adjudication
  );
  if (!projected.ok) return projected;
  const requirementIds = input.buildRecord.synthesis.questionCoverage.map(
    (coverage) => coverage.irId
  );
  const eligibility = computeKeyJudgementEligibility(
    projected.value,
    requirementIds,
    input.policy
  );
  if (!eligibility.ok) return eligibility;
  const aliases = claimAliasesFromChallenge(
    input.buildRecord,
    input.challengeRecord
  );
  if (!aliases.ok) return aliases;
  const aliasesByClaimId = Object.fromEntries(
    Object.entries(aliases.value).map(([alias, claimId]) => [claimId, alias])
  );
  const eligibleClaimIds = new Set(
    Object.values(eligibility.value.eligibleByRequirement).flat()
  );
  const claims = input.buildRecord.synthesis.claims
    .filter((claim) => eligibleClaimIds.has(claim.id))
    .map((claim) => ({
      alias: aliasesByClaimId[claim.id]!,
      statement: claim.statement,
      kind: claim.kind
    }))
    .sort((left, right) => left.alias.localeCompare(right.alias));
  const eligibleAliasesByRequirement = Object.fromEntries(
    Object.entries(eligibility.value.eligibleByRequirement).map(
      ([requirementId, claimIds]) => [
        requirementId,
        claimIds.map((claimId) => aliasesByClaimId[claimId]!)
      ]
    )
  );
  const policy = { ...input.policy };
  const eligibilityText = renderEligibilityForPrompt(
    eligibility.value,
    aliasesByClaimId,
    policy
  );
  const body = {
    preparedAt,
    runId: input.buildRecord.runId,
    stage: "key-judgement-selection" as const,
    provider: KEY_JUDGEMENT_PROVIDER,
    model: KEY_JUDGEMENT_MODEL,
    reviewStatus: input.buildRecord.reviewStatus,
    limitedEvidence: input.buildRecord.limitedEvidence,
    buildRecord: bindings[0]!,
    challengeRecord: bindings[1]!,
    adjudication: bindings[2]!,
    memoStandard: bindings[3]!,
    policy,
    claims,
    eligibility: {
      requirementIds: eligibility.value.requirementIds,
      eligibleAliasesByRequirement,
      requirementsWithoutEligibleClaim:
        eligibility.value.requirementsWithoutEligibleClaim
    }
  };
  return ok({
    schemaVersion: KEY_JUDGEMENT_REQUEST_SCHEMA_VERSION,
    id: `key-judgement-request-${sha256Text(canonicalJson(body)).slice(0, 32)}`,
    ...body,
    prompt: createPrompt({ claims, eligibilityText, policy })
  });
};

export const validateKeyJudgementRequest = (
  value: unknown
): Result<KeyJudgementRequest, KeyJudgementStageError> => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== KEY_JUDGEMENT_REQUEST_SCHEMA_VERSION ||
    !nonEmptyString(value.id) ||
    !validTime(value.preparedAt) ||
    !nonEmptyString(value.runId) ||
    value.stage !== "key-judgement-selection" ||
    value.provider !== KEY_JUDGEMENT_PROVIDER ||
    value.model !== KEY_JUDGEMENT_MODEL ||
    !validReviewStatus(value.reviewStatus) ||
    typeof value.limitedEvidence !== "boolean" ||
    !readArtifactBinding(value.buildRecord) ||
    !readArtifactBinding(value.challengeRecord) ||
    !readArtifactBinding(value.adjudication) ||
    !readArtifactBinding(value.memoStandard) ||
    !isRecord(value.policy) ||
    !Array.isArray(value.claims) ||
    !isRecord(value.eligibility) ||
    !isRecord(value.prompt)
  ) {
    return err({ code: "INVALID_KEY_JUDGEMENT_REQUEST" });
  }
  return ok(value as KeyJudgementRequest);
};

export const validateKeyJudgementRecord = (
  value: unknown
): Result<KeyJudgementRecord, KeyJudgementStageError> => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== KEY_JUDGEMENT_RECORD_SCHEMA_VERSION ||
    !nonEmptyString(value.id) ||
    !validTime(value.recordedAt) ||
    !nonEmptyString(value.runId) ||
    !validReviewStatus(value.reviewStatus) ||
    typeof value.limitedEvidence !== "boolean" ||
    !readArtifactBinding(value.buildRecord) ||
    !readArtifactBinding(value.challengeRecord) ||
    !readArtifactBinding(value.adjudication) ||
    !readArtifactBinding(value.memoStandard) ||
    !readArtifactBinding(value.request) ||
    !readArtifactBinding(value.response) ||
    !isRecord(value.invocation) ||
    !isRecord(value.selection)
  ) {
    return err({ code: "INVALID_KEY_JUDGEMENT_RESPONSE" });
  }
  return ok(value as KeyJudgementRecord);
};

export const recordKeyJudgementResponse = (input: {
  request: KeyJudgementRequest;
  requestArtifact: ArtifactBinding;
  responseValue: unknown;
  responseArtifact: ArtifactBinding;
  buildRecord: SynthesisBuildRecord;
  challengeRecord: ChallengeRecord;
  adjudication: PerformedAdjudication;
  policy: KeyJudgementPolicy;
  recordedAt: string;
}): Result<KeyJudgementRecord, KeyJudgementStageError> => {
  const recordedAt = validTime(input.recordedAt);
  const requestArtifact = readArtifactBinding(input.requestArtifact);
  const responseArtifact = readArtifactBinding(input.responseArtifact);
  if (!recordedAt || !requestArtifact || !responseArtifact) {
    return err({ code: "INVALID_ARTIFACT_BINDING" });
  }
  if (
    !isRecord(input.responseValue) ||
    !hasOnlyKeys(input.responseValue, [
      "schemaVersion",
      "requestId",
      "invocationId",
      "provider",
      "model",
      "startedAt",
      "completedAt",
      "freshSession",
      "capturedBy",
      "proposal"
    ]) ||
    input.responseValue.schemaVersion !==
      KEY_JUDGEMENT_RESPONSE_SCHEMA_VERSION ||
    input.responseValue.requestId !== input.request.id ||
    input.responseValue.provider !== KEY_JUDGEMENT_PROVIDER ||
    input.responseValue.model !== KEY_JUDGEMENT_MODEL
  ) {
    return err({ code: "INVALID_KEY_JUDGEMENT_RESPONSE" });
  }
  if (input.responseValue.freshSession !== true) {
    return err({ code: "FRESH_SESSION_NOT_ATTESTED" });
  }
  const invocationId = nonEmptyString(input.responseValue.invocationId);
  const startedAt = validTime(input.responseValue.startedAt);
  const completedAt = validTime(input.responseValue.completedAt);
  const capturedBy = nonEmptyString(input.responseValue.capturedBy);
  if (!invocationId || !startedAt || !completedAt || !capturedBy) {
    return err({ code: "INVALID_KEY_JUDGEMENT_RESPONSE" });
  }
  if (
    Date.parse(startedAt) < Date.parse(input.request.preparedAt) ||
    Date.parse(startedAt) > Date.parse(completedAt)
  ) {
    return err({ code: "INVALID_INVOCATION_CHRONOLOGY" });
  }
  const projected = projectClaimsForKeyJudgementSelection(
    input.buildRecord,
    input.adjudication
  );
  if (!projected.ok) return projected;
  const eligibility = computeKeyJudgementEligibility(
    projected.value,
    input.buildRecord.synthesis.questionCoverage.map((entry) => entry.irId),
    input.policy
  );
  if (!eligibility.ok) return eligibility;
  const aliases = claimAliasesFromChallenge(
    input.buildRecord,
    input.challengeRecord
  );
  if (!aliases.ok) return aliases;
  const unwrapped = unwrapStrictObject(input.responseValue.proposal, [
    "keyJudgements",
    "output",
    "result"
  ]);
  const proposal = parseKeyJudgementProposal(unwrapped);
  if (!proposal.ok) return proposal;
  const selection = validateKeyJudgementProposal(
    proposal.value,
    aliases.value,
    projected.value,
    eligibility.value,
    input.policy
  );
  if (!selection.ok) return selection;
  const body = {
    recordedAt,
    runId: input.request.runId,
    reviewStatus: input.request.reviewStatus,
    limitedEvidence: input.request.limitedEvidence,
    buildRecord: input.request.buildRecord,
    challengeRecord: input.request.challengeRecord,
    adjudication: input.request.adjudication,
    memoStandard: input.request.memoStandard,
    request: requestArtifact,
    response: responseArtifact,
    invocation: {
      id: invocationId,
      provider: KEY_JUDGEMENT_PROVIDER,
      model: KEY_JUDGEMENT_MODEL,
      startedAt,
      completedAt,
      freshSession: true as const,
      capturedBy
    },
    selection: selection.value
  };
  return ok({
    schemaVersion: KEY_JUDGEMENT_RECORD_SCHEMA_VERSION,
    id: `key-judgement-record-${sha256Text(canonicalJson(body)).slice(0, 32)}`,
    ...body
  });
};