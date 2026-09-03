import { err, ok, type Result } from "../../../core/result.js";
import {
  EXTRACT_COMMIT_SCHEMA_VERSION,
  EXTRACT_MODEL,
  EXTRACT_PROVIDER,
  EXTRACT_RESPONSE_SCHEMA_VERSION,
  type AdmittedSource,
  type ApprovedRequirements,
  type ArtifactBinding,
  type CheckFailure,
  type ExtractCommit,
  type ExtractRequest,
  type ExtractResponse,
  type ProfilePolicy
} from "../types.js";
import {
  hasOnlyKeys,
  isRecord,
  nonEmptyString,
  sha256Text,
  validSha256,
  validTime
} from "../validators.js";
import { runExtractChecks, validateExtractProposal } from "./checks.js";
import { segmentAliasMap } from "../render-document.js";

export type ExtractRecordError =
  | "INVALID_EXTRACT_RESPONSE"
  | "RESPONSE_NOT_BOUND_TO_REQUEST"
  | "INVALID_INVOCATION_CHRONOLOGY"
  | "FRESH_SESSION_NOT_ATTESTED"
  | "REQUEST_LINEAGE_MISMATCH"
  | "INVALID_RECORD_TIME"
  | "INVALID_ARTIFACT_BINDING";

export type ExtractRecordOutcome =
  | { status: "committed"; commit: ExtractCommit }
  | { status: "failed"; failures: CheckFailure[] };

export type RecordExtractInput = {
  request: ExtractRequest;
  requestArtifact: ArtifactBinding;
  responseValue: unknown;
  responseArtifact: ArtifactBinding;
  admitted: AdmittedSource;
  requirements: ApprovedRequirements;
  requirementsArtifact: ArtifactBinding;
  policy: ProfilePolicy;
  policyArtifact: ArtifactBinding;
  recordedAt: string;
};

const readResponse = (
  value: unknown
): Result<
  Omit<ExtractResponse, "proposal"> & { proposalValue: unknown },
  ExtractRecordError
> => {
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
    value.schemaVersion !== EXTRACT_RESPONSE_SCHEMA_VERSION ||
    value.provider !== EXTRACT_PROVIDER ||
    value.model !== EXTRACT_MODEL
  ) {
    return err("INVALID_EXTRACT_RESPONSE");
  }

  const requestId = nonEmptyString(value.requestId);
  const invocationId = nonEmptyString(value.invocationId);
  const startedAt = validTime(value.startedAt);
  const completedAt = validTime(value.completedAt);
  const capturedBy = nonEmptyString(value.capturedBy);
  if (!requestId || !invocationId || !startedAt || !completedAt || !capturedBy) {
    return err("INVALID_EXTRACT_RESPONSE");
  }
  if (value.freshSession !== true) {
    return err("FRESH_SESSION_NOT_ATTESTED");
  }
  if (Date.parse(startedAt) > Date.parse(completedAt)) {
    return err("INVALID_INVOCATION_CHRONOLOGY");
  }

  return ok({
    schemaVersion: EXTRACT_RESPONSE_SCHEMA_VERSION,
    requestId,
    invocationId,
    provider: EXTRACT_PROVIDER,
    model: EXTRACT_MODEL,
    startedAt,
    completedAt,
    freshSession: true,
    capturedBy,
    proposalValue: value.proposal
  });
};

const sameBinding = (left: ArtifactBinding, right: ArtifactBinding): boolean =>
  left.artifactRef === right.artifactRef &&
  left.artifactSha256 === right.artifactSha256;

const readBinding = (value: ArtifactBinding): ArtifactBinding | undefined => {
  const artifactRef = nonEmptyString(value.artifactRef);
  const artifactSha256 = validSha256(value.artifactSha256);
  return artifactRef && artifactSha256 ? { artifactRef, artifactSha256 } : undefined;
};

export const recordExtractResponse = (
  input: RecordExtractInput
): Result<ExtractRecordOutcome, ExtractRecordError> => {
  const recordedAt = validTime(input.recordedAt);
  if (!recordedAt) {
    return err("INVALID_RECORD_TIME");
  }

  const requestArtifact = readBinding(input.requestArtifact);
  const responseArtifact = readBinding(input.responseArtifact);
  const requirementsArtifact = readBinding(input.requirementsArtifact);
  const policyArtifact = readBinding(input.policyArtifact);
  if (
    !requestArtifact ||
    !responseArtifact ||
    !requirementsArtifact ||
    !policyArtifact
  ) {
    return err("INVALID_ARTIFACT_BINDING");
  }

  const { request, admitted, requirements, policy } = input;
  if (
    !sameBinding(request.lineage.snapshot, admitted.snapshot) ||
    !sameBinding(request.lineage.evidenceDecision, admitted.evidenceDecision) ||
    !sameBinding(request.lineage.sourceDocument, admitted.sourceDocumentArtifact) ||
    !sameBinding(request.lineage.requirements, requirementsArtifact) ||
    !sameBinding(request.lineage.policy, policyArtifact) ||
    request.lineage.researchQuestion.artifactSha256 !==
      admitted.researchQuestion.artifactSha256 ||
    request.requirementsApprovalId !== requirements.approvalId ||
    request.policyId !== policy.policyId ||
    request.sourceDocumentId !== admitted.sourceDocument.id ||
    request.snapshotId !== admitted.snapshotId ||
    request.runId !== admitted.runId
  ) {
    return err("REQUEST_LINEAGE_MISMATCH");
  }

  const response = readResponse(input.responseValue);
  if (!response.ok) {
    return response;
  }
  if (response.value.requestId !== request.id) {
    return err("RESPONSE_NOT_BOUND_TO_REQUEST");
  }
  if (Date.parse(response.value.startedAt) < Date.parse(request.preparedAt)) {
    return err("INVALID_INVOCATION_CHRONOLOGY");
  }

  const proposal = validateExtractProposal(response.value.proposalValue, policy);
  if (!proposal.ok) {
    return ok({ status: "failed", failures: [proposal.error] });
  }

  const checked = runExtractChecks(proposal.value, {
    document: admitted.sourceDocument,
    documentArtifactRef: admitted.sourceDocumentArtifact.artifactRef,
    documentArtifactSha256: admitted.sourceDocumentArtifact.artifactSha256,
    aliasToSegmentId: segmentAliasMap(admitted.sourceDocument),
    requirements: requirements.requirements,
    policy
  });
  if (checked.status === "failed") {
    return ok({ status: "failed", failures: checked.failures });
  }

  return ok({
    status: "committed",
    commit: {
      schemaVersion: EXTRACT_COMMIT_SCHEMA_VERSION,
      id: `extract-commit-${sha256Text(
        `${request.id}\u001f${responseArtifact.artifactSha256}`
      ).slice(0, 32)}`,
      requestId: request.id,
      attempt: request.attempt,
      committedAt: recordedAt,
      runId: admitted.runId,
      snapshotId: admitted.snapshotId,
      sourceDecisionId: admitted.sourceDecisionId,
      sourceDocumentId: admitted.sourceDocument.id,
      researchQuestionId: admitted.researchQuestion.id,
      requirementsApprovalId: requirements.approvalId,
      policyId: policy.policyId,
      contract: request.contract,
      lineage: request.lineage,
      invocation: {
        id: response.value.invocationId,
        provider: EXTRACT_PROVIDER,
        model: EXTRACT_MODEL,
        startedAt: response.value.startedAt,
        completedAt: response.value.completedAt,
        freshSession: true,
        capturedBy: response.value.capturedBy,
        request: requestArtifact,
        response: responseArtifact
      },
      observations: checked.observations,
      dispositions: checked.dispositions
    }
  });
};
