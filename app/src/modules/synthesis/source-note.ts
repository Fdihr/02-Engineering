import { err, ok, type Result } from "../../core/result.js";
import {
  SOURCE_NOTE_SCHEMA_VERSION,
  type Disposition,
  type SourceNote
} from "../assurance/types.js";
import {
  isRecord,
  nonEmptyString,
  readArtifactBinding,
  validTime
} from "../assurance/validators.js";

export type SynthesisSourceNoteError = "INVALID_SOURCE_NOTE";

const DISPOSITIONS: Disposition[] = [
  "covered",
  "partial",
  "silent",
  "contradicted"
];

const hasCompleteLineage = (value: unknown): boolean => {
  if (!isRecord(value)) {
    return false;
  }
  return [
    "snapshot",
    "evidenceDecision",
    "researchQuestion",
    "sourceDocument",
    "requirements",
    "policy",
    "extractCommit",
    "reviewPackage",
    "reviewResponse",
    "reviewRecord"
  ].every((key) => readArtifactBinding(value[key]) !== undefined) &&
    isRecord(value.contract) &&
    isRecord(value.invocation);
};

export const validateSynthesisSourceNote = (
  value: unknown
): Result<SourceNote, SynthesisSourceNoteError> => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== SOURCE_NOTE_SCHEMA_VERSION ||
    !nonEmptyString(value.id) ||
    !validTime(value.assembledAt) ||
    !nonEmptyString(value.runId) ||
    !nonEmptyString(value.snapshotId) ||
    !nonEmptyString(value.candidateId) ||
    !nonEmptyString(value.researchQuestionId) ||
    !nonEmptyString(value.sourceDocumentId) ||
    (value.reviewStatus !== "provisional" &&
      value.reviewStatus !== "reviewed" &&
      value.reviewStatus !== "synthetic") ||
    !hasCompleteLineage(value.lineage) ||
    !isRecord(value.sourceIdentity) ||
    (value.sourceIdentity.kind !== "publisher" &&
      value.sourceIdentity.kind !== "unknown") ||
    (value.sourceIdentity.kind === "publisher" &&
      !nonEmptyString(value.sourceIdentity.publisherHost)) ||
    !Array.isArray(value.inScopeObservations) ||
    !Array.isArray(value.outOfIrObservations) ||
    !Array.isArray(value.rejectedObservations) ||
    !Array.isArray(value.irDispositions) ||
    !Array.isArray(value.attributionSummary) ||
    !Array.isArray(value.caveats) ||
    !value.caveats.every((entry) => nonEmptyString(entry) !== undefined) ||
    !Array.isArray(value.gaps)
  ) {
    return err("INVALID_SOURCE_NOTE");
  }

  const reviewed = value.reviewStatus === "reviewed";
  const provisional = value.reviewStatus === "provisional";
  const synthetic = value.reviewStatus === "synthetic";
  const observations = [
    ...value.inScopeObservations,
    ...value.outOfIrObservations
  ];
  for (const observation of observations) {
    if (
      !isRecord(observation) ||
      !nonEmptyString(observation.observationId) ||
      !nonEmptyString(observation.text) ||
      !nonEmptyString(observation.segmentId) ||
      !Array.isArray(observation.irIds) ||
      !observation.irIds.every((entry) => nonEmptyString(entry) !== undefined) ||
      !isRecord(observation.attribution) ||
      (observation.reviewVerdict !== "supported" &&
        observation.reviewVerdict !== "unreviewed") ||
      (reviewed
        ? observation.reviewVerdict !== "supported"
        : observation.reviewVerdict !== "unreviewed")
    ) {
      return err("INVALID_SOURCE_NOTE");
    }
  }

  for (const disposition of value.irDispositions) {
    if (
      !isRecord(disposition) ||
      !nonEmptyString(disposition.irId) ||
      !DISPOSITIONS.includes(disposition.modelDisposition as Disposition) ||
      (!reviewed
        ? disposition.humanDisposition !== null || disposition.finalDisposition !== null
        : !DISPOSITIONS.includes(disposition.humanDisposition as Disposition) ||
          !DISPOSITIONS.includes(disposition.finalDisposition as Disposition))
    ) {
      return err("INVALID_SOURCE_NOTE");
    }
  }

  if (
    !reviewed
      ? !isRecord(value.assessment) ||
        value.assessment.status !== "not-assessed" ||
        (provisional &&
          !value.caveats.includes(
            "Observations not reviewed by a human; evidence in this note is provisional."
          )) ||
        (synthetic &&
          !value.caveats.some((entry) =>
            String(entry).startsWith("Synthetic source note")
          )) ||
        value.supersedesNoteId !== undefined
      : !isRecord(value.assessment) ||
        value.assessment.status === "not-assessed" ||
        (value.supersedesNoteId !== undefined &&
          !nonEmptyString(value.supersedesNoteId))
  ) {
    return err("INVALID_SOURCE_NOTE");
  }

  return ok(value as SourceNote);
};