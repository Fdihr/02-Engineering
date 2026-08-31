import type {
  EvidenceCandidate,
  RetrievedSourceEvidenceCandidate
} from "../../core/types.js";
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
  | "RAW_ARTIFACT_SHA256_MISMATCH"
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

const sha256 = (value: unknown): string | undefined => {
  const normalized = nonEmptyString(value)?.toLowerCase();
  return normalized && /^[a-f0-9]{64}$/.test(normalized) ? normalized : undefined;
};

const readRetrievedSourceCandidate = (
  value: Record<string, unknown>
): Result<RetrievedSourceEvidenceCandidate, EvidenceReviewError> => {
  const providerItemId = nonEmptyString(value.providerItemId);
  const retrievedAt = nonEmptyString(value.retrievedAt);
  const rawArtifactRef = nonEmptyString(value.rawArtifactRef);
  const sourceLinks = stringArray(value.sourceLinks);
  const limitations = stringArray(value.limitations);
  const researchQuestionResult = validateApprovedResearchQuestion(
    value.researchQuestion,
    retrievedAt ?? ""
  );
  if (!researchQuestionResult.ok) {
    return researchQuestionResult;
  }
  if (
    !providerItemId ||
    !retrievedAt ||
    Number.isNaN(Date.parse(retrievedAt)) ||
    !rawArtifactRef ||
    !sourceLinks ||
    !limitations ||
    value.endpoint !== "https://api.firecrawl.dev/v2/scrape" ||
    value.sourceType !== "publisher_source" ||
    value.referenceCount !== 1 ||
    value.hasSourceMetadata !== true ||
    value.contentCompleteness !== "captured_content" ||
    !isRecord(value.source) ||
    !isRecord(value.retrievalLineage) ||
    !isRecord(value.analystAssessment)
  ) {
    return err("INVALID_INTAKE_ARTIFACT");
  }

  const requestedUrl = nonEmptyString(value.source.requestedUrl);
  const finalUrl = nonEmptyString(value.source.finalUrl);
  const publisherHost = nonEmptyString(value.source.publisherHost);
  const retrievalId = nonEmptyString(value.retrievalLineage.retrievalId);
  const sourceLeadProviderItemId = nonEmptyString(
    value.retrievalLineage.sourceLeadProviderItemId
  );
  const sourceIntakeArtifactRef = nonEmptyString(
    value.retrievalLineage.sourceIntakeArtifactRef
  );
  const retrievalArtifactRef = nonEmptyString(
    value.retrievalLineage.retrievalArtifactRef
  );
  const requestArtifactRef = nonEmptyString(value.retrievalLineage.requestArtifactRef);
  const lineageRawArtifactRef = nonEmptyString(value.retrievalLineage.rawArtifactRef);
  const sourceIntakeArtifactSha256 = sha256(
    value.retrievalLineage.sourceIntakeArtifactSha256
  );
  const retrievalArtifactSha256 = sha256(
    value.retrievalLineage.retrievalArtifactSha256
  );
  const requestArtifactSha256 = sha256(value.retrievalLineage.requestArtifactSha256);
  const rawArtifactSha256 = sha256(value.retrievalLineage.rawArtifactSha256);
  const analystId = nonEmptyString(value.analystAssessment.analystId);
  const assessedAt = nonEmptyString(value.analystAssessment.assessedAt);
  const researchQuestionId = nonEmptyString(
    value.analystAssessment.researchQuestionId
  );
  const relevanceToQuestion = nonEmptyString(
    value.analystAssessment.relevanceToQuestion
  );
  if (
    !requestedUrl ||
    !finalUrl ||
    !publisherHost ||
    !sourceLinks.includes(requestedUrl) ||
    !sourceLinks.includes(finalUrl) ||
    !retrievalId ||
    !sourceLeadProviderItemId ||
    !sourceIntakeArtifactRef ||
    !sourceIntakeArtifactSha256 ||
    !retrievalArtifactRef ||
    !retrievalArtifactSha256 ||
    !requestArtifactRef ||
    !requestArtifactSha256 ||
    !lineageRawArtifactRef ||
    lineageRawArtifactRef !== rawArtifactRef ||
    !rawArtifactSha256 ||
    value.analystAssessment.actorType !== "human" ||
    !analystId ||
    !assessedAt ||
    Number.isNaN(Date.parse(assessedAt)) ||
    Date.parse(assessedAt) < Date.parse(retrievedAt) ||
    researchQuestionId !== researchQuestionResult.value.id ||
    !relevanceToQuestion
  ) {
    return err("INVALID_INTAKE_ARTIFACT");
  }

  return ok({
    provider: "source_retrieval",
    endpoint: "https://api.firecrawl.dev/v2/scrape",
    providerItemId,
    sourceType: "publisher_source",
    retrievedAt,
    rawArtifactRef,
    sourceLinks,
    referenceCount: 1,
    hasSourceMetadata: true,
    researchQuestion: researchQuestionResult.value,
    role: "evidence_candidate",
    contentCompleteness: "captured_content",
    source: {
      requestedUrl,
      finalUrl,
      publisherHost,
      title: nonEmptyString(value.source.title)
    },
    retrievalLineage: {
      retrievalId,
      sourceLeadProviderItemId,
      sourceIntakeArtifactRef,
      sourceIntakeArtifactSha256,
      retrievalArtifactRef,
      retrievalArtifactSha256,
      requestArtifactRef,
      requestArtifactSha256,
      rawArtifactRef,
      rawArtifactSha256
    },
    analystAssessment: {
      actorType: "human",
      analystId,
      assessedAt,
      researchQuestionId,
      relevanceToQuestion
    },
    limitations
  });
};

const readEvidenceCandidate = (
  value: Record<string, unknown>
): Result<EvidenceCandidate, EvidenceReviewError> => {
  if (value.role !== "evidence_candidate") {
    return err("INELIGIBLE_PROVIDER_ROLE");
  }
  if (value.provider === "source_retrieval") {
    return readRetrievedSourceCandidate(value);
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
  if (
    itemResult.value.provider === "source_retrieval" &&
    itemResult.value.retrievalLineage.rawArtifactSha256 !== rawArtifactSha256
  ) {
    return err("RAW_ARTIFACT_SHA256_MISMATCH");
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