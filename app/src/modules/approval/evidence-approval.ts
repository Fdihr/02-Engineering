import { isDeepStrictEqual } from "node:util";
import type {
  ApprovedResearchQuestion,
  EvidenceCandidate,
  RetrievedSourceEvidenceCandidate,
  SeeristCollectionLineage
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
  | "NATIVE_CANDIDATE_REQUIRES_QUESTION_RELEVANCE"
  | "INELIGIBLE_ROUTE"
  | "NOT_PENDING_HUMAN_REVIEW"
  | "PROVIDER_ITEM_ID_MISMATCH"
  | "RAW_ARTIFACT_SHA256_MISMATCH"
  | "QUESTION_RELEVANCE_ARTIFACT_MISMATCH"
  | "RESEARCH_QUESTION_RUN_MISMATCH"
  | ResearchQuestionError;

export type EvidenceReviewRequest = {
  decisionId: string;
  reviewerId: string;
  decidedAt: string;
  decision: "approved" | "rejected";
  reason: string;
  intakeArtifactRef: string;
  rawArtifactSha256: string;
  questionRelevanceArtifacts?: {
    assessmentArtifactSha256: string;
    decisionArtifactSha256: string;
    assessment: unknown;
    decision: unknown;
  };
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

const hasOnlyKeys = (value: Record<string, unknown>, keys: string[]): boolean => {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return (
    actual.length === expected.length &&
    actual.every((key, index) => key === expected[index])
  );
};

const sha256 = (value: unknown): string | undefined => {
  const normalized = nonEmptyString(value)?.toLowerCase();
  return normalized && /^[a-f0-9]{64}$/.test(normalized) ? normalized : undefined;
};

const readSeeristCollectionLineage = (
  value: unknown,
  rawArtifactRef: string,
  rawArtifactSha256: string
): SeeristCollectionLineage | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const operationId = nonEmptyString(value.operationId);
  const requestManifestRef = nonEmptyString(value.requestManifestRef);
  const requestManifestSha256 = sha256(value.requestManifestSha256);
  const responseManifestRef = nonEmptyString(value.responseManifestRef);
  const responseManifestSha256 = sha256(value.responseManifestSha256);
  const lineageRawArtifactRef = nonEmptyString(value.rawArtifactRef);
  const lineageRawArtifactSha256 = sha256(value.rawArtifactSha256);
  if (
    !operationId ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(operationId) ||
    operationId === ".." ||
    !requestManifestRef ||
    !requestManifestSha256 ||
    !responseManifestRef ||
    !responseManifestSha256 ||
    lineageRawArtifactRef !== rawArtifactRef ||
    lineageRawArtifactSha256 !== rawArtifactSha256
  ) {
    return undefined;
  }
  return {
    operationId,
    requestManifestRef,
    requestManifestSha256,
    responseManifestRef,
    responseManifestSha256,
    rawArtifactRef: lineageRawArtifactRef,
    rawArtifactSha256: lineageRawArtifactSha256
  };
};

const isPositiveQuestionRelevance = (
  value: unknown,
  retrievalId: string,
  retrievedAt: string,
  researchQuestion: ApprovedResearchQuestion
): value is RetrievedSourceEvidenceCandidate["questionRelevance"] => {
  if (
    !isRecord(value) ||
    !hasOnlyKeys(value, [
      "assessmentArtifactRef",
      "assessmentArtifactSha256",
      "decisionArtifactRef",
      "decisionArtifactSha256",
      "assessment",
      "decision"
    ]) ||
    !isRecord(value.assessment) ||
    !isRecord(value.decision)
  ) {
    return false;
  }
  const assessment = value.assessment;
  const decision = value.decision;
  if (
    !hasOnlyKeys(assessment, [
      "schemaVersion",
      "id",
      "status",
      "runId",
      "sourceItemId",
      "researchQuestionId",
      "researchQuestionArtifactRef",
      "researchQuestionArtifactSha256",
      "sourceDocumentId",
      "sourceDocumentArtifactRef",
      "sourceDocumentArtifactSha256",
      "assessedAt",
      "modelInvocation",
      "verdict",
      "rationale",
      "support",
      "limitations"
    ]) ||
    !hasOnlyKeys(decision, [
      "assessmentId",
      "verdict",
      "destination",
      "approvalStatus",
      "ruleId",
      "reason"
    ]) ||
    !nonEmptyString(value.assessmentArtifactRef) ||
    !sha256(value.assessmentArtifactSha256) ||
    !nonEmptyString(value.decisionArtifactRef) ||
    !sha256(value.decisionArtifactSha256) ||
    assessment.schemaVersion !== "question-relevance-assessment-v1" ||
    assessment.status !== "proposed" ||
    assessment.runId !== researchQuestion.runId ||
    assessment.sourceItemId !== retrievalId ||
    assessment.researchQuestionId !== researchQuestion.id ||
    assessment.researchQuestionArtifactRef !== researchQuestion.artifactRef ||
    assessment.researchQuestionArtifactSha256 !== researchQuestion.artifactSha256 ||
    !nonEmptyString(assessment.id) ||
    !nonEmptyString(assessment.sourceDocumentId) ||
    !nonEmptyString(assessment.sourceDocumentArtifactRef) ||
    !sha256(assessment.sourceDocumentArtifactSha256) ||
    !nonEmptyString(assessment.assessedAt) ||
    Number.isNaN(Date.parse(assessment.assessedAt as string)) ||
    Date.parse(assessment.assessedAt as string) < Date.parse(retrievedAt) ||
    (assessment.verdict !== "relevant" &&
      assessment.verdict !== "partially-relevant") ||
    !nonEmptyString(assessment.rationale) ||
    !Array.isArray(assessment.support) ||
    assessment.support.length === 0 ||
    !stringArray(assessment.limitations) ||
    !isRecord(assessment.modelInvocation)
  ) {
    return false;
  }
  const invocation = assessment.modelInvocation;
  if (
    !hasOnlyKeys(invocation, [
      "id",
      "provider",
      "model",
      "promptPolicyVersion",
      "promptArtifactRef",
      "promptArtifactSha256",
      "responseArtifactRef",
      "responseArtifactSha256",
      "startedAt",
      "completedAt"
    ]) ||
    !nonEmptyString(invocation.id) ||
    !nonEmptyString(invocation.provider) ||
    !nonEmptyString(invocation.model) ||
    invocation.promptPolicyVersion !== "question-relevance-prompt-v1" ||
    !nonEmptyString(invocation.promptArtifactRef) ||
    !sha256(invocation.promptArtifactSha256) ||
    !nonEmptyString(invocation.responseArtifactRef) ||
    !sha256(invocation.responseArtifactSha256) ||
    !nonEmptyString(invocation.startedAt) ||
    !nonEmptyString(invocation.completedAt) ||
    Number.isNaN(Date.parse(invocation.startedAt as string)) ||
    Number.isNaN(Date.parse(invocation.completedAt as string)) ||
    Date.parse(invocation.startedAt as string) >
      Date.parse(invocation.completedAt as string) ||
    Date.parse(invocation.completedAt as string) >
      Date.parse(assessment.assessedAt as string)
  ) {
    return false;
  }
  const anchorsValid = assessment.support.every((entry) => {
    if (
      !isRecord(entry) ||
      !hasOnlyKeys(entry, ["anchor", "relationToQuestion"]) ||
      !isRecord(entry.anchor) ||
      !nonEmptyString(entry.relationToQuestion)
    ) {
      return false;
    }
    const anchor = entry.anchor;
    return (
      hasOnlyKeys(anchor, [
        "sourceDocumentId",
        "sourceDocumentArtifactRef",
        "sourceDocumentArtifactSha256",
        "segmentId",
        "segmentSha256",
        "quote",
        "quoteStartUtf8Byte",
        "quoteEndUtf8Byte"
      ]) &&
      anchor.sourceDocumentId === assessment.sourceDocumentId &&
      anchor.sourceDocumentArtifactRef === assessment.sourceDocumentArtifactRef &&
      anchor.sourceDocumentArtifactSha256 ===
        assessment.sourceDocumentArtifactSha256 &&
      Boolean(nonEmptyString(anchor.segmentId)) &&
      Boolean(sha256(anchor.segmentSha256)) &&
      Boolean(nonEmptyString(anchor.quote)) &&
      Number.isInteger(anchor.quoteStartUtf8Byte) &&
      Number.isInteger(anchor.quoteEndUtf8Byte) &&
      (anchor.quoteStartUtf8Byte as number) >= 0 &&
      (anchor.quoteEndUtf8Byte as number) >
        (anchor.quoteStartUtf8Byte as number)
    );
  });
  return (
    anchorsValid &&
    decision.assessmentId === assessment.id &&
    decision.verdict === assessment.verdict &&
    decision.destination === "evidence_candidate_proposal" &&
    decision.approvalStatus === "pending_human_review" &&
    Boolean(nonEmptyString(decision.ruleId)) &&
    Boolean(nonEmptyString(decision.reason))
  );
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
    !isRecord(value.retrievalLineage)
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
    !isPositiveQuestionRelevance(
      value.questionRelevance,
      retrievalId,
      retrievedAt,
      researchQuestionResult.value
    )
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
    questionRelevance: value.questionRelevance,
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
  const rawArtifactSha256 = sha256(value.rawArtifactSha256);
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
    !rawArtifactSha256 ||
    !sourceLinks ||
    typeof value.referenceCount !== "number" ||
    !Number.isInteger(value.referenceCount) ||
    value.referenceCount < 0 ||
    typeof value.hasSourceMetadata !== "boolean" ||
    value.contentCompleteness !== "captured_content"
  ) {
    return err("INVALID_INTAKE_ARTIFACT");
  }
  const collectionLineage = readSeeristCollectionLineage(
    value.collectionLineage,
    rawArtifactRef,
    rawArtifactSha256
  );
  if (!collectionLineage) {
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
    rawArtifactSha256,
    collectionLineage,
    sourceLinks,
    referenceCount: value.referenceCount,
    hasSourceMetadata: value.hasSourceMetadata,
    researchQuestion: researchQuestionResult.value,
    role: "evidence_candidate",
    contentCompleteness: "captured_content"
  });
};

const matchesQuestionRelevanceArtifacts = (
  value: unknown,
  item: RetrievedSourceEvidenceCandidate
): boolean =>
  isRecord(value) &&
  hasOnlyKeys(value, [
    "assessmentArtifactSha256",
    "decisionArtifactSha256",
    "assessment",
    "decision"
  ]) &&
  sha256(value.assessmentArtifactSha256) ===
    item.questionRelevance.assessmentArtifactSha256 &&
  sha256(value.decisionArtifactSha256) ===
    item.questionRelevance.decisionArtifactSha256 &&
  isDeepStrictEqual(value.assessment, item.questionRelevance.assessment) &&
  isDeepStrictEqual(value.decision, item.questionRelevance.decision);

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
    !matchesQuestionRelevanceArtifacts(
      input.questionRelevanceArtifacts,
      itemResult.value
    )
  ) {
    return err("QUESTION_RELEVANCE_ARTIFACT_MISMATCH");
  }
  const recordedRawArtifactSha256 =
    itemResult.value.provider === "source_retrieval"
      ? itemResult.value.retrievalLineage.rawArtifactSha256
      : itemResult.value.rawArtifactSha256;
  if (recordedRawArtifactSha256 !== rawArtifactSha256) {
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
  if (sourceRunId !== itemResult.value.researchQuestion.runId) {
    return err("RESEARCH_QUESTION_RUN_MISMATCH");
  }
  if (itemResult.value.provider === "seerist") {
    return err("NATIVE_CANDIDATE_REQUIRES_QUESTION_RELEVANCE");
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