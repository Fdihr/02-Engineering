import type { SourceDocument } from "../../../core/types.js";
import { err, ok, type Result } from "../../../core/result.js";
import { anchorQuote } from "../anchoring.js";
import { observationId } from "../ids.js";
import { segmentAliasMap } from "../render-document.js";
import {
  hasAllowedKeys,
  readExtractObservation,
  validateObservation
} from "../observation.js";
import {
  REVIEW_RECORD_SCHEMA_VERSION,
  type ApprovedRequirements,
  type ArtifactBinding,
  type Assessment,
  type Disposition,
  type IRReviewEntry,
  type Observation,
  type ProfilePolicy,
  type ReviewPackage,
  type ReviewRecord,
  type ReviewVerdict,
  type ReviewVerdictEntry
} from "../types.js";
import {
  boundedString,
  boundedStringArray,
  hasOnlyKeys,
  isRecord,
  nonEmptyString,
  readArtifactBinding,
  sha256Text,
  validSha256,
  validTime
} from "../validators.js";

export type ReviewRecordError =
  | "INVALID_REVIEW_RESPONSE"
  | "RESPONSE_NOT_BOUND_TO_PACKAGE"
  | "INVALID_VERDICT_COVERAGE"
  | "INVALID_DUPLICATE_REFERENCE"
  | "INVALID_CORRECTED_TAGS"
  | "INVALID_HUMAN_OBSERVATION"
  | "DUPLICATE_HUMAN_OBSERVATION"
  | "INVALID_IR_REVIEW"
  | "MISSING_IR_REVIEW_NOTE"
  | "INVALID_ASSESSMENT"
  | "INVALID_RECORD_TIME"
  | "INVALID_ARTIFACT_BINDING";

const ACCESS_VALUES = new Set(["direct", "indirect", "unknown"]);
const TRACK_RECORD_VALUES = new Set(["established", "limited", "unknown"]);
const DEPENDENCY_VALUES = new Set(["original", "relayed", "mixed", "unknown"]);

const readAssessment = (value: unknown): Assessment | undefined => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, ["reliability", "dependency", "limitations"]) ||
    !isRecord(value.reliability) ||
    !isRecord(value.dependency) ||
    !hasOnlyKeys(value.reliability, [
      "access",
      "accessRationale",
      "trackRecord",
      "trackRecordRationale",
      "alignment"
    ]) ||
    !hasOnlyKeys(value.dependency, ["kind", "upstreamSources", "rationale"])
  ) {
    return undefined;
  }

  const reliability = value.reliability;
  const dependency = value.dependency;
  const accessRationale = boundedString(reliability.accessRationale, 1_000);
  const trackRecordRationale = boundedString(reliability.trackRecordRationale, 1_000);
  const alignment = boundedString(reliability.alignment, 1_000);
  const rationale = boundedString(dependency.rationale, 1_000);
  const upstreamSources = boundedStringArray(dependency.upstreamSources, 24, 240);
  const limitations = boundedStringArray(value.limitations, 24, 2_000);
  if (
    !ACCESS_VALUES.has(reliability.access as string) ||
    !TRACK_RECORD_VALUES.has(reliability.trackRecord as string) ||
    !DEPENDENCY_VALUES.has(dependency.kind as string) ||
    !accessRationale ||
    !trackRecordRationale ||
    !alignment ||
    !rationale ||
    !upstreamSources ||
    !limitations
  ) {
    return undefined;
  }
  if (dependency.kind !== "original" && upstreamSources.length === 0) {
    return undefined;
  }

  return {
    reliability: {
      access: reliability.access as Assessment["reliability"]["access"],
      accessRationale,
      trackRecord: reliability.trackRecord as Assessment["reliability"]["trackRecord"],
      trackRecordRationale,
      alignment
    },
    dependency: {
      kind: dependency.kind as Assessment["dependency"]["kind"],
      upstreamSources,
      rationale
    },
    limitations
  };
};

export type RecordReviewInput = {
  reviewPackage: ReviewPackage;
  packageArtifact: ArtifactBinding;
  responseValue: unknown;
  responseArtifact: ArtifactBinding;
  document: SourceDocument;
  documentArtifact: ArtifactBinding;
  requirements: ApprovedRequirements;
  policy: ProfilePolicy;
  recordedAt: string;
};

export const recordReview = (
  input: RecordReviewInput
): Result<ReviewRecord, ReviewRecordError> => {
  const recordedAt = validTime(input.recordedAt);
  if (!recordedAt) {
    return err("INVALID_RECORD_TIME");
  }
  const packageArtifact = readArtifactBinding(input.packageArtifact);
  const responseArtifact = readArtifactBinding(input.responseArtifact);
  const documentArtifact = readArtifactBinding(input.documentArtifact);
  if (!packageArtifact || !responseArtifact || !documentArtifact) {
    return err("INVALID_ARTIFACT_BINDING");
  }

  const value = input.responseValue;
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "packageSha256",
      "reviewerId",
      "reviewedAt",
      "verdicts",
      "humanObservations",
      "irReview",
      "assessment"
    ]) ||
    !Array.isArray(value.verdicts) ||
    !Array.isArray(value.humanObservations) ||
    !Array.isArray(value.irReview)
  ) {
    return err("INVALID_REVIEW_RESPONSE");
  }

  const reviewerId = nonEmptyString(value.reviewerId);
  const reviewedAt = validTime(value.reviewedAt);
  const packageSha256 = validSha256(value.packageSha256);
  if (!reviewerId || !reviewedAt || !packageSha256) {
    return err("INVALID_REVIEW_RESPONSE");
  }
  if (packageSha256 !== packageArtifact.artifactSha256) {
    return err("RESPONSE_NOT_BOUND_TO_PACKAGE");
  }

  const packageOrder = new Map(
    input.reviewPackage.observations.map((entry, index) => [
      entry.observationId,
      index
    ])
  );
  const proposedTags = new Map(
    input.reviewPackage.observations.map((entry) => [
      entry.observationId,
      entry.irIds
    ])
  );

  const verdicts: ReviewVerdictEntry[] = [];
  const seenVerdicts = new Set<string>();
  for (const entry of value.verdicts) {
    if (
      !isRecord(entry) ||
      !hasAllowedKeys(entry, [
        "observationId",
        "verdict",
        "note",
        "duplicateOf",
        "correctedIrIds"
      ])
    ) {
      return err("INVALID_REVIEW_RESPONSE");
    }
    const observationIdValue = nonEmptyString(entry.observationId);
    const verdict = input.policy.reviewVerdicts.includes(entry.verdict as ReviewVerdict)
      ? (entry.verdict as ReviewVerdict)
      : undefined;
    if (!observationIdValue || !verdict) {
      return err("INVALID_REVIEW_RESPONSE");
    }
    const order = packageOrder.get(observationIdValue);
    if (order === undefined || seenVerdicts.has(observationIdValue)) {
      return err("INVALID_VERDICT_COVERAGE");
    }
    seenVerdicts.add(observationIdValue);

    const note = entry.note === undefined ? undefined : boundedString(entry.note, 1_000);
    if (entry.note !== undefined && !note) {
      return err("INVALID_REVIEW_RESPONSE");
    }

    let duplicateOf: string | undefined;
    if (verdict === "duplicate") {
      duplicateOf = nonEmptyString(entry.duplicateOf);
      const target = duplicateOf ? packageOrder.get(duplicateOf) : undefined;
      if (!duplicateOf || target === undefined || target >= order) {
        return err("INVALID_DUPLICATE_REFERENCE");
      }
    } else if (entry.duplicateOf !== undefined) {
      return err("INVALID_DUPLICATE_REFERENCE");
    }

    const verdictEntry: ReviewVerdictEntry = {
      observationId: observationIdValue,
      verdict
    };
    if (note) {
      verdictEntry.note = note;
    }
    if (duplicateOf) {
      verdictEntry.duplicateOf = duplicateOf;
    }

    if (entry.correctedIrIds !== undefined) {
      const proposed = proposedTags.get(observationIdValue) ?? [];
      if (verdict !== "supported" || !Array.isArray(entry.correctedIrIds)) {
        return err("INVALID_CORRECTED_TAGS");
      }
      const corrected = entry.correctedIrIds.map((value) => nonEmptyString(value));
      if (
        !corrected.every((value): value is string => value !== undefined) ||
        new Set(corrected).size !== corrected.length ||
        corrected.some((irId) => !proposed.includes(irId)) ||
        corrected.length >= proposed.length
      ) {
        return err("INVALID_CORRECTED_TAGS");
      }
      verdictEntry.correctedIrIds = corrected;
    }

    verdicts.push(verdictEntry);
  }
  if (seenVerdicts.size !== input.reviewPackage.observations.length) {
    return err("INVALID_VERDICT_COVERAGE");
  }

  const humanObservations: Observation[] = [];
  const humanIds = new Set<string>();
  for (const entry of value.humanObservations) {
    const observation = readExtractObservation(entry, input.policy);
    if (!observation) {
      return err("INVALID_HUMAN_OBSERVATION");
    }
    const approvedIrIds = new Set(
      input.requirements.requirements.map((requirement) => requirement.irId)
    );
    if (
      new Set(observation.irIds).size !== observation.irIds.length ||
      observation.irIds.some((irId) => !approvedIrIds.has(irId))
    ) {
      return err("INVALID_HUMAN_OBSERVATION");
    }
    if (
      observation.claimKind === "statement" &&
      (observation.attribution.kind === "direct" ||
        !observation.attribution.attributedTo)
    ) {
      return err("INVALID_HUMAN_OBSERVATION");
    }
    if (
      observation.attribution.kind === "relayed" &&
      !observation.attribution.attributedTo
    ) {
      return err("INVALID_HUMAN_OBSERVATION");
    }
    const segmentId = segmentAliasMap(input.document).get(observation.segment);
    if (!segmentId) {
      return err("INVALID_HUMAN_OBSERVATION");
    }
    const anchor = anchorQuote(
      input.document,
      documentArtifact.artifactRef,
      documentArtifact.artifactSha256,
      segmentId,
      observation.quote,
      input.policy
    );
    if (!anchor.ok) {
      return err("INVALID_HUMAN_OBSERVATION");
    }
    const id = observationId(
      anchor.value.anchor,
      observation.claimKind,
      observation.text
    );
    if (humanIds.has(id) || packageOrder.has(id)) {
      return err("DUPLICATE_HUMAN_OBSERVATION");
    }
    humanIds.add(id);
    humanObservations.push({
      ...observation,
      quote: anchor.value.anchor.quote,
      observationId: id,
      segmentId: anchor.value.anchor.segmentId,
      anchor: anchor.value.anchor,
      origin: "human",
      proposedQuote: anchor.value.proposedQuote,
      matchedVia: anchor.value.matchedVia
    });
  }

  const irReview: IRReviewEntry[] = [];
  const seenIrIds = new Set<string>();
  for (const entry of value.irReview) {
    if (!isRecord(entry) || !hasAllowedKeys(entry, ["irId", "disposition", "note"])) {
      return err("INVALID_IR_REVIEW");
    }
    const irId = nonEmptyString(entry.irId);
    const disposition = input.policy.dispositions.includes(
      entry.disposition as Disposition
    )
      ? (entry.disposition as Disposition)
      : undefined;
    if (!irId || !disposition || seenIrIds.has(irId)) {
      return err("INVALID_IR_REVIEW");
    }
    seenIrIds.add(irId);
    const note = entry.note === undefined ? undefined : boundedString(entry.note, 1_000);
    if (entry.note !== undefined && !note) {
      return err("INVALID_IR_REVIEW");
    }
    if (disposition !== "covered" && !note) {
      return err("MISSING_IR_REVIEW_NOTE");
    }
    const reviewEntry: IRReviewEntry = { irId, disposition };
    if (note) {
      reviewEntry.note = note;
    }
    irReview.push(reviewEntry);
  }
  const approvedIrIds = input.requirements.requirements.map((entry) => entry.irId);
  if (
    seenIrIds.size !== approvedIrIds.length ||
    approvedIrIds.some((irId) => !seenIrIds.has(irId))
  ) {
    return err("INVALID_IR_REVIEW");
  }

  const assessment = readAssessment(value.assessment);
  if (!assessment) {
    return err("INVALID_ASSESSMENT");
  }

  return ok({
    schemaVersion: REVIEW_RECORD_SCHEMA_VERSION,
    id: `review-record-${sha256Text(
      `${input.reviewPackage.id}\u001f${responseArtifact.artifactSha256}`
    ).slice(0, 32)}`,
    recordedAt,
    runId: input.reviewPackage.runId,
    snapshotId: input.reviewPackage.snapshotId,
    policyId: input.policy.policyId,
    reviewerId,
    reviewedAt,
    reviewPackage: packageArtifact,
    reviewResponse: responseArtifact,
    verdicts,
    humanObservations,
    irReview,
    assessment
  });
};

export const validateReviewRecord = (
  value: unknown,
  policy: ProfilePolicy
): Result<ReviewRecord, ReviewRecordError> => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "schemaVersion",
      "id",
      "recordedAt",
      "runId",
      "snapshotId",
      "policyId",
      "reviewerId",
      "reviewedAt",
      "reviewPackage",
      "reviewResponse",
      "verdicts",
      "humanObservations",
      "irReview",
      "assessment"
    ]) ||
    value.schemaVersion !== REVIEW_RECORD_SCHEMA_VERSION ||
    !Array.isArray(value.verdicts) ||
    !Array.isArray(value.humanObservations) ||
    !Array.isArray(value.irReview)
  ) {
    return err("INVALID_REVIEW_RESPONSE");
  }

  const id = nonEmptyString(value.id);
  const recordedAt = validTime(value.recordedAt);
  const runId = nonEmptyString(value.runId);
  const snapshotId = nonEmptyString(value.snapshotId);
  const policyId = nonEmptyString(value.policyId);
  const reviewerId = nonEmptyString(value.reviewerId);
  const reviewedAt = validTime(value.reviewedAt);
  const reviewPackage = readArtifactBinding(value.reviewPackage);
  const reviewResponse = readArtifactBinding(value.reviewResponse);
  const assessment = readAssessment(value.assessment);
  if (
    !id ||
    !recordedAt ||
    !runId ||
    !snapshotId ||
    !policyId ||
    !reviewerId ||
    !reviewedAt ||
    !reviewPackage ||
    !reviewResponse ||
    policyId !== policy.policyId
  ) {
    return err("INVALID_REVIEW_RESPONSE");
  }
  if (!assessment) {
    return err("INVALID_ASSESSMENT");
  }

  const verdicts: ReviewVerdictEntry[] = [];
  for (const entry of value.verdicts) {
    if (
      !isRecord(entry) ||
      !hasAllowedKeys(entry, [
        "observationId",
        "verdict",
        "note",
        "duplicateOf",
        "correctedIrIds"
      ])
    ) {
      return err("INVALID_REVIEW_RESPONSE");
    }
    const observationIdValue = nonEmptyString(entry.observationId);
    const verdict = policy.reviewVerdicts.includes(entry.verdict as ReviewVerdict)
      ? (entry.verdict as ReviewVerdict)
      : undefined;
    if (!observationIdValue || !verdict) {
      return err("INVALID_REVIEW_RESPONSE");
    }
    const verdictEntry: ReviewVerdictEntry = {
      observationId: observationIdValue,
      verdict
    };
    const note = entry.note === undefined ? undefined : boundedString(entry.note, 1_000);
    if (entry.note !== undefined && !note) {
      return err("INVALID_REVIEW_RESPONSE");
    }
    if (note) {
      verdictEntry.note = note;
    }
    if (verdict === "duplicate") {
      const duplicateOf = nonEmptyString(entry.duplicateOf);
      if (!duplicateOf) {
        return err("INVALID_DUPLICATE_REFERENCE");
      }
      verdictEntry.duplicateOf = duplicateOf;
    } else if (entry.duplicateOf !== undefined) {
      return err("INVALID_DUPLICATE_REFERENCE");
    }
    if (entry.correctedIrIds !== undefined) {
      if (verdict !== "supported" || !Array.isArray(entry.correctedIrIds)) {
        return err("INVALID_CORRECTED_TAGS");
      }
      const corrected = entry.correctedIrIds.map((item) => nonEmptyString(item));
      if (
        !corrected.every((item): item is string => item !== undefined) ||
        new Set(corrected).size !== corrected.length
      ) {
        return err("INVALID_CORRECTED_TAGS");
      }
      verdictEntry.correctedIrIds = corrected;
    }
    verdicts.push(verdictEntry);
  }

  const humanObservations: Observation[] = [];
  for (const entry of value.humanObservations) {
    const observation = validateObservation(entry, policy);
    if (!observation.ok || observation.value.origin !== "human") {
      return err("INVALID_HUMAN_OBSERVATION");
    }
    humanObservations.push(observation.value);
  }

  const irReview: IRReviewEntry[] = [];
  for (const entry of value.irReview) {
    if (!isRecord(entry) || !hasAllowedKeys(entry, ["irId", "disposition", "note"])) {
      return err("INVALID_IR_REVIEW");
    }
    const irId = nonEmptyString(entry.irId);
    const disposition = policy.dispositions.includes(entry.disposition as Disposition)
      ? (entry.disposition as Disposition)
      : undefined;
    if (!irId || !disposition) {
      return err("INVALID_IR_REVIEW");
    }
    const note = entry.note === undefined ? undefined : boundedString(entry.note, 1_000);
    if (entry.note !== undefined && !note) {
      return err("INVALID_IR_REVIEW");
    }
    if (disposition !== "covered" && !note) {
      return err("MISSING_IR_REVIEW_NOTE");
    }
    const reviewEntry: IRReviewEntry = { irId, disposition };
    if (note) {
      reviewEntry.note = note;
    }
    irReview.push(reviewEntry);
  }

  return ok({
    schemaVersion: REVIEW_RECORD_SCHEMA_VERSION,
    id,
    recordedAt,
    runId,
    snapshotId,
    policyId,
    reviewerId,
    reviewedAt,
    reviewPackage,
    reviewResponse,
    verdicts,
    humanObservations,
    irReview,
    assessment
  });
};
