import type {
  ApprovedEvidenceSnapshot,
  EvidenceAdmissionDecision,
  EvidenceReviewEvent,
  EvidenceReviewOutput
} from "../core/types.js";
import { err, ok, type Result } from "../core/result.js";
import {
  validateEvidenceReview,
  type EvidenceReviewError,
  type EvidenceReviewRequest
} from "../modules/approval/evidence-approval.js";

export const reviewEvidence = (
  input: EvidenceReviewRequest
): Result<EvidenceReviewOutput, EvidenceReviewError> => {
  const validated = validateEvidenceReview(input);
  if (!validated.ok) {
    return err(validated.error);
  }

  const review = validated.value;
  const decision: EvidenceAdmissionDecision = {
    id: review.decisionId,
    sourceRunId: review.sourceRunId,
    providerItemId: review.item.providerItemId,
    reviewerId: review.reviewerId,
    decidedAt: review.decidedAt,
    decision: review.decision,
    reason: review.reason,
    intakeArtifactRef: review.intakeArtifactRef
  };
  const baseEvent = {
    decisionId: review.decisionId,
    sourceRunId: review.sourceRunId,
    occurredAt: review.decidedAt,
    actorType: "human" as const,
    actorId: review.reviewerId,
    stage: "evidence_admission" as const,
    status: "completed" as const,
    intakeArtifactRef: review.intakeArtifactRef
  };

  if (review.decision === "rejected") {
    const event: EvidenceReviewEvent = {
      ...baseEvent,
      eventType: "evidence.admission.rejected"
    };
    return ok({
      outcome: "rejected",
      decision,
      event
    });
  }
  if (review.decision === "revision_requested") {
    const event: EvidenceReviewEvent = {
      ...baseEvent,
      eventType: "evidence.admission.revision_requested"
    };
    return ok({
      outcome: "revision_requested",
      decision,
      event
    });
  }

  const snapshot: ApprovedEvidenceSnapshot = {
    snapshotId: `snapshot-${review.decisionId}`,
    sourceDecisionId: review.decisionId,
    sourceRunId: review.sourceRunId,
    providerItemId: review.item.providerItemId,
    admittedBy: review.reviewerId,
    admittedAt: review.decidedAt,
    intakeArtifactRef: review.intakeArtifactRef,
    rawArtifactRef: review.item.rawArtifactRef,
    rawArtifactSha256: review.rawArtifactSha256,
    item: review.item
  };
  const event: EvidenceReviewEvent = {
    ...baseEvent,
    eventType: "evidence.admission.approved",
    snapshotId: snapshot.snapshotId
  };

  return ok({
    outcome: "approved",
    decision,
    snapshot,
    event
  });
};