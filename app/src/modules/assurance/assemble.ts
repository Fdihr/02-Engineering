import { err, ok, type Result } from "../../core/result.js";
import {
  SOURCE_NOTE_SCHEMA_VERSION,
  type AdmittedSource,
  type ApprovedRequirements,
  type ArtifactBinding,
  type AttributionSummaryEntry,
  type Disposition,
  type ExtractCommit,
  type NoteGap,
  type NoteIRDisposition,
  type NoteObservation,
  type Observation,
  type ProfilePolicy,
  type RejectedObservation,
  type ReviewPackage,
  type ReviewRecord,
  type SourceNote
} from "./types.js";
import { sha256Text, validTime } from "./validators.js";

export type AssembleError =
  | "INVALID_ASSEMBLE_TIME"
  | "POLICY_MISMATCH"
  | "LINEAGE_MISMATCH"
  | "REVIEW_PACKAGE_MISMATCH"
  | "IR_DISPOSITION_UNSUPPORTED"
  | "IR_DISPOSITION_SILENT_WITH_EVIDENCE"
  | "MISSING_MODEL_DISPOSITION"
  | "MISSING_HUMAN_DISPOSITION"
  | "INVALID_SUPERSESSION";

export type AssembleSourceNoteInput = {
  admitted: AdmittedSource;
  commit: ExtractCommit;
  commitArtifact: ArtifactBinding;
  reviewPackage: ReviewPackage;
  reviewRecord: ReviewRecord;
  reviewRecordArtifact: ArtifactBinding;
  supersededNote?: SourceNote;
  requirements: ApprovedRequirements;
  policy: ProfilePolicy;
  assembledAt: string;
};

const sameBinding = (left: ArtifactBinding, right: ArtifactBinding): boolean =>
  left.artifactRef === right.artifactRef &&
  left.artifactSha256 === right.artifactSha256;

export const assembleSourceNote = (
  input: AssembleSourceNoteInput
): Result<SourceNote, AssembleError> => {
  const assembledAt = validTime(input.assembledAt);
  if (!assembledAt) {
    return err("INVALID_ASSEMBLE_TIME");
  }

  const { admitted, commit, reviewPackage, reviewRecord, requirements, policy } = input;
  const provisional = reviewRecord.supportPass === "not-performed";
  if (
    commit.policyId !== policy.policyId ||
    reviewRecord.policyId !== policy.policyId
  ) {
    return err("POLICY_MISMATCH");
  }
  if (
    commit.snapshotId !== admitted.snapshotId ||
    commit.runId !== admitted.runId ||
    commit.sourceDocumentId !== admitted.sourceDocument.id ||
    commit.requirementsApprovalId !== requirements.approvalId ||
    !sameBinding(commit.lineage.snapshot, admitted.snapshot) ||
    !sameBinding(commit.lineage.evidenceDecision, admitted.evidenceDecision) ||
    !sameBinding(commit.lineage.sourceDocument, admitted.sourceDocumentArtifact)
  ) {
    return err("LINEAGE_MISMATCH");
  }
  if (
    reviewPackage.snapshotId !== commit.snapshotId ||
    reviewPackage.sourceDocumentId !== commit.sourceDocumentId ||
    !sameBinding(reviewPackage.extractCommit, input.commitArtifact) ||
    reviewRecord.snapshotId !== reviewPackage.snapshotId
  ) {
    return err("REVIEW_PACKAGE_MISMATCH");
  }
  if (
    (provisional && input.supersededNote) ||
    (input.supersededNote &&
      (input.supersededNote.reviewStatus !== "provisional" ||
        input.supersededNote.snapshotId !== admitted.snapshotId ||
        input.supersededNote.runId !== admitted.runId ||
        input.supersededNote.candidateId !== admitted.candidateId))
  ) {
    return err("INVALID_SUPERSESSION");
  }

  const verdictByObservation = new Map(
    reviewRecord.verdicts.map((entry) => [entry.observationId, entry])
  );

  const acceptedModelObservations: NoteObservation[] = [];
  const rejectedObservations: RejectedObservation[] = [];
  for (const observation of reviewPackage.observations) {
    const verdict = verdictByObservation.get(observation.observationId);
    if (!verdict) {
      return err("REVIEW_PACKAGE_MISMATCH");
    }
    if (verdict.verdict === "unreviewed") {
      if (!provisional) {
        return err("REVIEW_PACKAGE_MISMATCH");
      }
      const { extractIndexes: _indexes, occurrences: _occurrences, ...unreviewed } =
        observation;
      acceptedModelObservations.push({
        ...unreviewed,
        reviewVerdict: "unreviewed"
      });
      continue;
    }
    if (verdict.verdict === "supported") {
      if (provisional) {
        return err("REVIEW_PACKAGE_MISMATCH");
      }
      const { extractIndexes: _indexes, occurrences: _occurrences, ...accepted } =
        observation;
      acceptedModelObservations.push(
        verdict.correctedIrIds
          ? {
              ...accepted,
              correctedIrIds: verdict.correctedIrIds,
              reviewVerdict: "supported"
            }
          : { ...accepted, reviewVerdict: "supported" }
      );
      continue;
    }
    const rejected: RejectedObservation = {
      observationId: observation.observationId,
      verdict: verdict.verdict
    };
    if (verdict.note) {
      rejected.note = verdict.note;
    }
    if (verdict.duplicateOf) {
      rejected.duplicateOf = verdict.duplicateOf;
    }
    rejectedObservations.push(rejected);
  }

  const accepted: NoteObservation[] = [
    ...acceptedModelObservations,
    ...reviewRecord.humanObservations.map((observation) => ({
      ...observation,
      reviewVerdict: "supported" as const
    }))
  ];
  const effectiveTags = (observation: Observation): string[] =>
    observation.correctedIrIds ?? observation.irIds;
  const inScopeObservations = accepted.filter(
    (entry) => effectiveTags(entry).length > 0
  );
  const outOfIrObservations = accepted.filter(
    (entry) => effectiveTags(entry).length === 0
  );

  const modelDispositionByIr = new Map(
    reviewPackage.modelDispositions.map((entry) => [entry.irId, entry])
  );
  const humanDispositionByIr = new Map(
    reviewRecord.irReview.map((entry) => [entry.irId, entry])
  );

  const irDispositions: NoteIRDisposition[] = [];
  const gaps: NoteGap[] = [];
  const contradictedIrIds: string[] = [];
  for (const requirement of requirements.requirements) {
    const model = modelDispositionByIr.get(requirement.irId);
    const human = humanDispositionByIr.get(requirement.irId);
    if (!model) {
      return err("MISSING_MODEL_DISPOSITION");
    }
    if (!provisional && !human) {
      return err("MISSING_HUMAN_DISPOSITION");
    }

    const observationIds = accepted
      .filter((entry) => effectiveTags(entry).includes(requirement.irId))
      .map((entry) => entry.observationId);
    const finalDisposition: Disposition | null = human?.disposition ?? null;
    if (!provisional && finalDisposition === "silent" && observationIds.length > 0) {
      return err("IR_DISPOSITION_SILENT_WITH_EVIDENCE");
    }
    if (!provisional && finalDisposition !== "silent" && observationIds.length === 0) {
      return err("IR_DISPOSITION_UNSUPPORTED");
    }

    const entry: NoteIRDisposition = {
      irId: requirement.irId,
      modelDisposition: model.disposition,
      humanDisposition: human?.disposition ?? null,
      finalDisposition,
      observationIds
    };
    if (human?.note) {
      entry.note = human.note;
    }
    irDispositions.push(entry);

    const gapDisposition = finalDisposition ?? model.disposition;
    if (gapDisposition === "partial" || gapDisposition === "silent") {
      const gap: NoteGap = { irId: requirement.irId, disposition: gapDisposition };
      if (human?.note) {
        gap.note = human.note;
      }
      gaps.push(gap);
    }
    if (!provisional && finalDisposition === "contradicted") {
      contradictedIrIds.push(requirement.irId);
    }
  }

  const summary = new Map<string, AttributionSummaryEntry>();
  for (const observation of accepted) {
    const key = `${observation.attribution.kind}\u001f${
      observation.attribution.attributedTo ?? ""
    }`;
    const existing = summary.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    const entry: AttributionSummaryEntry = {
      kind: observation.attribution.kind,
      count: 1
    };
    if (observation.attribution.attributedTo) {
      entry.attributedTo = observation.attribution.attributedTo;
    }
    summary.set(key, entry);
  }
  const attributionSummary = [...summary.values()].sort(
    (left, right) =>
      right.count - left.count ||
      left.kind.localeCompare(right.kind) ||
      (left.attributedTo ?? "").localeCompare(right.attributedTo ?? "")
  );

  const caveats = [
    ...admitted.sourceLimitations,
    ...(reviewRecord.assessment && "limitations" in reviewRecord.assessment
      ? reviewRecord.assessment.limitations
      : []),
    ...contradictedIrIds.map(
      (irId) => `The source contradicts the presupposition of ${irId}.`
    ),
    ...attributionSummary
      .filter((entry) => entry.kind === "relayed" && entry.attributedTo)
      .map(
        (entry) =>
          `${entry.count} accepted observations are relayed from ${entry.attributedTo}.`
      ),
    "A fresh model session per attempt is a human attestation and is not technically enforced.",
    "Source assurance covers this single source only; corroboration and confidence are assigned later."
  ];
  const normalisedMatches = accepted.filter(
    (entry) => entry.matchedVia !== "exact"
  ).length;
  if (normalisedMatches > 0) {
    caveats.push(
      `${normalisedMatches} accepted observations were located under policy ${policy.policyId} quote-match rules; every stored anchor remains byte-exact against the canonical segment.`
    );
  }
  if (provisional) {
    caveats.push(
      "Observations not reviewed by a human; evidence in this note is provisional."
    );
  } else if (reviewRecord.omissionPass === "not-performed") {
    caveats.push(
      "No omission pass was performed: the coverage picture is the model's alone and may miss source material relevant to an approved requirement."
    );
  }
  if (!provisional && reviewRecord.irReviewBasis === "rows-only") {
    caveats.push(
      "Requirement dispositions were judged from the extracted observations alone, not from a fresh reading of the source, so a requirement wrongly recorded as silent would not have been detected."
    );
  }
  if (
    "dependency" in reviewRecord.assessment &&
    reviewRecord.assessment.dependency.kind !== "original"
  ) {
    caveats.push(
      `Reporting dependency is ${
        reviewRecord.assessment.dependency.kind
      }: ${reviewRecord.assessment.dependency.upstreamSources.join(", ")}.`
    );
  }

  return ok({
    schemaVersion: SOURCE_NOTE_SCHEMA_VERSION,
    id: `source-note-${sha256Text(
      `${admitted.snapshotId}\u001f${reviewRecord.id}`
    ).slice(0, 32)}`,
    assembledAt,
    runId: admitted.runId,
    snapshotId: admitted.snapshotId,
    sourceDecisionId: admitted.sourceDecisionId,
    candidateId: admitted.candidateId,
    researchQuestionId: admitted.researchQuestion.id,
    sourceDocumentId: admitted.sourceDocument.id,
    sourceIdentity: admitted.sourceIdentity,
    reviewStatus: provisional ? "provisional" : "reviewed",
    ...(input.supersededNote
      ? { supersedesNoteId: input.supersededNote.id }
      : {}),
    lineage: {
      ...commit.lineage,
      contract: commit.contract,
      extractCommit: input.commitArtifact,
      reviewPackage: reviewRecord.reviewPackage,
      reviewResponse: reviewRecord.reviewResponse,
      reviewRecord: input.reviewRecordArtifact,
      invocation: commit.invocation
    },
    inScopeObservations,
    outOfIrObservations,
    rejectedObservations,
    irDispositions,
    assessment: reviewRecord.assessment,
    attributionSummary,
    caveats,
    gaps
  });
};
