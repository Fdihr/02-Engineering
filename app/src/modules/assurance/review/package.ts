import type { SourceDocument } from "../../../core/types.js";
import { err, ok, type Result } from "../../../core/result.js";
import { validateObservation } from "../observation.js";
import { readIRDisposition } from "../extract/commit.js";
import {
  REVIEW_PACKAGE_SCHEMA_VERSION,
  type ApprovedRequirements,
  type ArtifactBinding,
  type ExtractCommit,
  type IRDisposition,
  type ProfilePolicy,
  type RequirementDefinition,
  type ReviewPackage,
  type ReviewPackageObservation
} from "../types.js";
import {
  hasOnlyKeys,
  isRecord,
  nonEmptyString,
  pathSafeId,
  readArtifactBinding,
  sha256Text,
  validTime
} from "../validators.js";

export type ReviewPackageError =
  | "INVALID_PACKAGE_TIME"
  | "INVALID_COMMIT_ARTIFACT"
  | "COMMIT_DOCUMENT_MISMATCH"
  | "REQUIREMENTS_MISMATCH"
  | "INVALID_REVIEW_PACKAGE";

export type CreateReviewPackageInput = {
  commit: ExtractCommit;
  commitArtifact: ArtifactBinding;
  requirements: ApprovedRequirements;
  document: SourceDocument;
  createdAt: string;
};

/** Orders and collapses committed observations into one immutable human-review input. */
export const createReviewPackage = (
  input: CreateReviewPackageInput
): Result<ReviewPackage, ReviewPackageError> => {
  const createdAt = validTime(input.createdAt);
  if (!createdAt) {
    return err("INVALID_PACKAGE_TIME");
  }
  const commitArtifact = readArtifactBinding(input.commitArtifact);
  if (!commitArtifact) {
    return err("INVALID_COMMIT_ARTIFACT");
  }
  if (input.commit.sourceDocumentId !== input.document.id) {
    return err("COMMIT_DOCUMENT_MISMATCH");
  }
  if (input.commit.requirementsApprovalId !== input.requirements.approvalId) {
    return err("REQUIREMENTS_MISMATCH");
  }

  const ordinalBySegment = new Map(
    input.document.segments.map((segment) => [segment.id, segment.ordinal])
  );

  const collapsed = new Map<string, ReviewPackageObservation>();
  input.commit.observations.forEach((observation, index) => {
    const existing = collapsed.get(observation.observationId);
    if (existing) {
      existing.extractIndexes.push(index);
      existing.occurrences += 1;
      return;
    }
    collapsed.set(observation.observationId, {
      ...observation,
      extractIndexes: [index],
      occurrences: 1
    });
  });

  const observations = [...collapsed.values()].sort((left, right) => {
    const leftOrdinal = ordinalBySegment.get(left.anchor.segmentId) ?? 0;
    const rightOrdinal = ordinalBySegment.get(right.anchor.segmentId) ?? 0;
    if (leftOrdinal !== rightOrdinal) {
      return leftOrdinal - rightOrdinal;
    }
    if (left.anchor.quoteStartUtf8Byte !== right.anchor.quoteStartUtf8Byte) {
      return left.anchor.quoteStartUtf8Byte - right.anchor.quoteStartUtf8Byte;
    }
    return left.observationId.localeCompare(right.observationId);
  });

  return ok({
    schemaVersion: REVIEW_PACKAGE_SCHEMA_VERSION,
    id: `review-package-${sha256Text(
      `${input.commit.id}\u001f${commitArtifact.artifactSha256}`
    ).slice(0, 32)}`,
    createdAt,
    runId: input.commit.runId,
    snapshotId: input.commit.snapshotId,
    sourceDocumentId: input.commit.sourceDocumentId,
    extractCommit: commitArtifact,
    requirements: input.requirements.requirements,
    observations,
    modelDispositions: input.commit.dispositions
  });
};

const readRequirements = (value: unknown): RequirementDefinition[] | undefined => {
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const requirements: RequirementDefinition[] = [];
  for (const entry of value) {
    if (!isRecord(entry) || !hasOnlyKeys(entry, ["irId", "text"])) {
      return undefined;
    }
    const irId = pathSafeId(entry.irId);
    const text = nonEmptyString(entry.text);
    if (!irId || !text) {
      return undefined;
    }
    requirements.push({ irId, text });
  }
  return requirements;
};

export const validateReviewPackage = (
  value: unknown,
  policy: ProfilePolicy
): Result<ReviewPackage, ReviewPackageError> => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "schemaVersion",
      "id",
      "createdAt",
      "runId",
      "snapshotId",
      "sourceDocumentId",
      "extractCommit",
      "requirements",
      "observations",
      "modelDispositions"
    ]) ||
    value.schemaVersion !== REVIEW_PACKAGE_SCHEMA_VERSION ||
    !Array.isArray(value.observations) ||
    !Array.isArray(value.modelDispositions)
  ) {
    return err("INVALID_REVIEW_PACKAGE");
  }

  const id = pathSafeId(value.id);
  const createdAt = validTime(value.createdAt);
  const runId = pathSafeId(value.runId);
  const snapshotId = pathSafeId(value.snapshotId);
  const sourceDocumentId = pathSafeId(value.sourceDocumentId);
  const extractCommit = readArtifactBinding(value.extractCommit);
  const requirements = readRequirements(value.requirements);
  if (
    !id ||
    !createdAt ||
    !runId ||
    !snapshotId ||
    !sourceDocumentId ||
    !extractCommit ||
    !requirements
  ) {
    return err("INVALID_REVIEW_PACKAGE");
  }

  const observations: ReviewPackageObservation[] = [];
  for (const entry of value.observations) {
    if (!isRecord(entry)) {
      return err("INVALID_REVIEW_PACKAGE");
    }
    const { extractIndexes, occurrences, ...rest } = entry;
    const observation = validateObservation(rest, policy);
    if (
      !observation.ok ||
      !Array.isArray(extractIndexes) ||
      extractIndexes.length === 0 ||
      !extractIndexes.every(
        (index) => typeof index === "number" && Number.isInteger(index) && index >= 0
      ) ||
      typeof occurrences !== "number" ||
      occurrences !== extractIndexes.length
    ) {
      return err("INVALID_REVIEW_PACKAGE");
    }
    observations.push({
      ...observation.value,
      extractIndexes: extractIndexes as number[],
      occurrences
    });
  }

  const knownObservationIds = new Set(
    observations.map((entry) => entry.observationId)
  );
  const modelDispositions: IRDisposition[] = [];
  for (const entry of value.modelDispositions) {
    const disposition = readIRDisposition(entry, policy, knownObservationIds);
    if (!disposition) {
      return err("INVALID_REVIEW_PACKAGE");
    }
    modelDispositions.push(disposition);
  }

  return ok({
    schemaVersion: REVIEW_PACKAGE_SCHEMA_VERSION,
    id,
    createdAt,
    runId,
    snapshotId,
    sourceDocumentId,
    extractCommit,
    requirements,
    observations,
    modelDispositions
  });
};
