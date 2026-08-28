import type { EvidenceCandidate } from "../../core/types.js";
import { err, ok, type Result } from "../../core/result.js";
import {
  validateApprovedResearchQuestion,
  type ResearchQuestionError
} from "../research/research-question.js";

export type EvidenceReviewError =
  | "INVALID_REVIEW_INPUT"
  | "MISSING_DECISION_ID"
  | "MISSING_REVIEWER_ID"
  | "INVALID_DECIDED_AT"
  | "INVALID_HUMAN_DECISION"
  | "MISSING_DECISION_REASON"
  | "MISSING_INTAKE_ARTIFACT_REF"
  | "INVALID_RAW_ARTIFACT_SHA256"
  | "INVALID_INTAKE_ARTIFACT"
  | "INELIGIBLE_PROVIDER_ROLE"
  | "INELIGIBLE_ROUTE"
  | "NOT_PENDING_HUMAN_REVIEW"
  | "PROVIDER_ITEM_ID_MISMATCH"
  | ResearchQuestionError;

export type EvidenceReviewRequest = {
  decisionId: string;
  reviewerId: string;
  decidedAt: string;
  decision: "approved" | "rejected";
  reason: string;
  intakeArtifactRef: string;
  rawArtifactSha256: string;
  intake: unknown;
};

export type ValidatedEvidenceReview = Omit<EvidenceReviewRequest, "intake"> & {
  sourceRunId: string;
  item: EvidenceCandidate;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const stringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((entry) => typeof entry === "string")
    ? value
    : undefined;

const readEvidenceCandidate = (
  value: Record<string, unknown>
): Result<EvidenceCandidate, EvidenceReviewError> => {
  if (value.role !== "evidence_candidate") {
    return err("INELIGIBLE_PROVIDER_ROLE");
  }

  const providerItemId = nonEmptyString(value.providerItemId);
  const endpoint = nonEmptyString(value.endpoint);
  const retrievedAt = nonEmptyString(value.retrievedAt);
  const rawArtifactRef = nonEmptyString(value.rawArtifactRef);
  const sourceLinks = stringArray(value.sourceLinks);
  const researchQuestionResult = validateApprovedResearchQuestion(
    value.researchQuestion,
    retrievedAt ?? ""
  );
  if (!researchQuestionResult.ok) {
    return researchQuestionResult;
  }
  if (
    value.provider !== "seerist" ||
    !providerItemId ||
    !endpoint ||
    !retrievedAt ||
    !rawArtifactRef ||
    !sourceLinks ||
    typeof value.referenceCount !== "number" ||
    !Number.isInteger(value.referenceCount) ||
    value.referenceCount < 0 ||
    typeof value.hasSourceMetadata !== "boolean" ||
    value.contentCompleteness !== "captured_content"
  ) {
    return err("INVALID_INTAKE_ARTIFACT");
  }

  return ok({
    provider: "seerist",
    endpoint,
    providerItemId,
    sourceType: nonEmptyString(value.sourceType),
    providerTimestamp: nonEmptyString(value.providerTimestamp),
    retrievedAt,
    rawArtifactRef,
    sourceLinks,
    referenceCount: value.referenceCount,
    hasSourceMetadata: value.hasSourceMetadata,
    researchQuestion: researchQuestionResult.value,
    role: "evidence_candidate",
    contentCompleteness: "captured_content"
  });
};

export const validateEvidenceReview = (
  input: unknown
): Result<ValidatedEvidenceReview, EvidenceReviewError> => {
  if (!isRecord(input)) {
    return err("INVALID_REVIEW_INPUT");
  }

  const decisionId = nonEmptyString(input.decisionId);
  if (!decisionId) {
    return err("MISSING_DECISION_ID");
  }
  const reviewerId = nonEmptyString(input.reviewerId);
  if (!reviewerId) {
    return err("MISSING_REVIEWER_ID");
  }
  const decidedAt = nonEmptyString(input.decidedAt);
  if (!decidedAt || Number.isNaN(Date.parse(decidedAt))) {
    return err("INVALID_DECIDED_AT");
  }
  if (input.decision !== "approved" && input.decision !== "rejected") {
    return err("INVALID_HUMAN_DECISION");
  }
  const reason = nonEmptyString(input.reason);
  if (!reason) {
    return err("MISSING_DECISION_REASON");
  }
  const intakeArtifactRef = nonEmptyString(input.intakeArtifactRef);
  if (!intakeArtifactRef) {
    return err("MISSING_INTAKE_ARTIFACT_REF");
  }
  const rawArtifactSha256 = nonEmptyString(input.rawArtifactSha256)?.toLowerCase();
  if (!rawArtifactSha256 || !/^[a-f0-9]{64}$/.test(rawArtifactSha256)) {
    return err("INVALID_RAW_ARTIFACT_SHA256");
  }
  if (!isRecord(input.intake)) {
    return err("INVALID_INTAKE_ARTIFACT");
  }

  const itemValue = input.intake.item;
  const routeValue = input.intake.decision;
  const ledgerValue = input.intake.ledgerEntry;
  if (!isRecord(itemValue) || !isRecord(routeValue) || !isRecord(ledgerValue)) {
    return err("INVALID_INTAKE_ARTIFACT");
  }

  const itemResult = readEvidenceCandidate(itemValue);
  if (!itemResult.ok) {
    return itemResult;
  }
  if (routeValue.role !== "evidence_candidate" || routeValue.destination !== "human_review") {
    return err("INELIGIBLE_ROUTE");
  }
  if (routeValue.approvalStatus !== "pending_human_review") {
    return err("NOT_PENDING_HUMAN_REVIEW");
  }

  const routeProviderItemId = nonEmptyString(routeValue.providerItemId);
  if (routeProviderItemId !== itemResult.value.providerItemId) {
    return err("PROVIDER_ITEM_ID_MISMATCH");
  }

  const sourceRunId = nonEmptyString(ledgerValue.runId);
  if (
    !sourceRunId ||
    ledgerValue.eventType !== "intake.item.routed" ||
    ledgerValue.status !== "completed"
  ) {
    return err("INVALID_INTAKE_ARTIFACT");
  }

  return ok({
    decisionId,
    reviewerId,
    decidedAt,
    decision: input.decision,
    reason,
    intakeArtifactRef,
    rawArtifactSha256,
    sourceRunId,
    item: itemResult.value
  });
};