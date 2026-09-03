import type {
  ApprovedEvidenceSnapshot,
  EvidenceAdmissionDecision,
  EvidenceReviewEvent,
  EvidenceReviewOutput,
  RetrievedSourceEvidenceCandidate
} from "../core/types.js";
import { err, ok, type Result } from "../core/result.js";
import type { AdmissionPolicy } from "../modules/assurance/types.js";
import {
  validateEvidenceReview,
  type EvidenceReviewError,
  type EvidenceReviewRequest
} from "../modules/approval/evidence-approval.js";
import {
  createOpenExceptionItem,
  type ExceptionItem
} from "../modules/exceptions/exception-item.js";
import { reviewEvidence } from "./review-evidence.js";

export type ControllerAdmissionRequest = Omit<
  EvidenceReviewRequest,
  "reviewerId" | "decision" | "reason"
> & {
  readiness: "ready" | "qualified" | "not-ready";
  anchorsCodeValidated: boolean;
  synthetic: boolean;
  withinBudget: boolean;
};

export type PolicyAdmissionRequest =
  | {
      policy: AdmissionPolicy;
      humanReview: EvidenceReviewRequest;
      controller?: never;
    }
  | {
      policy: AdmissionPolicy;
      humanReview?: never;
      controller: ControllerAdmissionRequest;
    };

export type PolicyAdmissionOutput =
  | EvidenceReviewOutput
  | { outcome: "exception"; exception: ExceptionItem };

export type PolicyAdmissionError =
  | EvidenceReviewError
  | "ADMISSION_MODE_MISMATCH"
  | "CONTROLLER_ADMISSION_CHECK_FAILED"
  | "CONTROLLER_ADMISSION_REQUIRES_RELEVANT"
  | "INVALID_ADMISSION_EXCEPTION";

const retrievedCandidate = (
  item: unknown
): item is RetrievedSourceEvidenceCandidate =>
  typeof item === "object" &&
  item !== null &&
  "provider" in item &&
  item.provider === "source_retrieval";

export const admitEvidenceUnderPolicy = (
  input: PolicyAdmissionRequest
): Result<PolicyAdmissionOutput, PolicyAdmissionError> => {
  if (input.policy.mode === "human") {
    if (!input.humanReview) {
      return err("ADMISSION_MODE_MISMATCH");
    }
    return reviewEvidence(input.humanReview);
  }
  if (!input.controller) {
    return err("ADMISSION_MODE_MISMATCH");
  }

  const request = input.controller;
  const actorId = `controller:${input.policy.policyId}`;
  const reason = `Admitted under ${input.policy.policyId} v${input.policy.version}.`;
  const validated = validateEvidenceReview({
    decisionId: request.decisionId,
    reviewerId: actorId,
    decidedAt: request.decidedAt,
    decision: "approved",
    reason,
    intakeArtifactRef: request.intakeArtifactRef,
    rawArtifactSha256: request.rawArtifactSha256,
    ...(request.questionRelevanceArtifacts
      ? { questionRelevanceArtifacts: request.questionRelevanceArtifacts }
      : {}),
    intake: request.intake
  });
  if (!validated.ok) {
    return err(validated.error);
  }
  if (!retrievedCandidate(validated.value.item)) {
    return err("CONTROLLER_ADMISSION_CHECK_FAILED");
  }

  const relevance = validated.value.item.questionRelevance.assessment.verdict;
  if (relevance === "partially-relevant") {
    const exception = createOpenExceptionItem({
      kind: "uncertain-relevance",
      runId: validated.value.sourceRunId,
      refs: [
        {
          artifactRef:
            validated.value.item.questionRelevance.assessmentArtifactRef,
          artifactSha256:
            validated.value.item.questionRelevance.assessmentArtifactSha256
        },
        {
          artifactRef: validated.value.item.questionRelevance.decisionArtifactRef,
          artifactSha256:
            validated.value.item.questionRelevance.decisionArtifactSha256
        }
      ],
      raisedAt: request.decidedAt
    });
    return exception.ok
      ? ok({ outcome: "exception", exception: exception.value })
      : err("INVALID_ADMISSION_EXCEPTION");
  }
  if (relevance !== input.policy.autoAdmit.relevance) {
    return err("CONTROLLER_ADMISSION_REQUIRES_RELEVANT");
  }
  if (
    !request.anchorsCodeValidated ||
    request.readiness === "not-ready" ||
    !input.policy.autoAdmit.readiness.includes(request.readiness) ||
    request.synthetic ||
    !request.withinBudget
  ) {
    return err("CONTROLLER_ADMISSION_CHECK_FAILED");
  }

  const decision: EvidenceAdmissionDecision = {
    id: request.decisionId,
    sourceRunId: validated.value.sourceRunId,
    providerItemId: validated.value.item.providerItemId,
    reviewerId: actorId,
    decidedAt: request.decidedAt,
    decision: "approved",
    reason,
    intakeArtifactRef: request.intakeArtifactRef
  };
  const snapshot: ApprovedEvidenceSnapshot = {
    snapshotId: `snapshot-${request.decisionId}`,
    sourceDecisionId: request.decisionId,
    sourceRunId: validated.value.sourceRunId,
    providerItemId: validated.value.item.providerItemId,
    admittedBy: actorId,
    admittedAt: request.decidedAt,
    intakeArtifactRef: request.intakeArtifactRef,
    rawArtifactRef: validated.value.item.rawArtifactRef,
    rawArtifactSha256: request.rawArtifactSha256,
    item: validated.value.item
  };
  const event: EvidenceReviewEvent = {
    decisionId: request.decisionId,
    sourceRunId: validated.value.sourceRunId,
    occurredAt: request.decidedAt,
    actorType: "controller",
    actorId,
    stage: "evidence_admission",
    eventType: "evidence.admission.approved",
    status: "completed",
    intakeArtifactRef: request.intakeArtifactRef,
    snapshotId: snapshot.snapshotId
  };
  return ok({ outcome: "approved", decision, snapshot, event });
};