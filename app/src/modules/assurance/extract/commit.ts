import { err, ok, type Result } from "../../../core/result.js";
import { hasAllowedKeys, validateObservation } from "../observation.js";
import {
  EXTRACT_COMMIT_SCHEMA_VERSION,
  EXTRACT_MODEL,
  EXTRACT_PROVIDER,
  type Disposition,
  type ExtractCommit,
  type ExtractInvocation,
  type IRDisposition,
  type Observation,
  type ProfilePolicy
} from "../types.js";
import {
  boundedString,
  hasOnlyKeys,
  isRecord,
  nonEmptyString,
  pathSafeId,
  positiveInteger,
  readArtifactBinding,
  readAssuranceLineage,
  validTime
} from "../validators.js";

export type ExtractCommitError =
  | "INVALID_EXTRACT_COMMIT"
  | "INVALID_COMMITTED_OBSERVATION"
  | "INVALID_COMMITTED_DISPOSITION";

export const readIRDisposition = (
  value: unknown,
  policy: ProfilePolicy,
  knownObservationIds: Set<string>
): IRDisposition | undefined => {
  if (
    !isRecord(value) ||
    !hasAllowedKeys(value, ["irId", "disposition", "observationIds", "note"]) ||
    !Array.isArray(value.observationIds)
  ) {
    return undefined;
  }
  const irId = nonEmptyString(value.irId);
  const disposition = policy.dispositions.includes(value.disposition as Disposition)
    ? (value.disposition as Disposition)
    : undefined;
  if (!irId || !disposition) {
    return undefined;
  }
  const observationIds = value.observationIds.map((entry) => nonEmptyString(entry));
  if (
    !observationIds.every((entry): entry is string => entry !== undefined) ||
    new Set(observationIds).size !== observationIds.length ||
    observationIds.some((entry) => !knownObservationIds.has(entry))
  ) {
    return undefined;
  }
  const note = value.note === undefined ? undefined : boundedString(value.note, 400);
  if (value.note !== undefined && !note) {
    return undefined;
  }
  const entry: IRDisposition = { irId, disposition, observationIds };
  if (note) {
    entry.note = note;
  }
  return entry;
};

const readInvocation = (value: unknown): ExtractInvocation | undefined => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "id",
      "provider",
      "model",
      "startedAt",
      "completedAt",
      "freshSession",
      "capturedBy",
      "request",
      "response"
    ]) ||
    value.provider !== EXTRACT_PROVIDER ||
    value.model !== EXTRACT_MODEL ||
    value.freshSession !== true
  ) {
    return undefined;
  }
  const id = nonEmptyString(value.id);
  const startedAt = validTime(value.startedAt);
  const completedAt = validTime(value.completedAt);
  const capturedBy = nonEmptyString(value.capturedBy);
  const request = readArtifactBinding(value.request);
  const response = readArtifactBinding(value.response);
  if (
    !id ||
    !startedAt ||
    !completedAt ||
    !capturedBy ||
    !request ||
    !response ||
    Date.parse(startedAt) > Date.parse(completedAt)
  ) {
    return undefined;
  }
  return {
    id,
    provider: EXTRACT_PROVIDER,
    model: EXTRACT_MODEL,
    startedAt,
    completedAt,
    freshSession: true,
    capturedBy,
    request,
    response
  };
};

export const validateExtractCommit = (
  value: unknown,
  policy: ProfilePolicy
): Result<ExtractCommit, ExtractCommitError> => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "schemaVersion",
      "id",
      "requestId",
      "attempt",
      "committedAt",
      "runId",
      "snapshotId",
      "sourceDecisionId",
      "sourceDocumentId",
      "researchQuestionId",
      "requirementsApprovalId",
      "policyId",
      "lineage",
      "invocation",
      "observations",
      "dispositions"
    ]) ||
    value.schemaVersion !== EXTRACT_COMMIT_SCHEMA_VERSION ||
    !Array.isArray(value.observations) ||
    !Array.isArray(value.dispositions)
  ) {
    return err("INVALID_EXTRACT_COMMIT");
  }

  const id = pathSafeId(value.id);
  const requestId = pathSafeId(value.requestId);
  const attempt = positiveInteger(value.attempt);
  const committedAt = validTime(value.committedAt);
  const runId = pathSafeId(value.runId);
  const snapshotId = pathSafeId(value.snapshotId);
  const sourceDecisionId = pathSafeId(value.sourceDecisionId);
  const sourceDocumentId = pathSafeId(value.sourceDocumentId);
  const researchQuestionId = nonEmptyString(value.researchQuestionId);
  const requirementsApprovalId = pathSafeId(value.requirementsApprovalId);
  const policyId = nonEmptyString(value.policyId);
  const lineage = readAssuranceLineage(value.lineage);
  const invocation = readInvocation(value.invocation);
  if (
    !id ||
    !requestId ||
    !attempt ||
    !committedAt ||
    !runId ||
    !snapshotId ||
    !sourceDecisionId ||
    !sourceDocumentId ||
    !researchQuestionId ||
    !requirementsApprovalId ||
    !policyId ||
    !lineage ||
    !invocation ||
    policyId !== policy.policyId
  ) {
    return err("INVALID_EXTRACT_COMMIT");
  }

  const observations: Observation[] = [];
  for (const entry of value.observations) {
    const observation = validateObservation(entry, policy);
    if (!observation.ok || observation.value.origin !== "model") {
      return err("INVALID_COMMITTED_OBSERVATION");
    }
    observations.push(observation.value);
  }

  const knownObservationIds = new Set(
    observations.map((entry) => entry.observationId)
  );
  const dispositions: IRDisposition[] = [];
  for (const entry of value.dispositions) {
    const disposition = readIRDisposition(entry, policy, knownObservationIds);
    if (!disposition) {
      return err("INVALID_COMMITTED_DISPOSITION");
    }
    dispositions.push(disposition);
  }

  return ok({
    schemaVersion: EXTRACT_COMMIT_SCHEMA_VERSION,
    id,
    requestId,
    attempt,
    committedAt,
    runId,
    snapshotId,
    sourceDecisionId,
    sourceDocumentId,
    researchQuestionId,
    requirementsApprovalId,
    policyId,
    lineage,
    invocation,
    observations,
    dispositions
  });
};
