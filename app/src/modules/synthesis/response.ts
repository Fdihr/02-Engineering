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
import { buildExternalSynthesis } from "./build.js";
import { parseBuildProposal } from "./proposal.js";
import type {
  BoundSourceNote,
  BuildClaimProposal,
  OutletIdentityTable,
  SynthesisBuildEnvelope,
  SynthesisBuildRecord,
  SynthesisBuildRequest,
  SynthesisProfilePolicy
} from "./types.js";
import {
  BUILD_MODEL,
  BUILD_PROVIDER,
  BUILD_RECORD_SCHEMA_VERSION,
  BUILD_RESPONSE_SCHEMA_VERSION
} from "./types.js";

export type BuildResponseError =
  | "INVALID_BUILD_RESPONSE"
  | "BUILD_REQUEST_MISMATCH"
  | "INVALID_INVOCATION_CHRONOLOGY"
  | "FRESH_SESSION_NOT_ATTESTED"
  | "INVALID_ARTIFACT_BINDING"
  | "INVALID_CLAIM_PROPOSAL"
  | "INVALID_BUILD_TIME"
  | "INVALID_BUILD_ENVELOPE"
  | "SOURCE_NOTE_RUN_MISMATCH"
  | "POLICY_OUTLET_MISMATCH"
  | "CLAIM_KIND_EXCEEDS_SUPPORT"
  | "CONFIDENCE_EXCEEDS_CEILING"
  | "MISSING_CONFIDENCE_CEILING";

export const validateSynthesisBuildRecord = (
  value: unknown
): Result<SynthesisBuildRecord, BuildResponseError> => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== BUILD_RECORD_SCHEMA_VERSION ||
    !nonEmptyString(value.id) ||
    !validTime(value.recordedAt) ||
    !nonEmptyString(value.runId) ||
    (value.reviewStatus !== "reviewed" &&
      value.reviewStatus !== "provisional" &&
      value.reviewStatus !== "synthetic") ||
    typeof value.limitedEvidence !== "boolean" ||
    !Array.isArray(value.supersedesNoteIds) ||
    !readArtifactBinding(value.envelope) ||
    !readArtifactBinding(value.request) ||
    !readArtifactBinding(value.response) ||
    !isRecord(value.invocation) ||
    !isRecord(value.synthesis) ||
    !Array.isArray(value.synthesis.claims) ||
    value.synthesis.runId !== value.runId ||
    value.synthesis.reviewStatus !== value.reviewStatus ||
    value.synthesis.limitedEvidence !== value.limitedEvidence
  ) {
    return err("INVALID_BUILD_RESPONSE");
  }
  return ok(value as SynthesisBuildRecord);
};

const readResponse = (value: unknown): Result<{
  invocationId: string;
  startedAt: string;
  completedAt: string;
  capturedBy: string;
  requestId: string;
  claims: BuildClaimProposal[];
}, BuildResponseError> => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
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
    value.schemaVersion !== BUILD_RESPONSE_SCHEMA_VERSION ||
    value.provider !== BUILD_PROVIDER ||
    value.model !== BUILD_MODEL
  ) {
    return err("INVALID_BUILD_RESPONSE");
  }
  if (value.freshSession !== true) return err("FRESH_SESSION_NOT_ATTESTED");
  const invocationId = nonEmptyString(value.invocationId);
  const requestId = nonEmptyString(value.requestId);
  const startedAt = validTime(value.startedAt);
  const completedAt = validTime(value.completedAt);
  const capturedBy = nonEmptyString(value.capturedBy);
  const proposal = parseBuildProposal(value.proposal);
  if (
    !invocationId ||
    !requestId ||
    !startedAt ||
    !completedAt ||
    !capturedBy ||
    !proposal.ok
  ) {
    return err("INVALID_BUILD_RESPONSE");
  }
  if (Date.parse(startedAt) > Date.parse(completedAt)) {
    return err("INVALID_INVOCATION_CHRONOLOGY");
  }
  return ok({
    invocationId,
    requestId,
    startedAt,
    completedAt,
    capturedBy,
    claims: proposal.value.claims
  });
};

export const recordSynthesisBuildResponse = (input: {
  request: SynthesisBuildRequest;
  requestArtifact: ArtifactBinding;
  responseValue: unknown;
  responseArtifact: ArtifactBinding;
  envelope: SynthesisBuildEnvelope;
  envelopeArtifact: ArtifactBinding;
  sources: BoundSourceNote[];
  policy: SynthesisProfilePolicy;
  outletIdentityTable: OutletIdentityTable;
  recordedAt: string;
}): Result<SynthesisBuildRecord, BuildResponseError> => {
  const recordedAt = validTime(input.recordedAt);
  const requestArtifact = readArtifactBinding(input.requestArtifact);
  const responseArtifact = readArtifactBinding(input.responseArtifact);
  const envelopeArtifact = readArtifactBinding(input.envelopeArtifact);
  if (!recordedAt || !requestArtifact || !responseArtifact || !envelopeArtifact) {
    return err("INVALID_ARTIFACT_BINDING");
  }
  if (
    input.request.envelope.artifactRef !== envelopeArtifact.artifactRef ||
    input.request.envelope.artifactSha256 !== envelopeArtifact.artifactSha256 ||
    input.request.runId !== input.envelope.runId
  ) {
    return err("BUILD_REQUEST_MISMATCH");
  }
  const response = readResponse(input.responseValue);
  if (!response.ok) return response;
  if (response.value.requestId !== input.request.id) {
    return err("BUILD_REQUEST_MISMATCH");
  }
  if (Date.parse(response.value.startedAt) < Date.parse(input.request.preparedAt)) {
    return err("INVALID_INVOCATION_CHRONOLOGY");
  }
  const synthesis = buildExternalSynthesis({
    envelope: input.envelope,
    sources: input.sources,
    policy: input.policy,
    outletIdentityTable: input.outletIdentityTable,
    proposals: response.value.claims,
    createdAt: recordedAt
  });
  if (!synthesis.ok) return err(synthesis.error);
  const body = {
    recordedAt,
    runId: input.envelope.runId,
    reviewStatus: input.envelope.reviewStatus,
    limitedEvidence: synthesis.value.limitedEvidence,
    supersedesNoteIds: input.envelope.supersedesNoteIds,
    envelope: envelopeArtifact,
    request: requestArtifact,
    response: responseArtifact,
    invocation: {
      id: response.value.invocationId,
      provider: BUILD_PROVIDER,
      model: BUILD_MODEL,
      startedAt: response.value.startedAt,
      completedAt: response.value.completedAt,
      freshSession: true as const,
      capturedBy: response.value.capturedBy
    },
    synthesis: synthesis.value
  };
  return ok({
    schemaVersion: BUILD_RECORD_SCHEMA_VERSION,
    id: `synthesis-build-record-${sha256Text(canonicalJson(body)).slice(0, 32)}`,
    ...body
  });
};