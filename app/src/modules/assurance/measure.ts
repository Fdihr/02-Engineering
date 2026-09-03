import { err, ok, type Result } from "../../core/result.js";
import {
  ASSURANCE_METRICS_SCHEMA_VERSION,
  SOURCE_NOTE_SCHEMA_VERSION,
  type AssuranceMetrics,
  type CheckFailure,
  type Disposition,
  type ProfilePolicy,
  type QuoteMatchProvenance,
  type ReviewPackage,
  type ReviewRecord
} from "./types.js";
import { isRecord, nonEmptyString, validTime } from "./validators.js";

export type MeasureError =
  | "INVALID_MEASURE_TIME"
  | "REVIEW_RECORD_MISMATCH"
  | "INVALID_SOURCE_NOTE";

/** The narrow view of a committed note that measurement needs. */
export type MeasuredNote = {
  runId: string;
  snapshotId: string;
  irDispositions: Array<{
    irId: string;
    modelDisposition: Disposition;
    humanDisposition: Disposition;
  }>;
  matchedVia: QuoteMatchProvenance[];
};

export const readMeasuredNote = (
  value: unknown,
  policy: ProfilePolicy
): Result<MeasuredNote, MeasureError> => {
  if (
    !isRecord(value) ||
    value.schemaVersion !== SOURCE_NOTE_SCHEMA_VERSION ||
    !Array.isArray(value.irDispositions) ||
    !Array.isArray(value.inScopeObservations) ||
    !Array.isArray(value.outOfIrObservations)
  ) {
    return err("INVALID_SOURCE_NOTE");
  }
  const runId = nonEmptyString(value.runId);
  const snapshotId = nonEmptyString(value.snapshotId);
  if (!runId || !snapshotId) {
    return err("INVALID_SOURCE_NOTE");
  }

  const matchedVia: QuoteMatchProvenance[] = [];
  for (const entry of [
    ...value.inScopeObservations,
    ...value.outOfIrObservations
  ]) {
    if (!isRecord(entry)) {
      return err("INVALID_SOURCE_NOTE");
    }
    if (entry.matchedVia === "exact") {
      matchedVia.push("exact");
      continue;
    }
    if (
      !Array.isArray(entry.matchedVia) ||
      !entry.matchedVia.every((rule) => typeof rule === "string")
    ) {
      return err("INVALID_SOURCE_NOTE");
    }
    matchedVia.push(entry.matchedVia as QuoteMatchProvenance);
  }

  const irDispositions: MeasuredNote["irDispositions"] = [];
  for (const entry of value.irDispositions) {
    if (!isRecord(entry)) {
      return err("INVALID_SOURCE_NOTE");
    }
    const irId = nonEmptyString(entry.irId);
    const modelDisposition = policy.dispositions.includes(
      entry.modelDisposition as Disposition
    )
      ? (entry.modelDisposition as Disposition)
      : undefined;
    const humanDisposition = policy.dispositions.includes(
      entry.humanDisposition as Disposition
    )
      ? (entry.humanDisposition as Disposition)
      : undefined;
    if (!irId || !modelDisposition || !humanDisposition) {
      return err("INVALID_SOURCE_NOTE");
    }
    irDispositions.push({ irId, modelDisposition, humanDisposition });
  }

  return ok({ runId, snapshotId, irDispositions, matchedVia });
};

export type MeasureAssuranceInput = {
  note: MeasuredNote;
  reviewPackage: ReviewPackage;
  reviewRecord: ReviewRecord;
  attemptFailures: CheckFailure[][];
  measuredAt: string;
};

export const measureAssurance = (
  input: MeasureAssuranceInput
): Result<AssuranceMetrics, MeasureError> => {
  const measuredAt = validTime(input.measuredAt);
  if (!measuredAt) {
    return err("INVALID_MEASURE_TIME");
  }
  if (
    input.reviewRecord.snapshotId !== input.note.snapshotId ||
    input.reviewPackage.snapshotId !== input.note.snapshotId
  ) {
    return err("REVIEW_RECORD_MISMATCH");
  }

  const reviewedModelObservations = input.reviewPackage.observations.length;
  const counts = { supported: 0, unsupported: 0, duplicate: 0, chrome: 0 };
  for (const verdict of input.reviewRecord.verdicts) {
    counts[verdict.verdict] += 1;
  }

  const supportDenominator = counts.supported + counts.unsupported;
  const supportFailureRate =
    supportDenominator > 0 ? counts.unsupported / supportDenominator : null;
  const chromeRate =
    reviewedModelObservations > 0 ? counts.chrome / reviewedModelObservations : null;
  const omissionCount = input.reviewRecord.humanObservations.length;

  let total = 0;
  let overclaims = 0;
  let underclaims = 0;
  for (const disposition of input.note.irDispositions) {
    if (disposition.modelDisposition === disposition.humanDisposition) {
      continue;
    }
    total += 1;
    const modelClaimed =
      disposition.modelDisposition === "covered" ||
      disposition.modelDisposition === "partial";
    const humanClaimed =
      disposition.humanDisposition === "covered" ||
      disposition.humanDisposition === "partial";
    if (modelClaimed && disposition.humanDisposition === "silent") {
      overclaims += 1;
    } else if (disposition.modelDisposition === "silent" && humanClaimed) {
      underclaims += 1;
    }
  }

  const quoteFidelityFailures = input.attemptFailures
    .flat()
    .filter((failure) => failure.check === "E3")
    .reduce((sum, failure) => sum + failure.count, 0);

  const ruleCounts: Record<string, number> = {};
  let exact = 0;
  let normalised = 0;
  for (const entry of input.note.matchedVia) {
    if (entry === "exact") {
      exact += 1;
      continue;
    }
    normalised += 1;
    for (const rule of entry) {
      ruleCounts[rule] = (ruleCounts[rule] ?? 0) + 1;
    }
  }

  const proposedTags = new Map(
    input.reviewPackage.observations.map((entry) => [
      entry.observationId,
      entry.irIds.length
    ])
  );
  let tagsProposed = 0;
  let tagsRemoved = 0;
  for (const verdict of input.reviewRecord.verdicts) {
    if (verdict.verdict !== "supported") {
      continue;
    }
    const proposed = proposedTags.get(verdict.observationId) ?? 0;
    tagsProposed += proposed;
    if (verdict.correctedIrIds) {
      tagsRemoved += proposed - verdict.correctedIrIds.length;
    }
  }

  const recommendations: string[] = [];
  if (supportFailureRate !== null && supportFailureRate > 0.1) {
    recommendations.push(
      "Build the bounded semantic support check: the support failure rate exceeds 0.10."
    );
  }
  if (overclaims > 0 || underclaims > 0) {
    recommendations.push(
      "Improve or independently check requirement tagging and coverage: model and human dispositions disagree."
    );
  }
  if (omissionCount >= 2) {
    recommendations.push(
      "Build the blind requirement-driven Sweep stage: the human omission pass found two or more missed observations."
    );
  }
  if (chromeRate !== null && chromeRate > 0.1) {
    recommendations.push(
      "Evaluate an article-only canonicalization path in Panel 1: chrome observations exceed 0.10."
    );
  }
  if (
    quoteFidelityFailures > 0 &&
    input.attemptFailures.length >= 2 &&
    input.attemptFailures.every((failures) => failures.length > 0)
  ) {
    recommendations.push(
      "Evaluate an exact-span locator: quote fidelity failures consumed the attempt budget."
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      "Proceed to the Panel 3 experiment with this source note and its declared limitations."
    );
  }

  return ok({
    schemaVersion: ASSURANCE_METRICS_SCHEMA_VERSION,
    measuredAt,
    runId: input.note.runId,
    snapshotId: input.note.snapshotId,
    reviewedModelObservations,
    supportFailureRate,
    chromeRate,
    omissionCount,
    dispositionMismatches: { total, overclaims, underclaims },
    quoteFidelityFailures,
    transcriptionFidelity: { exact, normalised, ruleCounts },
    tagPrecision: {
      tagsProposed,
      tagsRemoved,
      precision:
        tagsProposed > 0 ? (tagsProposed - tagsRemoved) / tagsProposed : null
    },
    recommendations
  });
};
