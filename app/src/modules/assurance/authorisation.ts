import { err, ok, type Result } from "../../core/result.js";
import {
  ATTEMPT_AUTHORISATION_SCHEMA_VERSION,
  type ArtifactBinding,
  type AttemptAuthorisation,
  type ProfilePolicy
} from "./types.js";
import {
  boundedString,
  hasOnlyKeys,
  isRecord,
  nonEmptyString,
  pathSafeId,
  positiveInteger,
  readArtifactBinding,
  sha256Text,
  validTime
} from "./validators.js";

export type AttemptAuthorisationError =
  | "INVALID_FAILED_STAGE"
  | "STAGE_NOT_FAILED"
  | "INVALID_SEQUENCE"
  | "MISSING_REVIEWER"
  | "MISSING_REASON"
  | "INVALID_AUTHORISATION_TIME"
  | "INVALID_ARTIFACT_BINDING"
  | "INVALID_REVALIDATION"
  | "INVALID_ATTEMPT_AUTHORISATION";

/** Re-validating a stored proposal is only defensible for bookkeeping or locator relaxations. */
export const REVALIDATION_RULE =
  "Re-validation of a stored proposal is permitted only when the contract change removes a bookkeeping requirement or makes a locator more tolerant, never when it alters an invariant on a judgement field.";

export type CreateAttemptAuthorisationInput = {
  runId: string;
  snapshotId: string;
  sequence: number;
  supersededStageDirectory: string;
  failureValue: unknown;
  failureArtifact: ArtifactBinding;
  policy: ProfilePolicy;
  policyArtifact: ArtifactBinding;
  reviewerId: unknown;
  reason: unknown;
  authorisedAt: unknown;
  revalidatedResponseValue?: unknown;
  revalidatedResponseArtifact?: ArtifactBinding;
};

export const createAttemptAuthorisation = (
  input: CreateAttemptAuthorisationInput
): Result<AttemptAuthorisation, AttemptAuthorisationError> => {
  const failure = input.failureValue;
  if (!isRecord(failure) || !Array.isArray(failure.failures)) {
    return err("INVALID_FAILED_STAGE");
  }
  if (failure.failures.length === 0 || !nonEmptyString(failure.requestId)) {
    return err("STAGE_NOT_FAILED");
  }

  const runId = pathSafeId(input.runId);
  const snapshotId = pathSafeId(input.snapshotId);
  const supersededStageDirectory = nonEmptyString(input.supersededStageDirectory);
  const sequence = positiveInteger(input.sequence);
  if (!runId || !snapshotId || !supersededStageDirectory) {
    return err("INVALID_FAILED_STAGE");
  }
  if (!sequence || sequence < 2) {
    return err("INVALID_SEQUENCE");
  }

  const failureArtifact = readArtifactBinding(input.failureArtifact);
  const policyArtifact = readArtifactBinding(input.policyArtifact);
  if (!failureArtifact || !policyArtifact) {
    return err("INVALID_ARTIFACT_BINDING");
  }

  const authorisedBy = nonEmptyString(input.reviewerId);
  if (!authorisedBy) {
    return err("MISSING_REVIEWER");
  }
  const reason = boundedString(input.reason, 1_000);
  if (!reason) {
    return err("MISSING_REASON");
  }
  const authorisedAt = validTime(input.authorisedAt);
  if (!authorisedAt) {
    return err("INVALID_AUTHORISATION_TIME");
  }

  const authorisation: AttemptAuthorisation = {
    schemaVersion: ATTEMPT_AUTHORISATION_SCHEMA_VERSION,
    id: `auth-${sha256Text(
      `${snapshotId}\u001f${failureArtifact.artifactSha256}\u001f${sequence}`
    ).slice(0, 8)}`,
    runId,
    snapshotId,
    sequence,
    stageDirectory: `extract-${sequence}`,
    supersededStageDirectory,
    supersededFailure: failureArtifact,
    policyId: input.policy.policyId,
    policy: policyArtifact,
    reason,
    authorisedBy,
    authorisedAt
  };

  if (input.revalidatedResponseValue !== undefined) {
    const response = isRecord(input.revalidatedResponseValue)
      ? input.revalidatedResponseValue
      : undefined;
    const originatingInvocationId = nonEmptyString(response?.invocationId);
    const originatingResponse = input.revalidatedResponseArtifact
      ? readArtifactBinding(input.revalidatedResponseArtifact)
      : undefined;
    if (!originatingInvocationId || !originatingResponse) {
      return err("INVALID_REVALIDATION");
    }
    authorisation.revalidation = {
      rule: REVALIDATION_RULE,
      originatingInvocationId,
      originatingResponse
    };
  }

  return ok(authorisation);
};

export const validateAttemptAuthorisation = (
  value: unknown
): Result<AttemptAuthorisation, AttemptAuthorisationError> => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "schemaVersion",
      "id",
      "runId",
      "snapshotId",
      "sequence",
      "stageDirectory",
      "supersededStageDirectory",
      "supersededFailure",
      "policyId",
      "policy",
      "reason",
      "revalidation",
      "authorisedBy",
      "authorisedAt"
    ].filter((key) => key !== "revalidation" || "revalidation" in value)) ||
    value.schemaVersion !== ATTEMPT_AUTHORISATION_SCHEMA_VERSION
  ) {
    return err("INVALID_ATTEMPT_AUTHORISATION");
  }

  const id = pathSafeId(value.id);
  const runId = pathSafeId(value.runId);
  const snapshotId = pathSafeId(value.snapshotId);
  const sequence = positiveInteger(value.sequence);
  const stageDirectory = pathSafeId(value.stageDirectory);
  const supersededStageDirectory = nonEmptyString(value.supersededStageDirectory);
  const supersededFailure = readArtifactBinding(value.supersededFailure);
  const policyId = nonEmptyString(value.policyId);
  const policy = readArtifactBinding(value.policy);
  const reason = boundedString(value.reason, 1_000);
  const authorisedBy = nonEmptyString(value.authorisedBy);
  const authorisedAt = validTime(value.authorisedAt);
  if (
    !id ||
    !runId ||
    !snapshotId ||
    !sequence ||
    sequence < 2 ||
    !stageDirectory ||
    stageDirectory !== `extract-${sequence}` ||
    !supersededStageDirectory ||
    !supersededFailure ||
    !policyId ||
    !policy ||
    !reason ||
    !authorisedBy ||
    !authorisedAt
  ) {
    return err("INVALID_ATTEMPT_AUTHORISATION");
  }

  return ok({
    schemaVersion: ATTEMPT_AUTHORISATION_SCHEMA_VERSION,
    id,
    runId,
    snapshotId,
    sequence,
    stageDirectory,
    supersededStageDirectory,
    supersededFailure,
    policyId,
    policy,
    reason,
    ...(isRecord(value.revalidation)
      ? {
          revalidation: value.revalidation as AttemptAuthorisation["revalidation"]
        }
      : {}),
    authorisedBy,
    authorisedAt
  });
};
